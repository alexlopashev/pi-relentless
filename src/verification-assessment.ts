import { createHash } from "node:crypto";
import { z } from "zod";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z.strictObject({ path: z.string(), sha256: sha });
export const verificationManifestSchema = z.strictObject({
  version: z.literal(1),
  emulator: artifact,
  kernel: artifact,
  image: artifact,
  wallSeconds: z.number().int().min(1).max(300),
  outputBytes: z.number().int().min(1024).max(1048576),
  candidateSha256: sha,
  testSha256: sha,
});
export const verificationReportSchema = z.strictObject({
  version: z.literal(1),
  outcome: z.enum([
    "executed",
    "test_process_failed",
    "invalid_evidence",
    "wall_limit",
    "output_limit",
    "interrupted",
  ]),
  acceptance: z.literal("not_assessed"),
  inputs: verificationManifestSchema,
  manifestSha256: sha,
  controller: z
    .strictObject({
      exitCode: z.number().int().min(0).max(255),
      candidateSha256: sha,
      testSha256: sha,
    })
    .nullable(),
  emulatorExitCode: z.number().int(),
  reaped: z.boolean(),
  elapsedSeconds: z.number().nonnegative(),
  outputBytes: z.number().int().nonnegative(),
  hostMemoryBound: z.boolean(),
});
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sorted(item)]),
    );
  return value;
}
/** Matches the supervisor's sorted, compact, ASCII JSON encoding for these schemas. */
export function canonicalDigest(value: unknown): string {
  const json: unknown = JSON.stringify(sorted(value));
  if (typeof json !== "string") throw new Error("Missing JSON value");
  const ascii = json
    .split("")
    .map((c) =>
      c.charCodeAt(0) >= 127
        ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
        : c,
    )
    .join("");
  return createHash("sha256").update(ascii).digest("hex");
}
export function assessVerification(
  manifestInput: unknown,
  reportInput: unknown,
  sourceDigest: string,
  testDigest: string,
): { accepted: boolean; reason: string } {
  const manifest = verificationManifestSchema.parse(manifestInput);
  const report = verificationReportSchema.parse(reportInput);
  if (
    manifest.candidateSha256 !== sourceDigest ||
    manifest.testSha256 !== testDigest ||
    canonicalDigest(manifest) !== report.manifestSha256 ||
    canonicalDigest(report.inputs) !== report.manifestSha256 ||
    (report.controller &&
      (report.controller.candidateSha256 !== sourceDigest ||
        report.controller.testSha256 !== testDigest))
  )
    throw new Error("Verification evidence binding mismatch");
  if (report.outputBytes > manifest.outputBytes)
    throw new Error("Invalid output bound");
  const accepted =
    report.outcome === "executed" &&
    report.reaped &&
    report.emulatorExitCode === 0 &&
    report.controller?.exitCode === 0;
  return {
    accepted,
    reason: accepted
      ? "declared_test_process_exited_zero"
      : "execution_did_not_satisfy_rule",
  };
}
