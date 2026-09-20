import { z } from "zod";

const timingSchema = z.looseObject({
  activeMs: z.number().nonnegative().nullable().optional(),
});

const proofSchema = z.looseObject({
  timing: timingSchema.optional(),
});

const entrySchema = z.looseObject({
  proof: proofSchema.nullable(),
});

const attemptsSchema = z.array(entrySchema).max(20);

export function verificationHistoryAccounting(
  attempts: unknown,
  completeHistory: boolean,
): {
  observedAttempts: number;
  recorded: number;
  pending: number;
  knownActiveMs: number;
  elapsedMs: number | null;
  complete: boolean;
} {
  if (attempts === undefined) {
    return {
      observedAttempts: 0,
      recorded: 0,
      pending: 0,
      knownActiveMs: 0,
      elapsedMs: null,
      complete: false,
    };
  }

  const entries = attemptsSchema.parse(attempts);
  let recorded = 0;
  let pending = 0;
  let knownActiveMs = 0;
  let everyProofTimed = true;

  for (const entry of entries) {
    const proof = entry.proof;
    if (proof === null) {
      pending += 1;
      continue;
    }

    recorded += 1;
    const activeMs = proof.timing?.activeMs;
    if (activeMs === undefined || activeMs === null) {
      everyProofTimed = false;
      continue;
    }

    const nextTotal = knownActiveMs + activeMs;
    if (!Number.isFinite(nextTotal)) {
      throw new Error("known active time overflow");
    }
    knownActiveMs = nextTotal;
  }

  const complete = completeHistory && pending === 0 && everyProofTimed;
  return {
    observedAttempts: entries.length,
    recorded,
    pending,
    knownActiveMs,
    elapsedMs: complete ? knownActiveMs : null,
    complete,
  };
}
