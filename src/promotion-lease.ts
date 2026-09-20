import { z } from "zod";

export const promotionLeaseSchema = z
  .object({
    owner: z.string().min(1).max(256),
    until: z.number().int().nonnegative(),
  })
  .strict();

export type PromotionLease = z.infer<typeof promotionLeaseSchema>;

export function capturePromotionLease(
  input: unknown,
  now: number,
): PromotionLease {
  const validNow = z.number().int().nonnegative().parse(now);
  const lease = promotionLeaseSchema.parse(input);
  if (lease.until <= validNow) throw new Error("Promotion lease is expired");
  return lease;
}
