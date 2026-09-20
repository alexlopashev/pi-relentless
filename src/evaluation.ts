import type { EvaluationCheckpoint } from "./evaluation-checkpoint.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  configSchema,
  route,
  efforts,
  type Config,
  type Route,
} from "./router.js";
import { acceptanceSchema, accepted } from "./goal-types.js";
import { Failure, fromProviderError } from "./failures.js";
import { observationSchema, type Observation } from "./model-evidence.js";
import type { Worker } from "./swarm.js";
export const evaluationSchema = z
  .strictObject({
    workload: z.string().min(1).max(200),
    effort: z.enum(efforts),
    repeats: z.number().int().min(1).max(3).default(1),
    maxDurationMs: z.number().int().min(1000).max(600000).default(120000),
    cases: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(200),
          prompt: z.string().min(1).max(4000),
          acceptance: acceptanceSchema,
        }),
      )
      .min(2)
      .max(10),
  })
  .refine(
    (s) => new Set(s.cases.map((c) => c.id)).size === s.cases.length,
    "Duplicate case IDs",
  );
export interface EvaluationReport {
  suiteHash: string;
  observations: Observation[];
  stopped: boolean;
  reason?: string | undefined;
}
export function evaluationRoutes(input: unknown, config: Config): Route[] {
  const suite = evaluationSchema.parse(input);
  const routes = config.candidates.flatMap((c) => {
    try {
      return [
        route(
          {
            id: "evaluation",
            prompt: "evaluation",
            minQuality: 1,
            effort: suite.effort,
          },
          [c],
          config.allowMetered,
        ),
      ];
    } catch {
      return [];
    }
  });
  if (!routes.length) throw new Error("No eligible evaluation routes");
  if (routes.length * suite.cases.length * suite.repeats > 30)
    throw new Error("Evaluation request budget exceeded (30 maximum)");
  return routes;
}
export async function evaluate(
  input: unknown,
  configuration: Config,
  worker: Worker,
  clock: () => number = Date.now,
  cost: (id: string) => number | undefined = () => undefined,
  checkpoint?: EvaluationCheckpoint,
): Promise<EvaluationReport> {
  const config = configSchema.parse(configuration);
  const suite = evaluationSchema.parse(input);
  const routes = evaluationRoutes(suite, config);
  const suiteHash = createHash("sha256")
    .update(JSON.stringify({ workload: suite.workload, cases: suite.cases }))
    .digest("hex");
  let report: EvaluationReport = {
    suiteHash,
    observations: [],
    stopped: false,
  };
  checkpoint?.assertContract(suite, config);
  checkpoint?.initialize(report, clock() + suite.maxDurationMs);
  const saved = checkpoint?.read();
  if (saved?.pending)
    throw new Error("Ambiguous evaluation attempt; automatic replay forbidden");
  if (saved?.report) report = saved.report;
  if (report.stopped) return report;
  const deadline = saved?.deadline ?? clock() + suite.maxDurationMs;
  let index = 0;
  // Round-robin cases reduce order bias; this remains a small probe, not a benchmark claim.
  for (let repeat = 0; repeat < suite.repeats; repeat++)
    for (const test of suite.cases)
      for (const selection of routes) {
        if (index++ < report.observations.length) continue;
        if (clock() >= deadline) {
          report.stopped = true;
          report.reason = "deadline";
          checkpoint?.stop(report);
          return report;
        }
        const id = randomUUID();
        checkpoint?.reserve(report.observations.length, id);
        const start = clock();
        if (start >= deadline) {
          checkpoint?.expire(id);
          report.stopped = true;
          report.reason = "deadline";
          return report;
        }
        let pass = false;
        let callbackCost: number | undefined;
        let acceptingCost = true;
        let failure: string | undefined;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => {
              reject(new Failure("timeout"));
              controller.abort();
            },
            Math.max(1, deadline - start),
          );
        });
        try {
          const output = await Promise.race([
            worker(
              {
                id,
                prompt: test.prompt,
                minQuality: 1,
                effort: suite.effort,
                provider: selection.candidate.provider,
              },
              selection,
              controller.signal,
              (estimate) => {
                if (acceptingCost && Number.isFinite(estimate) && estimate > 0)
                  callbackCost = estimate;
              },
            ),
            timeout,
          ]);
          pass = accepted(output, test.acceptance);
        } catch (error) {
          failure = fromProviderError(error).kind;
        } finally {
          acceptingCost = false;
          clearTimeout(timer);
        }
        const completedAt = clock();
        if (completedAt >= deadline) {
          pass = false;
          failure = "timeout";
          controller.abort();
        }
        const estimated = callbackCost ?? cost(id);
        report.observations.push(
          observationSchema.parse({
            id,
            provider: selection.candidate.provider,
            model: selection.candidate.model,
            billing: selection.candidate.billing,
            effort: selection.effort,
            workload: suite.workload,
            suiteHash,
            caseId: test.id,
            completedAt,
            accepted: pass,
            elapsedMs: Math.max(1, completedAt - start),
            estimatedUsd:
              selection.candidate.billing === "metered" &&
              estimated !== undefined &&
              Number.isFinite(estimated) &&
              estimated >= 0
                ? estimated
                : null,
          }),
        );
        if (failure) {
          report.stopped = true;
          report.reason = failure;
        }
        checkpoint?.finish(id, report);
        if (failure) return report;
      }
  return report;
}
