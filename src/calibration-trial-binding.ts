import { z } from "zod";
import type { CodingCalibrationPlan } from "./coding-calibration-plan.js";
import { codingSchema } from "./coding-worker.js";
import { configSchema } from "./router.js";
import { canonicalDigest } from "./verification-assessment.js";
export function calibrationTrialBinding(
  plan: CodingCalibrationPlan,
  trialId: string,
  identity: string,
) {
  z.uuid().parse(identity);
  const trial = plan.trials.find((item) => item.id === trialId);
  const item = plan.contract.cases.find((item) => item.id === trial?.caseId);
  if (!trial || !item) throw new Error("Missing trial");
  const key = "calibration:" + identity;
  const inputSha256 = canonicalDigest({
    contractSha256: plan.contractSha256,
    trialId,
  });
  const request = codingSchema.parse({
    ...item.request,
    task: {
      ...item.request.task,
      id: key,
      provider: trial.selection.candidate.provider,
      model: trial.selection.candidate.model,
      effort: trial.selection.effort,
    },
  });
  const config = configSchema.parse({
    ...plan.contract.config,
    candidates: [
      { ...trial.selection.candidate, efforts: [trial.selection.effort] },
    ],
  });
  return { trial, item, key, inputSha256, request, config };
}
