import { goalResumeIntentSchema } from "./goal-resume-plan.js";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { configSchema } from "./router.js";

export const projectRoles = z.enum([
  "planner",
  "coder",
  "reviewer",
  "verifier",
  "scheduler",
]);
/** Role eligibility is policy, never a substitute for verified observations. */
export const piProjectConfigSchema = z
  .strictObject({
    version: z.literal(1),
    resumeGoal: goalResumeIntentSchema.optional(),
    evidence: z
      .strictObject({
        evaluations: z
          .array(z.string().regex(/^\.harness\/evaluations\/[a-zA-Z0-9_-]+$/u))
          .min(1)
          .max(32)
          .refine(
            (paths) => new Set(paths).size === paths.length,
            "Duplicate evaluation paths",
          )
          .optional(),
        calibrations: z
          .array(z.string().min(1).max(200))
          .min(1)
          .max(32)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Duplicate calibration IDs",
          )
          .optional(),
      })
      .refine(
        (value) =>
          value.evaluations !== undefined || value.calibrations !== undefined,
        "At least one evidence source is required",
      )
      .optional(),
    routing: configSchema,
    roles: z.partialRecord(projectRoles, z.array(z.string().min(1)).min(1)),
  })
  .refine(
    (value) =>
      Object.values(value.roles).every(
        (names) =>
          new Set(names).size === names.length &&
          names.every((name) =>
            value.routing.candidates.some(
              (candidate) => candidate.name === name,
            ),
          ),
      ),
    "Roles must refer to unique configured candidate names",
  );
export type PiProjectConfig = z.infer<typeof piProjectConfigSchema>;

/** Project-only policy: no implicit global permission or billing inheritance. */
export async function loadPiProjectConfig(
  root: string,
  trusted: boolean,
): Promise<PiProjectConfig | null> {
  if (!trusted) throw new Error("Relentless requires a trusted Pi project");
  const directory = join(root, CONFIG_DIR_NAME);
  let file;
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error("Project settings directory must be regular");
    file = await open(
      join(directory, "settings.json"),
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
  try {
    const info = await file.stat();
    const limit = 128 * 1024;
    if (!info.isFile() || info.size > limit)
      throw new Error("Project settings exceed limit or are not regular");
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(
        bytes,
        length,
        bytes.length - length,
        length,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > limit) throw new Error("Project settings exceed limit");
    const settings = z
      .looseObject({ relentless: z.unknown().optional() })
      .parse(JSON.parse(bytes.subarray(0, length).toString("utf8")) as unknown);
    return settings.relentless === undefined
      ? null
      : piProjectConfigSchema.parse(settings.relentless);
  } finally {
    await file.close();
  }
}
