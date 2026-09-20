import { z } from "zod";
import { reviewRequestSchema } from "./coding-review.js";
export const piCreationIntentSchema = z.strictObject({
  key: z.string().min(1).max(200),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  root: z.string().min(1).max(4096),
  review: reviewRequestSchema,
  maxReviewPairs: z.number().int().min(1).max(5),
});
export type PiCreationIntent = z.infer<typeof piCreationIntentSchema>;
export interface SavedPiCreation {
  id: string;
  intent: PiCreationIntent;
  checkpointSha256: string;
}
