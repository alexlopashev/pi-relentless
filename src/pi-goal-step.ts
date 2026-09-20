import { readPiSettingsSnapshot } from "./pi-config-proposal.js";
import { inspectPiGoalWork } from "./pi-goal-admission.js";
import { promoteWorkflow } from "./workflow-promotion.js";
import { capturePromotionLease } from "./promotion-lease.js";
import { goalPromotionDirectory } from "./goal-source-installation.js";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Ledger, digest } from "./ledger.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { readSource } from "./coding-worker.js";
import { planGoalWork } from "./goal-work-plan.js";
import { withGoalStepLease } from "./goal-step-lease.js";
import { createPiGoalWork } from "./pi-goal-work.js";
import { workflowCli } from "./workflow-cli.js";
import { assertPiDispatch } from "./pi-dispatch-policy.js";
import { executionSchema, readSpecification } from "./workflow-verification.js";
import { stepWorkflowVerification } from "./workflow-verification-step.js";
import { canonicalDigest } from "./verification-assessment.js";
import { admitPiGoalWork } from "./pi-goal-admission.js";
import { collectPiGoalProgress } from "./pi-goal-collection.js";
type Context = Parameters<typeof createPiGoalWork>[1];
type Options = NonNullable<Parameters<typeof workflowCli>[2]>;
export interface GoalStepDrivers {
  advance?: (id: string, options: Options) => ReturnType<typeof workflowCli>;
  pack?: (input: string, output: string) => Promise<number>;
  run?: (input: string, output: string) => Promise<number>;
}
/** One bounded foreground workflow action, including explicitly opted-in installation. */
export async function stepPiGoal(
  goalId: string,
  context: Context,
  drivers: GoalStepDrivers = {},
) {
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project inactive");
  const root = await realpath(context.cwd);
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project inactive");
  const path = join(root, ".harness/ledger.sqlite");
  if (!existsSync(path)) throw new Error("Missing goal ledger");
  const ledger = new Ledger(path);
  try {
    const initial = planGoalWork(ledger.goal(goalId), Date.now());
    if (initial.status !== "active")
      return {
        goalId,
        action: "idle",
        phase: initial.status,
        taskId: null,
        codingId: null,
        skipped: initial.blocked,
      };
    return await withGoalStepLease(
      ledger,
      goalId,
      context,
      async (signal, check, fence) => {
        const scoped = {
          ...context,
          cwd: root,
          signal,
          isProjectTrusted: () => {
            check();
            return context.isProjectTrusted();
          },
        };
        const goal = ledger.goal(goalId),
          plan = planGoalWork(goal, Date.now());
        const skipped: { id: string; reason: string; retryAt?: number }[] = [
          ...plan.blocked,
        ];
        for (const taskId of plan.tasks) {
          check();
          const spec = goal.contract.tasks.find((t) => t.id === taskId);
          if (spec?.acceptance.kind !== "workflow" || !spec.acceptance.work)
            throw new Error("Missing work declaration");
          const work = spec.acceptance.work,
            expected = spec.acceptance.specificationSha256;
          const dependenciesApplied = async () => {
            for (const id of spec.dependsOn) {
              const dep = goal.tasks.find((t) => t.id === id);
              if (!dep?.workflowAdmission) continue;
              for (const f of dep.workflowAdmission.files) {
                check();
                if (digest(await readSource(root, f.path)) !== f.sha256)
                  return false;
                check();
              }
            }
            return true;
          };
          if (!(await dependenciesApplied())) {
            skipped.push({
              id: taskId,
              reason: "dependency_sources_not_applied",
            });
            continue;
          }
          const boundary = async () => {
            check();
            const execution = executionSchema.parse(
              await readSpecification(resolve(root, work.verificationFile)),
            );
            check();
            if (canonicalDigest(execution) !== expected)
              throw new Error("Goal verification contract changed");
            if (!(await dependenciesApplied()))
              throw new Error("Dependency sources changed");
            check();
            return execution;
          };
          await boundary();
          const created = await createPiGoalWork(
            JSON.stringify({
              goalId,
              taskId,
              expectedRevision: goal.revision,
              files: work.files,
            }),
            scoped,
          );
          check();
          if (created.phase === "creation_incomplete") {
            skipped.push({ id: taskId, reason: "creation_incomplete" });
            continue;
          }
          const coding = new CodingJournal(
            join(root, ".harness/coding.sqlite"),
          );
          let workflows: CodingWorkflows | undefined;
          try {
            workflows = new CodingWorkflows(
              join(root, ".harness/workflows.sqlite"),
            );
            const state = workflows.read(created.id),
              snapshot = coding.read(created.id),
              now = Date.now();
            if (
              state.phase === "blocked" ||
              ["blocked", "exhausted", "cancelled", "ambiguous"].includes(
                snapshot.status,
              )
            ) {
              skipped.push({
                id: taskId,
                reason: state.reason ?? snapshot.status,
              });
              continue;
            }
            if (snapshot.lease && snapshot.lease.until > now) {
              skipped.push({
                id: taskId,
                reason: "running",
                retryAt: snapshot.lease.until,
              });
              continue;
            }
            const retryAt = Math.max(
              state.retryAt ?? 0,
              snapshot.status === "waiting_retry" ? snapshot.dueAt : 0,
            );
            if (retryAt > now) {
              skipped.push({ id: taskId, reason: "waiting_retry", retryAt });
              continue;
            }
            const summary = { goalId, taskId, codingId: created.id, skipped };
            let result;
            if (state.phase === "verified") {
              await boundary();
              if (work.integration === "verified") {
                const inspected = await inspectPiGoalWork(created.id, scoped);
                check();
                const lease = capturePromotionLease(
                  ledger.read().lease,
                  Date.now(),
                );
                const directory = goalPromotionDirectory(
                  root,
                  created.id,
                  inspected.checkpointSha256,
                );
                await mkdir(dirname(directory), {
                  recursive: true,
                  mode: 0o700,
                });
                await promoteWorkflow(
                  workflows,
                  coding,
                  created.id,
                  directory,
                  {
                    workflowSha256: inspected.workflowSha256,
                    settingsSha256: digest(readPiSettingsSnapshot(root) ?? ""),
                    lease,
                    beforeEffect: async () => {
                      await boundary();
                    },
                  },
                );
                check();
              }
              await admitPiGoalWork(created.id, scoped);
              check();
              result = { ...summary, action: "admitted", phase: "completed" };
            } else if (state.phase === "verification_required") {
              const execution = await boundary();
              const next = await stepWorkflowVerification(
                workflows,
                coding,
                created.id,
                execution,
                root,
                signal,
                {
                  commitFence: fence,
                  beforeEffect: async () => {
                    await boundary();
                  },
                  ...(drivers.pack ? { pack: drivers.pack } : {}),
                  ...(drivers.run ? { run: drivers.run } : {}),
                },
              );
              check();
              result = {
                ...summary,
                action: "verification",
                phase: next.phase,
              };
            } else {
              const options: Options = {
                signal,
                commitFence: fence,
                afterDispatch: async () => {
                  await boundary();
                },
                beforeVerification: async () => {
                  await boundary();
                },
                beforeDispatch: async (role, selection, config) => {
                  await boundary();
                  await assertPiDispatch(scoped, role, selection, config);
                  check();
                },
              };
              const next = await (drivers.advance
                ? drivers.advance(created.id, options)
                : workflowCli(["resume", created.id], root, options));
              check();
              result = { ...summary, action: "workflow", phase: next.phase };
            }
            return result;
          } finally {
            workflows?.close();
            coding.close();
            const collected = await collectPiGoalProgress(created.id, {
              ...scoped,
              isProjectTrusted: () => {
                check();
                return scoped.isProjectTrusted();
              },
            });
            if (collected === "pending")
              skipped.push({ id: taskId, reason: "progress_pending" });
          }
        }
        return {
          goalId,
          taskId: null,
          codingId: null,
          action: "idle",
          phase: "waiting",
          skipped,
        };
      },
    );
  } finally {
    ledger.close();
  }
}
