import { z } from "zod";

const timingValueSchema = z.number().nonnegative().nullable();

export const verificationTimingSchema = z.strictObject({
  version: z.literal(1),
  scope: z.literal("prepare_to_assessment"),
  packagingMs: timingValueSchema,
  supervisorMs: timingValueSchema,
  assessmentAndSetupMs: timingValueSchema,
  activeMs: timingValueSchema,
  vmMs: timingValueSchema,
});

type VerificationTiming = z.infer<typeof verificationTimingSchema>;

export function verificationTiming(
  marks: readonly (number | null)[],
  vmSeconds: number,
): VerificationTiming {
  const vmProduct = vmSeconds * 1000;
  const vmMs =
    Number.isFinite(vmSeconds) && vmSeconds >= 0 && Number.isFinite(vmProduct)
      ? vmProduct
      : null;

  if (marks.length !== 5) {
    return {
      version: 1,
      scope: "prepare_to_assessment",
      packagingMs: null,
      supervisorMs: null,
      assessmentAndSetupMs: null,
      activeMs: null,
      vmMs,
    };
  }

  const numericMarks: number[] = [];
  for (const mark of marks) {
    if (typeof mark !== "number" || !Number.isFinite(mark) || mark < 0) {
      return {
        version: 1,
        scope: "prepare_to_assessment",
        packagingMs: null,
        supervisorMs: null,
        assessmentAndSetupMs: null,
        activeMs: null,
        vmMs,
      };
    }
    numericMarks.push(mark);
  }

  for (let index = 1; index < numericMarks.length; index += 1) {
    const previous = numericMarks[index - 1];
    const current = numericMarks[index];
    if (current === undefined || previous === undefined || current < previous) {
      return {
        version: 1,
        scope: "prepare_to_assessment",
        packagingMs: null,
        supervisorMs: null,
        assessmentAndSetupMs: null,
        activeMs: null,
        vmMs,
      };
    }
  }

  const [startPrepare, afterPrepare, beforeRun, afterRun, afterAssessment] =
    numericMarks;
  if (
    startPrepare === undefined ||
    afterPrepare === undefined ||
    beforeRun === undefined ||
    afterRun === undefined ||
    afterAssessment === undefined
  ) {
    return {
      version: 1,
      scope: "prepare_to_assessment",
      packagingMs: null,
      supervisorMs: null,
      assessmentAndSetupMs: null,
      activeMs: null,
      vmMs,
    };
  }
  const packagingMs = afterPrepare - startPrepare;
  const supervisorMs = afterRun - beforeRun;
  const assessmentAndSetupMs =
    beforeRun - afterPrepare + (afterAssessment - afterRun);
  const activeMs = afterAssessment - startPrepare;

  if (
    ![packagingMs, supervisorMs, assessmentAndSetupMs, activeMs].every(
      Number.isFinite,
    )
  ) {
    return {
      version: 1,
      scope: "prepare_to_assessment",
      packagingMs: null,
      supervisorMs: null,
      assessmentAndSetupMs: null,
      activeMs: null,
      vmMs,
    };
  }

  return {
    version: 1,
    scope: "prepare_to_assessment",
    packagingMs,
    supervisorMs,
    assessmentAndSetupMs,
    activeMs,
    vmMs,
  };
}
