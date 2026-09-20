import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const supervisorReceiptSchema = z.strictObject({
  version: z.literal(1),
  checkpointSha256: sha256Schema,
  specificationSha256: sha256Schema,
  reportSha256: sha256Schema,
  supervisorExitCode: z.number().int(),
});

export function recoverSupervisorDecision(
  receipt: unknown,
  expected: {
    checkpointSha256: string;
    specificationSha256: string;
    reportSha256: string;
  },
  decision: { accepted: boolean; reason: string },
): { accepted: boolean; reason: string; supervisorExitCode: number } {
  const parsed = supervisorReceiptSchema.parse(receipt);

  if (parsed.checkpointSha256 !== expected.checkpointSha256) {
    throw new Error("checkpoint binding hash mismatch");
  }
  if (parsed.specificationSha256 !== expected.specificationSha256) {
    throw new Error("specification binding hash mismatch");
  }
  if (parsed.reportSha256 !== expected.reportSha256) {
    throw new Error("report binding hash mismatch");
  }

  const supervisorFailed = parsed.supervisorExitCode !== 0;
  return {
    accepted: decision.accepted && !supervisorFailed,
    reason:
      decision.accepted && supervisorFailed
        ? "supervisor_failed"
        : decision.reason,
    supervisorExitCode: parsed.supervisorExitCode,
  };
}
