import { z } from "zod";
import { realpath } from "node:fs/promises";
import { codingSchema } from "./coding-worker.js";
import { createPiWork } from "./pi-work-create.js";
import { readGoalWork } from "./goal-work.js";
const inputSchema = z.strictObject({
  goalId: z.string().min(1),
  taskId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  files: codingSchema.shape.files,
});
export async function createPiGoalWork(
  text: string,
  context: Parameters<typeof createPiWork>[1],
) {
  if (!context.isProjectTrusted() || context.signal?.aborted)
    throw new Error("Project not active or trusted");
  if (Buffer.byteLength(text) > 65536)
    throw new Error("Goal handoff exceeds 64 KiB");
  const input = inputSchema.parse(JSON.parse(text) as unknown);
  const root = await realpath(context.cwd);
  if (!context.isProjectTrusted() || context.signal?.aborted)
    throw new Error("Project not active or trusted");
  const goal = readGoalWork(root, input.goalId, input.taskId);
  if (goal.goalOrigin.revision !== input.expectedRevision)
    throw new Error("Stale goal revision");
  return createPiWork(
    JSON.stringify({
      task: goal.task,
      context: goal.context,
      goalOrigin: goal.goalOrigin,
      files: input.files,
      maxAttempts: goal.maxAttempts,
      reviewTask: goal.reviewTask,
      maxReviewPairs: goal.maxReviewPairs,
    }),
    context,
  );
}
