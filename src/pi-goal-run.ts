import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Ledger } from "./ledger.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { canonicalDigest } from "./verification-assessment.js";
import { loadPiProjectConfig } from "./pi-project-config.js";
import { stepPiGoal } from "./pi-goal-step.js";
import { planGoalRun } from "./goal-run-plan.js";
type Context = Parameters<typeof stepPiGoal>[1];
type Step = Awaited<ReturnType<typeof stepPiGoal>>;
export interface GoalRunDrivers {
  step?: (id: string, context: Context) => Promise<Step>;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  progress?: (result: Step) => void;
}
function fingerprint(root: string, id: string): string {
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"), {
    readOnly: true,
  });
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(join(root, ".harness/workflows.sqlite"), {
      readOnly: true,
    });
    return canonicalDigest({
      coding: coding.read(id),
      workflow: workflows.read(id),
    });
  } finally {
    workflows?.close();
    coding.close();
  }
}
/** Foreground supervision: waits survive in workflow journals, not in model context. */
export async function runPiGoal(
  goalId: string,
  context: Context,
  drivers: GoalRunDrivers = {},
) {
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project inactive");
  const root = await realpath(context.cwd);
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project inactive");
  const path = join(root, ".harness/ledger.sqlite");
  if (!existsSync(path)) throw new Error("Missing goal ledger");
  const ledger = new Ledger(path);
  const signal = context.signal ?? new AbortController().signal;
  let actions = 0,
    last: Step | null = null;
  const summary = (reason: string) => ({ goalId, reason, actions, last });
  try {
    const revision = ledger.goal(goalId).revision;
    const status = (): string | null => {
      if (signal.aborted) return "interrupted";
      if (!context.isProjectTrusted()) return "trust_lost";
      const goal = ledger.goal(goalId);
      if (goal.status !== "active") return goal.status;
      if (goal.revision !== revision) return "goal_changed";
      if (
        goal.contract.deadlineAt !== undefined &&
        goal.contract.deadlineAt <= Date.now()
      )
        return "expired";
      return null;
    };
    const scoped: Context = {
      ...context,
      cwd: root,
      signal,
      isProjectTrusted: () => {
        if (signal.aborted || !context.isProjectTrusted()) return false;
        const goal = ledger.goal(goalId);
        return (
          goal.revision === revision &&
          ["active", "completed"].includes(goal.status) &&
          (goal.contract.deadlineAt === undefined ||
            goal.contract.deadlineAt > Date.now())
        );
      },
    };
    const seen = new Map<string, string>();
    const step = drivers.step ?? stepPiGoal;
    for (;;) {
      const stopped = status();
      if (stopped) return summary(stopped);
      const project = await loadPiProjectConfig(root, true);
      const changed = status();
      if (changed) return summary(changed);
      if (!project) throw new Error("Missing project policy");
      const goal = ledger.goal(goalId);
      if (
        [
          ...project.routing.candidates,
          ...goal.contract.config.candidates,
        ].some((c) => c.enabled && c.provider === "qwen-token-plan-individual")
      )
        throw new Error(
          "Alibaba Personal is not authorized for unattended goal execution",
        );
      const observedAt = Date.now();
      last = await step(goalId, scoped);
      if (last.action !== "idle") actions++;
      drivers.progress?.(last);
      const after = status();
      if (after) return summary(after);
      if (
        last.action !== "idle" &&
        last.action !== "admitted" &&
        last.codingId
      ) {
        const current = fingerprint(root, last.codingId);
        if (seen.get(last.codingId) === current) return summary("no_progress");
        seen.set(last.codingId, current);
      }
      const decision = planGoalRun(last, observedAt, goal.contract.deadlineAt);
      if (decision.kind === "stop") return summary(decision.reason);
      if (decision.kind === "continue") continue;
      // Do not reacquire leases or write observation events just to poll a timer.
      // Recheck user cancellation/revision/deadline at most one second apart.
      while (Date.now() < decision.until) {
        const stopped = status();
        if (stopped) return summary(stopped);
        const ms = Math.min(1000, decision.until - Date.now());
        if (ms <= 0) break;
        try {
          if (drivers.wait) await drivers.wait(ms, signal);
          else await sleep(ms, undefined, { signal });
        } catch (error) {
          if (signal.aborted) return summary("interrupted");
          throw error;
        }
      }
    }
  } finally {
    ledger.close();
  }
}
