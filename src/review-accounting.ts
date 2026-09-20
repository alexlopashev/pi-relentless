import { z } from "zod";

const attemptSchema = z
  .object({
    route: z.object({
      candidate: z.object({
        billing: z.enum(["subscription", "metered", "local"]),
      }),
    }),
    elapsedMs: z.number().nonnegative().nullable(),
    estimatedUsd: z.number().nonnegative().nullable(),
  })
  .loose();

const reportSchema = z
  .object({
    status: z.string().optional(),
    attempts: z.array(attemptSchema).max(2).optional(),
  })
  .loose();

export function reviewAccounting(
  reports: readonly string[],
  reservedPairs: number,
): {
  complete: boolean;
  attempts: number;
  elapsedMs: number | null;
  estimatedUsd: number | null;
  knownMeteredUsd: number;
} {
  if (
    !Number.isSafeInteger(reservedPairs) ||
    reservedPairs < 0 ||
    reservedPairs > 5
  ) {
    throw new TypeError("reservedPairs must be a safe integer between 0 and 5");
  }
  if (
    !Array.isArray(reports) ||
    reports.length > reservedPairs ||
    reports.length > 5
  ) {
    throw new TypeError("invalid reports");
  }

  const uniqueReports = new Set<string>();
  const parsed = reports.map((text) => {
    if (typeof text !== "string" || uniqueReports.has(text)) {
      throw new TypeError("invalid or duplicate report");
    }
    uniqueReports.add(text);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new TypeError("malformed JSON");
    }
    const result = reportSchema.safeParse(json);
    if (!result.success) throw new TypeError("invalid report");
    return result.data;
  });

  const complete =
    reports.length === reservedPairs &&
    parsed.every(
      (report) =>
        report.attempts !== undefined && report.status !== "waiting_retry",
    );
  const allAttempts = parsed.flatMap((report) => report.attempts ?? []);
  let knownMeteredUsd = 0;

  for (const attempt of allAttempts) {
    if (
      attempt.route.candidate.billing === "metered" &&
      attempt.estimatedUsd !== null &&
      attempt.estimatedUsd > 0
    ) {
      knownMeteredUsd += attempt.estimatedUsd;
      if (!Number.isFinite(knownMeteredUsd))
        throw new RangeError("known metered total overflow");
    }
  }

  let elapsedMs: number | null = null;
  let estimatedUsd: number | null = null;
  if (complete) {
    let elapsed = 0;
    let estimate = 0;
    let timingKnown = true;
    let allMeteredPositive = true;
    for (const attempt of allAttempts) {
      if (attempt.elapsedMs === null) {
        timingKnown = false;
      } else {
        elapsed += attempt.elapsedMs;
        if (!Number.isFinite(elapsed)) timingKnown = false;
      }
      if (
        attempt.route.candidate.billing !== "metered" ||
        attempt.estimatedUsd === null ||
        attempt.estimatedUsd <= 0
      ) {
        allMeteredPositive = false;
      } else {
        estimate += attempt.estimatedUsd;
      }
    }
    if (timingKnown && Number.isFinite(elapsed)) elapsedMs = elapsed;
    if (allMeteredPositive && Number.isFinite(estimate))
      estimatedUsd = estimate;
  }

  return {
    complete,
    attempts: allAttempts.length,
    elapsedMs,
    estimatedUsd,
    knownMeteredUsd,
  };
}
