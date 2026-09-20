import { z } from "zod";
import { wilsonLower95 } from "./evidence-confidence.js";
import type { Route } from "./router.js";

const billingSchema = z.enum(["subscription", "metered", "local"]);
const identityString = z.string().min(1).max(200);

export const observationSchema = z.strictObject({
  id: identityString,
  provider: identityString,
  billing: billingSchema,
  model: z.string().min(1).max(300),
  effort: z.string().min(1).max(20),
  workload: identityString,
  suiteHash: z.string().regex(/^[a-f0-9]{64}$/),
  caseId: identityString,
  completedAt: z.number().int().nonnegative(),
  accepted: z.boolean(),
  elapsedMs: z.number().positive().nullable(),
  activeMs: z.number().positive().nullable().optional(),
  estimatedUsd: z.number().nonnegative().nullable(),
});

export const observationsSchema = z
  .array(observationSchema)
  .max(10000)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    "Duplicate observation IDs",
  );

export const optimizationSchema = z.strictObject({
  workload: identityString,
  suiteHash: z.string().regex(/^[a-f0-9]{64}$/),
  caseIds: z
    .array(identityString)
    .min(2)
    .max(100)
    .refine(
      (caseIds) => new Set(caseIds).size === caseIds.length,
      "Duplicate case IDs",
    ),
  metric: z.enum(["latency", "cost", "activeTime"]),
  minSamples: z.number().int().min(3).max(10000).default(3),
  minCases: z.number().int().min(2).default(2),
  minCaseSamples: z.number().int().min(1).max(10000).optional(),
  minCaseSuccessRate: z.number().min(0.5).max(1).optional(),
  minCaseLowerBound95: z.number().min(0).max(1).optional(),
  minSuccessRate: z.number().min(0.5).max(1).default(0.8),
  maxAgeMs: z.number().int().positive().max(2592000000).default(86400000),
});

export type Observation = z.infer<typeof observationSchema>;
export interface CaseEvidence {
  caseId: string;
  samples: number;
  successes: number;
  successRate: number;
  lowerBound95: number;
}
export interface RankedRoute {
  route: Route;
  cases: CaseEvidence[];
  samples: number;
  successes: number;
  distinctCases: number;
  successRate: number;
  score: number;
  metric: "latency" | "cost" | "activeTime";
}
export interface RouteAssessment extends Omit<RankedRoute, "score"> {
  score: number | null;
  qualified: boolean;
  reasons: string[];
}

type Options = z.infer<typeof optimizationSchema>;

function assessOne(
  route: Route,
  rows: Observation[],
  options: Options,
  now: number,
): RouteAssessment {
  const declaredCases = new Set(options.caseIds);
  const matching = rows.filter(
    (row) =>
      row.provider === route.candidate.provider &&
      row.billing === route.candidate.billing &&
      row.model === route.candidate.model &&
      row.effort === route.effort &&
      row.workload === options.workload &&
      row.suiteHash === options.suiteHash &&
      declaredCases.has(row.caseId) &&
      row.completedAt <= now &&
      now - row.completedAt <= options.maxAgeMs,
  );
  const counts = new Map<string, number>();
  matching.forEach((row) =>
    counts.set(row.caseId, (counts.get(row.caseId) ?? 0) + 1),
  );
  const perCase = counts.get(options.caseIds[0] ?? "") ?? 0;
  const balanced =
    perCase > 0 &&
    options.caseIds.every((caseId) => counts.get(caseId) === perCase);
  const cases = options.caseIds.map((caseId): CaseEvidence => {
    const trials = matching.filter((row) => row.caseId === caseId);
    const successes = trials.filter((row) => row.accepted).length;
    return {
      caseId,
      samples: trials.length,
      successes,
      successRate: trials.length ? successes / trials.length : 0,
      lowerBound95: wilsonLower95(successes, trials.length),
    };
  });
  const samples = matching.length;
  const successes = matching.filter((row) => row.accepted).length;
  const distinctCases = counts.size;
  const successRate = samples === 0 ? 0 : successes / samples;
  const reasons: string[] = [];
  if (!balanced) reasons.push("unbalanced_cases");
  if (cases.some((c) => c.samples < (options.minCaseSamples ?? 1)))
    reasons.push("case_samples");
  if (
    cases.some(
      (c) =>
        c.successRate < (options.minCaseSuccessRate ?? options.minSuccessRate),
    )
  )
    reasons.push("case_success_rate");
  if (cases.some((c) => c.lowerBound95 < (options.minCaseLowerBound95 ?? 0)))
    reasons.push("case_confidence");
  if (samples < options.minSamples) reasons.push("samples");
  if (distinctCases < options.minCases) reasons.push("cases");
  if (successes === 0) reasons.push("no_successes");
  if (successRate < options.minSuccessRate) reasons.push("success_rate");
  const missing =
    options.metric === "cost"
      ? matching.some((row) => row.estimatedUsd === null)
      : options.metric === "latency"
        ? matching.some((row) => row.elapsedMs === null)
        : matching.some(
            (row) => row.activeMs === null || row.activeMs === undefined,
          );
  if (missing) reasons.push("missing_metric");
  let score: number | null = null;
  if (!missing && successes > 0) {
    const total = matching.reduce((sum, row) => {
      if (options.metric === "cost") return sum + (row.estimatedUsd ?? 0);
      if (options.metric === "latency") return sum + (row.elapsedMs ?? 0);
      return sum + (row.activeMs ?? 0);
    }, 0);
    score = total / successes;
    if (!Number.isFinite(score)) {
      score = null;
      reasons.push("nonfinite_score");
    }
  }
  const qualified = reasons.length === 0 && score !== null;
  return {
    route,
    cases,
    samples,
    successes,
    distinctCases,
    successRate,
    score: qualified ? score : null,
    metric: options.metric,
    qualified,
    reasons,
  };
}

export function assessRoutes(
  routes: Route[],
  evidence: unknown,
  policy: unknown,
  now: number,
): RouteAssessment[] {
  if (!Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0)
    throw new Error("Invalid now");
  const rows = observationsSchema.parse(evidence);
  const options = optimizationSchema.parse(policy);
  return routes.map((route) => assessOne(route, rows, options, now));
}

export function rankRoutes(
  routes: Route[],
  evidence: unknown,
  policy: unknown,
  now: number,
): RankedRoute[] {
  return assessRoutes(routes, evidence, policy, now)
    .map((assessment, index) => ({ assessment, index }))
    .filter((item) => item.assessment.qualified)
    .sort(
      (a, b) =>
        (a.assessment.score ?? 0) - (b.assessment.score ?? 0) ||
        a.index - b.index,
    )
    .map(({ assessment }) => {
      const { score } = assessment;
      if (score === null) throw new Error("Unqualified route");
      return {
        route: assessment.route,
        cases: assessment.cases,
        samples: assessment.samples,
        successes: assessment.successes,
        distinctCases: assessment.distinctCases,
        successRate: assessment.successRate,
        score,
        metric: assessment.metric,
      };
    });
}
