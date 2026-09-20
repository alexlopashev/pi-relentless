import { z } from "zod";
import { goalWorkOriginSchema } from "./goal-work-origin.js";
import { failureKind } from "./failures.js";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().min(0).max(5);
const time = z.number().int().nonnegative();
/** Observed journal state, not dispatch permission or additional attempt usage. */
export const goalWorkProgressSchema = z
  .strictObject({
    codingId: z.string().min(1).max(200),
    origin: goalWorkOriginSchema,
    checkpointSha256: sha,
    workflowSha256: sha,
    authorAttempts: count,
    authorMaxAttempts: z.number().int().min(1).max(5),
    reviewPairsUsed: count,
    maxReviewPairs: z.number().int().min(1).max(5),
    codingStatus: z.enum([
      "ready",
      "running",
      "ambiguous",
      "waiting_retry",
      "ready_for_review",
      "blocked",
      "exhausted",
      "cancelled",
    ]),
    workflowPhase: z.enum([
      "coding",
      "review",
      "reviewing",
      "repair",
      "verification_required",
      "verified",
      "blocked",
    ]),
    codingRetryAt: time.nullable(),
    workflowRetryAt: time.nullable(),
    codingFailure: failureKind.nullable(),
    workflowReason: z.string().max(100).nullable(),
    observedAt: time,
  })
  .refine(
    (p) =>
      p.authorAttempts <= p.authorMaxAttempts &&
      p.reviewPairsUsed <= p.maxReviewPairs,
    "Observed budget exceeded",
  );
export type GoalWorkProgress = z.infer<typeof goalWorkProgressSchema>;
