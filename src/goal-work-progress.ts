import { createHash } from "node:crypto";
import type { CodingSnapshot } from "./coding-journal.js";
import type { WorkflowState } from "./coding-workflow.js";
import {
  goalWorkProgressSchema,
  type GoalWorkProgress,
} from "./goal-work-progress-schema.js";
import { canonicalDigest } from "./verification-assessment.js";

export function projectGoalWorkProgress(
  id: string,
  snapshot: CodingSnapshot,
  workflow: WorkflowState,
  now: number,
): GoalWorkProgress {
  if (snapshot.request.goalOrigin === undefined)
    throw new Error("Goal origin is required");
  if (workflow.expectedRevision !== snapshot.revision)
    throw new Error("Stale workflow");

  const checkpointSha256 = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  return goalWorkProgressSchema.parse({
    codingId: id,
    origin: snapshot.request.goalOrigin,
    checkpointSha256,
    workflowSha256: canonicalDigest(workflow),
    authorAttempts: snapshot.attempts,
    authorMaxAttempts: snapshot.request.maxAttempts,
    reviewPairsUsed: workflow.reviewPairsUsed,
    maxReviewPairs: workflow.maxReviewPairs,
    codingStatus: snapshot.status,
    workflowPhase: workflow.phase,
    codingRetryAt: snapshot.status === "waiting_retry" ? snapshot.dueAt : null,
    workflowRetryAt: workflow.retryAt,
    codingFailure: snapshot.failures.at(-1)?.kind ?? null,
    workflowReason: workflow.reason,
    observedAt: now,
  });
}
