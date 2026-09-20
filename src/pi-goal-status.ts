import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { readGoalDocument } from "./goal-work.js";
import { CodingJournal, type CodingSnapshot } from "./coding-journal.js";
import { CodingWorkflows, type WorkflowState } from "./coding-workflow.js";

interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}

type WorkflowSummary = Pick<
  WorkflowState,
  "phase" | "reason" | "reviewPairsUsed" | "maxReviewPairs" | "retryAt"
> & { currentCodingRevision: boolean };

interface Work {
  codingId: string;
  goalRevision: number;
  currentRevision: boolean;
  authorAttempts: number;
  authorMaxAttempts: number;
  codingStatus: CodingSnapshot["status"];
  retryAt: number | null;
  failure: CodingSnapshot["failures"][number] | null;
  workflow: WorkflowSummary | null;
}

function check(context: Context): void {
  if (!context.isProjectTrusted()) throw new Error("Project is not trusted");
  if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function readPiGoalStatus(id: string, context: Context) {
  check(context);
  const root = await realpath(context.cwd);
  check(context);
  const goal = readGoalDocument(root, id);
  const workByTask = new Map<string, Work[]>();
  const codingPath = join(root, ".harness/coding.sqlite");
  const workflowPath = join(root, ".harness/workflows.sqlite");

  if (existsSync(codingPath)) {
    const ids: string[] = [];
    const scan = new DatabaseSync(codingPath, { readOnly: true });
    try {
      for (const row of scan.prepare("SELECT id FROM runs LIMIT 1001").all()) {
        const value = row["id"];
        if (typeof value !== "string")
          throw new Error("Corrupt coding journal");
        ids.push(value);
      }
      if (ids.length > 1000) throw new Error("Too many coding runs");
    } finally {
      scan.close();
    }

    let journal: CodingJournal | undefined;
    let workflows: CodingWorkflows | undefined;
    try {
      journal = new CodingJournal(codingPath, { readOnly: true });
      if (existsSync(workflowPath))
        workflows = new CodingWorkflows(workflowPath, { readOnly: true });
      for (const codingId of ids) {
        const snapshot = journal.read(codingId);
        const origin = snapshot.request.goalOrigin;
        if (
          !origin ||
          snapshot.request.sourceRoot !== root ||
          origin.goalId !== id ||
          !goal.tasks.some((task) => task.id === origin.taskId)
        )
          continue;
        let workflow: WorkflowSummary | null = null;
        if (workflows?.has(codingId)) {
          const state = workflows.read(codingId);
          workflow = {
            phase: state.phase,
            reason: state.reason,
            reviewPairsUsed: state.reviewPairsUsed,
            maxReviewPairs: state.maxReviewPairs,
            retryAt: state.retryAt,
            currentCodingRevision: state.expectedRevision === snapshot.revision,
          };
        }
        const item: Work = {
          codingId,
          goalRevision: origin.revision,
          currentRevision: origin.revision === goal.revision,
          authorAttempts: snapshot.attempts,
          authorMaxAttempts: snapshot.request.maxAttempts,
          codingStatus: snapshot.status,
          retryAt: snapshot.status === "waiting_retry" ? snapshot.dueAt : null,
          failure: snapshot.failures.at(-1) ?? null,
          workflow,
        };
        const existing = workByTask.get(origin.taskId) ?? [];
        existing.push(item);
        workByTask.set(origin.taskId, existing);
      }
    } finally {
      workflows?.close();
      journal?.close();
    }
  }

  check(context);
  return {
    goalId: goal.id,
    revision: goal.revision,
    status: goal.status,
    objective: goal.contract.objective,
    observedAt: Date.now(),
    tasks: goal.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      goalRecordedAttempts: task.attempts,
      work: workByTask.get(task.id) ?? [],
    })),
  };
}
