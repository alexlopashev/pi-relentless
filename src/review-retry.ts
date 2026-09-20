import { z } from "zod";
import { retryAt } from "./coding-recovery.js";

const reportSchema = z.looseObject({
  status: z.string(),
  failureStage: z.string().optional(),
  failure: z.string().optional(),
  retryAfterMs: z
    .number()
    .refine((value) => Number.isSafeInteger(value) && value >= 0)
    .optional(),
});

function assertBudget(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    throw new Error(`${name} must be a safe integer from 1 through 5`);
  }
}

export function reviewCooldownAt(
  report: unknown,
  usedPairs: number,
  now: number,
): number | null {
  assertBudget(usedPairs, "usedPairs");
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error("now must be a safe nonnegative integer");
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) throw new TypeError("Invalid review retry report");
  if (
    parsed.data.status !== "failed" ||
    parsed.data.failureStage !== "inference" ||
    !["quota", "outage", "unavailable"].includes(parsed.data.failure ?? "")
  )
    return null;
  return retryAt(usedPairs, parsed.data.retryAfterMs, now);
}
export function reviewRetryAt(
  report: unknown,
  usedPairs: number,
  maxPairs: number,
  now: number,
): number | null {
  assertBudget(usedPairs, "usedPairs");
  assertBudget(maxPairs, "maxPairs");
  if (usedPairs > maxPairs)
    throw new Error("usedPairs must not exceed maxPairs");
  const due = reviewCooldownAt(report, usedPairs, now);
  return usedPairs < maxPairs ? due : null;
}
