import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalDigest } from "./verification-assessment.js";
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
export const installationReceiptSchema = z.strictObject({
  directory: z.string().min(1).max(4096),
  requestSha256: sha,
  stateSha256: sha,
});
export function buildInstallationReceipt(
  directory: string,
  requestInput: unknown,
  recordInput: unknown,
  expected: {
    root: string;
    rootIdentity: [number, number];
    codingId: string;
    checkpointSha256: string;
    files: readonly { path: string; sha256: string }[];
  },
  observed: Record<string, string>,
) {
  const request = z
    .object({
      root: z.string(),
      checkpointSha256: sha,
      coding: z.object({ id: z.string() }),
      files: z
        .array(z.object({ path: z.string(), current: z.string() }))
        .min(1)
        .max(100),
    })
    .parse(requestInput);
  const record = z
    .object({ value: z.unknown(), sha256: sha })
    .parse(recordInput);
  const state = z
    .object({
      request: z.unknown(),
      rootIdentity: z.tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
      ]),
      status: z.literal("applied"),
      files: z.array(z.unknown()),
    })
    .parse(record.value);
  const files = z
    .array(z.strictObject({ path: z.string(), sha256: sha }))
    .min(1)
    .max(100)
    .parse(expected.files);
  const sources = z.record(z.string(), z.string()).parse(observed);
  if (
    canonicalDigest(record.value) !== record.sha256 ||
    canonicalDigest(state.request) !== canonicalDigest(requestInput) ||
    request.root !== expected.root ||
    request.coding.id !== expected.codingId ||
    request.checkpointSha256 !== expected.checkpointSha256 ||
    state.rootIdentity[0] !== expected.rootIdentity[0] ||
    state.rootIdentity[1] !== expected.rootIdentity[1] ||
    new Set(files.map((f) => f.path)).size !== files.length ||
    new Set(request.files.map((f) => f.path)).size !== files.length ||
    request.files.length !== files.length ||
    Object.keys(sources).length !== files.length
  )
    throw Error("Installation binding mismatch");
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  for (const file of files) {
    const installed = request.files.find((f) => f.path === file.path),
      current = sources[file.path];
    if (
      !installed ||
      typeof current !== "string" ||
      digest(installed.current) !== file.sha256 ||
      digest(current) !== file.sha256
    )
      throw Error("Installed source mismatch");
  }
  return installationReceiptSchema.parse({
    directory,
    requestSha256: canonicalDigest(requestInput),
    stateSha256: record.sha256,
  });
}
