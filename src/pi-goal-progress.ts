import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { Ledger, requireGoal, digest } from "./ledger.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { assertGoalWork } from "./goal-work.js";
import { projectGoalWorkProgress } from "./goal-work-progress.js";
import { recordGoalWorkProgress } from "./goal-work-progress-record.js";
interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}
/** Synchronize observations; execution, retry, and completion remain separate actions. */
export async function syncPiGoalWork(id: string, context: Context) {
  const check = () => {
    if (context.signal?.aborted || !context.isProjectTrusted())
      throw new Error("Project not active or trusted");
  };
  check();
  const root = await realpath(context.cwd);
  check();
  const paths = {
    goal: join(root, ".harness/ledger.sqlite"),
    coding: join(root, ".harness/coding.sqlite"),
    workflow: join(root, ".harness/workflows.sqlite"),
  };
  if (Object.values(paths).some((p) => !existsSync(p)))
    throw new Error("Missing project journals");
  const ledger = new Ledger(paths.goal);
  let coding: CodingJournal | undefined, workflows: CodingWorkflows | undefined;
  try {
    coding = new CodingJournal(paths.coding);
    workflows = new CodingWorkflows(paths.workflow);
    const fencedCoding = coding,
      fencedWorkflows = workflows;
    return ledger.transaction(
      "goal_work_progress",
      Date.now(),
      (state) => {
        check();
        const snapshot = fencedCoding.read(id),
          workflow = fencedWorkflows.read(id),
          origin = snapshot.request.goalOrigin;
        if (!origin || snapshot.request.sourceRoot !== root)
          throw new Error("Missing project goal binding");
        const goal = requireGoal(state, origin.goalId, origin.revision),
          now = Date.now();
        assertGoalWork(
          snapshot.request,
          undefined,
          "coder",
          now,
          snapshot.config,
          { codingId: id, checkpointSha256: digest(JSON.stringify(snapshot)) },
        );
        const updated = recordGoalWorkProgress(
          goal,
          projectGoalWorkProgress(id, snapshot, workflow, now),
        );
        const progress = updated.tasks.find(
          (t) => t.id === origin.taskId,
        )?.workflowProgress;
        if (!progress) throw new Error("Missing progress");
        state.goals[state.goals.indexOf(goal)] = updated;
        return progress;
      },
      { codingId: id },
      undefined,
      (commit) =>
        fencedCoding.withWriteFence(() =>
          fencedWorkflows.withWriteFence(commit),
        ),
    );
  } finally {
    workflows?.close();
    coding?.close();
    ledger.close();
  }
}
