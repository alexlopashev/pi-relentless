import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { EvaluationCheckpoint } from "./evaluation-checkpoint.js";
import { evaluationSchema, evaluationRoutes } from "./evaluation.js";
import { configSchema } from "./router.js";
import { mergeEvidence } from "./evidence-merge.js";
import { loadPiCalibrationAdmission } from "./pi-calibration-admission.js";
import {
  piProjectConfigSchema,
  type PiProjectConfig,
} from "./pi-project-config.js";
/** Read explicit project-local evaluations. Never dispatch, rewrite settings or grant permissions. */
export async function loadPiEvidence(
  root: string,
  input: PiProjectConfig,
): Promise<PiProjectConfig> {
  const project = piProjectConfigSchema.parse(input);
  if (!project.evidence) return project;
  const canonicalRoot = await realpath(root);
  const groups: unknown[] = [project.routing.observations ?? []];
  for (const relative of project.evidence.evaluations ?? []) {
    let directory = canonicalRoot;
    const directories: { path: string; dev: number; ino: number }[] = [];
    const checkDirectories = async () => {
      for (const pinned of directories) {
        const current = await lstat(pinned.path);
        if (
          !current.isDirectory() ||
          current.dev !== pinned.dev ||
          current.ino !== pinned.ino
        )
          throw new Error("Evaluation directory replaced");
      }
      if ((await realpath(directory)) !== directory)
        throw new Error("Evidence escaped its project path");
    };
    for (const component of relative.split("/")) {
      directory = join(directory, component);
      const stat = await lstat(directory);
      if (!stat.isDirectory())
        throw new Error("Evidence directories must be regular");
      directories.push({ path: directory, dev: stat.dev, ino: stat.ino });
    }
    await checkDirectories();
    const request = await open(
      join(directory, "request.json"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let contract;
    try {
      const stat = await request.stat();
      const limit = 8_000_000;
      if (!stat.isFile() || stat.size > limit)
        throw new Error("Invalid evaluation request");
      const bytes = Buffer.alloc(limit + 1);
      let length = 0;
      while (length < bytes.length) {
        const part = await request.read(
          bytes,
          length,
          bytes.length - length,
          length,
        );
        if (!part.bytesRead) break;
        length += part.bytesRead;
      }
      if (length > limit) throw new Error("Evaluation request too large");
      contract = z
        .strictObject({ suite: evaluationSchema, config: configSchema })
        .parse(
          JSON.parse(bytes.subarray(0, length).toString("utf8")) as unknown,
        );
    } finally {
      await request.close();
    }
    const path = join(directory, "checkpoint.sqlite");
    const before = await lstat(path);
    if (!before.isFile() || before.size > 32_000_000)
      throw new Error("Invalid evaluation checkpoint file");
    await checkDirectories();
    const checkpoint = new EvaluationCheckpoint(path, contract, {
      readOnly: true,
    });
    try {
      const after = await lstat(path);
      if (
        !after.isFile() ||
        before.dev !== after.dev ||
        before.ino !== after.ino
      )
        throw new Error("Evaluation checkpoint replaced");
      const state = checkpoint.read();
      const count =
        evaluationRoutes(contract.suite, contract.config).length *
        contract.suite.cases.length *
        contract.suite.repeats;
      if (
        state.pending !== null ||
        !state.report ||
        state.report.stopped ||
        state.report.reason !== undefined ||
        state.report.observations.length !== count
      )
        throw new Error("Evaluation is not complete and unambiguous");
      await checkDirectories();
      groups.push(state.report.observations);
    } finally {
      checkpoint.close();
    }
  }
  for (const cohortId of project.evidence.calibrations ?? []) {
    const admission = await loadPiCalibrationAdmission(cohortId, {
      cwd: canonicalRoot,
      isProjectTrusted: () => true,
    });
    groups.push(admission.observations);
  }
  return {
    ...project,
    routing: { ...project.routing, observations: mergeEvidence(groups) },
  };
}
