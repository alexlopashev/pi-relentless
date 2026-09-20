import { createHash } from "node:crypto";
import { z } from "zod";
import { piProjectConfigSchema } from "./pi-project-config.js";
import { canonicalDigest } from "./verification-assessment.js";
const limit = 128 * 1024;
function parseSettings(source: string | undefined): Record<string, unknown> {
  if (source === undefined) return {};
  if (Buffer.byteLength(source) > limit)
    throw new Error("Settings exceed limit");
  return z.record(z.string(), z.unknown()).parse(JSON.parse(source) as unknown);
}
function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}
export function renderConfigTarget(
  source: string | undefined,
  after: unknown,
): string {
  const target =
    JSON.stringify(
      {
        ...parseSettings(source),
        relentless: piProjectConfigSchema.parse(after),
      },
      null,
      2,
    ) + "\n";
  if (Buffer.byteLength(target) > limit)
    throw new Error("Target exceeds limit");
  return target;
}
const sha = z.string().regex(/^[0-9a-f]{64}$/u);
export const proposalSchema = z
  .strictObject({
    version: z.literal(1),
    root: z.string().min(1),
    sourceSha256: sha.nullable(),
    targetSha256: sha,
    before: z
      .unknown()
      .refine(
        (value) =>
          value === null || piProjectConfigSchema.safeParse(value).success,
      ),
    after: piProjectConfigSchema,
    id: sha,
  })
  .refine(
    ({ id, ...body }) => canonicalDigest(body) === id,
    "Proposal digest mismatch",
  );
/** The full source is hashed but unrelated settings are never retained in proposals. */
export function buildConfigProposal(
  root: string,
  source: string | undefined,
  next: unknown,
) {
  const settings = parseSettings(source);
  const before = Object.hasOwn(settings, "relentless")
    ? settings["relentless"]
    : null;
  if (before !== null) piProjectConfigSchema.parse(before);
  // A present null namespace is invalid, rather than equivalent to absence.
  if (Object.hasOwn(settings, "relentless") && before === null)
    throw new Error("Invalid existing Relentless settings");
  const after = piProjectConfigSchema.parse(next);
  const body = {
    version: 1 as const,
    root,
    sourceSha256: source === undefined ? null : hash(source),
    targetSha256: hash(renderConfigTarget(source, after)),
    before,
    after,
  };
  return proposalSchema.parse({ ...body, id: canonicalDigest(body) });
}
