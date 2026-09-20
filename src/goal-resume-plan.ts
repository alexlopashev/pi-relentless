import { z } from "zod";

export const goalResumeIntentSchema = z
  .object({
    id: z.string().min(1).max(200),
    revision: z.number().int().positive(),
  })
  .strict();

export function planGoalResume(
  intent: z.infer<typeof goalResumeIntentSchema>,
  goal: { id: string; revision: number; status: string; deadlineAt?: number },
  now: number,
): "resume" | "goal_changed" | "inactive" | "expired" {
  goalResumeIntentSchema.parse(intent);

  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Invalid now");
  }
  if (
    goal.deadlineAt !== undefined &&
    (!Number.isSafeInteger(goal.deadlineAt) || goal.deadlineAt < 0)
  ) {
    throw new Error("Invalid deadline");
  }

  if (goal.id !== intent.id || goal.revision !== intent.revision) {
    return "goal_changed";
  }
  if (goal.status !== "active") {
    return "inactive";
  }
  if (goal.deadlineAt !== undefined && goal.deadlineAt <= now) {
    return "expired";
  }
  return "resume";
}
