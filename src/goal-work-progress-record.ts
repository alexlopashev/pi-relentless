import { goalSchema, type Goal } from "./goal-types.js";
import { goalWorkProgressSchema } from "./goal-work-progress-schema.js";
import { digest } from "./ledger.js";
/** Merge only freshly fenced observations. Counters are high-water marks, not additive usage. */
export function recordGoalWorkProgress(goal: Goal, input: unknown): Goal {
  const progress = goalWorkProgressSchema.parse(input);
  const next = goalSchema.parse(goal);
  const task = next.tasks.find((t) => t.id === progress.origin.taskId);
  const spec = next.contract.tasks.find((t) => t.id === progress.origin.taskId);
  if (
    !task ||
    spec?.acceptance.kind !== "workflow" ||
    !["active", "completed"].includes(next.status) ||
    progress.origin.goalId !== next.id ||
    progress.origin.revision !== next.revision ||
    progress.origin.contractSha256 !== digest(JSON.stringify(next.contract)) ||
    task.attempts > progress.authorAttempts
  )
    throw new Error("Goal progress binding mismatch");
  const previous = task.workflowProgress;
  if (previous) {
    if (
      previous.codingId !== progress.codingId ||
      JSON.stringify(previous.origin) !== JSON.stringify(progress.origin) ||
      previous.authorAttempts > progress.authorAttempts ||
      previous.reviewPairsUsed > progress.reviewPairsUsed ||
      previous.authorMaxAttempts !== progress.authorMaxAttempts ||
      previous.maxReviewPairs !== progress.maxReviewPairs
    )
      throw new Error("Goal progress identity or counters changed");
    if (
      JSON.stringify({ ...previous, observedAt: 0 }) ===
      JSON.stringify({ ...progress, observedAt: 0 })
    )
      return next;
  }
  task.workflowProgress = {
    ...progress,
    observedAt: Math.max(progress.observedAt, previous?.observedAt ?? 0),
  };
  next.updatedAt = Math.max(next.updatedAt, task.workflowProgress.observedAt);
  return goalSchema.parse(next);
}
