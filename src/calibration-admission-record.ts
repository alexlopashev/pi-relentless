import { z } from "zod";
import { observationsSchema } from "./model-evidence.js";
export const calibrationAdmissionSchema = z.strictObject({
  admittedAt: z.number().int().nonnegative().refine(Number.isSafeInteger),
  observations: observationsSchema,
  codingCheckpoints: z.record(
    z.string().regex(/^[a-f0-9]{64}$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
  workflowCheckpoints: z.record(
    z.string().regex(/^[a-f0-9]{64}$/),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  ),
});
export type CalibrationAdmission = z.infer<typeof calibrationAdmissionSchema>;
