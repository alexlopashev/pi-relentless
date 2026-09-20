import { realpath } from "node:fs/promises";
import { z } from "zod";
import {
  codingCalibrationSchema,
  planCodingCalibration,
} from "./coding-calibration-plan.js";
import { codingSchema } from "./coding-worker.js";
import { taskSchema } from "./router.js";
import { loadPiProjectConfig } from "./pi-project-config.js";
import { piRoleCandidates } from "./pi-role-routing.js";
import type { CatalogEntry } from "./model-inventory.js";

/** Read-only preview; declared artifact hashes are not execution evidence. */
export async function planPiCalibration(
  text: string,
  context: {
    cwd: string;
    signal?: AbortSignal;
    isProjectTrusted(): boolean;
    models(): {
      available: readonly CatalogEntry[];
      scoped: readonly { provider: string; model: string; effort?: string }[];
    };
  },
) {
  const check = () => {
    if (!context.isProjectTrusted() || context.signal?.aborted)
      throw new Error("Project no longer active or trusted");
  };
  check();
  if (Buffer.byteLength(text) > 65536)
    throw new Error("Plan input exceeds 64 KiB");
  const root = await realpath(context.cwd);
  check();
  const inputSchema = codingCalibrationSchema
    .omit({ config: true, review: true })
    .extend({
      reviewTask: taskSchema,
      cases: z
        .array(
          codingCalibrationSchema.shape.cases.element.extend({
            request: codingSchema.refine(
              (request) => request.sourceRoot === root,
              "Case must use active project",
            ),
          }),
        )
        .min(2)
        .max(10),
    });
  const { reviewTask, ...input } = inputSchema.parse(
    JSON.parse(text) as unknown,
  );
  const project = await loadPiProjectConfig(root, true);
  if (!project) throw new Error("Missing project policy");
  check();
  const models = context.models();
  const now = Date.now();
  const candidates = (role: "coder" | "reviewer") =>
    piRoleCandidates(project, role, models.available, models.scoped, {}, now);
  const plan = planCodingCalibration({
    ...input,
    config: { ...project.routing, candidates: candidates("coder") },
    review: {
      task: reviewTask,
      config: { ...project.routing, candidates: candidates("reviewer") },
    },
  });
  check();
  return {
    ...plan,
    dispatched: false as const,
    persisted: false as const,
    artifactsVerified: false as const,
  };
}
