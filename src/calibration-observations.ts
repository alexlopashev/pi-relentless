import { z } from "zod";
import {
  type CodingCalibrationPlan,
  planCodingCalibration,
} from "./coding-calibration-plan.js";
import { canonicalDigest } from "./verification-assessment.js";
import { observationSchema, type Observation } from "./model-evidence.js";

const resultSchema = z
  .object({
    trialId: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.boolean(),
    elapsedMs: z.number().positive().nullable(),
    activeMs: z.number().positive().nullable().optional(),
    estimatedUsd: z.number().nonnegative().nullable(),
    completedAt: z.number().int().nonnegative().refine(Number.isSafeInteger),
  })
  .strict();

export function calibrationObservations(
  plan: CodingCalibrationPlan,
  results: unknown,
): Observation[] {
  if (
    !["author-attempts-v1", "workflow-active-v1"].includes(
      plan.contract.measurement ?? "",
    )
  ) {
    throw new Error("Unsupported measurement protocol");
  }

  if (
    canonicalDigest(plan) !==
    canonicalDigest(planCodingCalibration(plan.contract))
  ) {
    throw new Error("Calibration plan changed");
  }

  const parsedResults = z.array(resultSchema).max(30).parse(results);
  if (parsedResults.length !== plan.trials.length) {
    throw new Error("Incomplete calibration cohort");
  }

  return plan.trials.map((trial, index) => {
    const result = parsedResults[index];
    if (result?.trialId !== trial.id) {
      throw new Error("Calibration results are not ordered");
    }
    const active = plan.contract.measurement === "workflow-active-v1";
    if (
      active
        ? result.activeMs === undefined ||
          result.elapsedMs !== null ||
          result.estimatedUsd !== null
        : result.activeMs !== undefined
    )
      throw new Error("Measurement protocol mismatch");
    if (
      trial.selection.candidate.billing !== "metered" &&
      result.estimatedUsd !== null
    ) {
      throw new Error("Non-metered trials cannot report estimated cost");
    }

    return observationSchema.parse({
      id: trial.id,
      provider: trial.selection.candidate.provider,
      model: trial.selection.candidate.model,
      billing: trial.selection.candidate.billing,
      effort: trial.selection.effort,
      workload: plan.contract.workload,
      suiteHash: plan.suiteHash,
      caseId: trial.caseId,
      accepted: result.accepted,
      elapsedMs: result.elapsedMs,
      ...(active ? { activeMs: result.activeMs } : {}),
      estimatedUsd: result.estimatedUsd,
      completedAt: result.completedAt,
    });
  });
}
