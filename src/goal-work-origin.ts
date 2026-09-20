import { z } from "zod";
export const goalWorkOriginSchema = z.strictObject({
  goalId: z.string().min(1),
  taskId: z.string().min(1),
  revision: z.number().int().positive(),
  contractSha256: z.string().regex(/^[a-f0-9]{64}$/),
  contextSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
