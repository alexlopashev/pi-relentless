import { installationReceiptSchema } from "./source-installation-receipt.js";
import { z } from "zod";
import { goalWorkOriginSchema } from "./goal-work-origin.js";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const goalWorkEvidenceSchema = z.strictObject({
  installation: installationReceiptSchema.optional(),
  codingId: z.string().min(1).max(200),
  origin: goalWorkOriginSchema,
  checkpointSha256: sha,
  workflowSha256: sha,
  specificationSha256: sha,
  attempts: z.number().int().min(1).max(5),
  files: z
    .array(z.strictObject({ path: z.string().min(1).max(4096), sha256: sha }))
    .min(1)
    .max(100)
    .refine(
      (files) => new Set(files.map((f) => f.path)).size === files.length,
      "Duplicate file evidence",
    ),
});
export const goalWorkAdmissionSchema = goalWorkEvidenceSchema.extend({
  admittedAt: z.number().int().nonnegative(),
});
