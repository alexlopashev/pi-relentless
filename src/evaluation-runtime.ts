import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { configSchema } from "./router.js";
import { evaluationSchema, evaluationRoutes, evaluate } from "./evaluation.js";
import { EvaluationCheckpoint } from "./evaluation-checkpoint.js";
import { createPiWorker } from "./pi-worker.js";
import { processWorker } from "./process-worker.js";
export async function evaluationDirectory(
  directory: string,
  mode: "create" | "resume" | "status",
): Promise<ReturnType<EvaluationCheckpoint["read"]>> {
  const text = await readFile(join(directory, "request.json"), "utf8");
  if (Buffer.byteLength(text) > 8_000_000)
    throw new Error("Evaluation request too large");
  const { suite, config } = z
    .strictObject({ suite: evaluationSchema, config: configSchema })
    .parse(JSON.parse(text) as unknown);
  const path = join(directory, "checkpoint.sqlite");
  if (mode !== "create" && !existsSync(path))
    throw new Error("Missing evaluation checkpoint");
  if (mode === "create" && existsSync(path))
    throw new Error("Evaluation checkpoint already exists");
  const checkpoint = new EvaluationCheckpoint(path, { suite, config });
  try {
    const state = checkpoint.read();
    if (mode === "status") return state;
    if (state.pending)
      throw new Error(
        "Ambiguous evaluation attempt; automatic replay forbidden",
      );
    const routes = evaluationRoutes(suite, config);
    const count = routes.length * suite.cases.length * suite.repeats;
    if (
      !state.report?.stopped &&
      (state.report?.observations.length ?? 0) < count &&
      (state.deadline === null || state.deadline > Date.now())
    )
      await createPiWorker(config, routes); // Whole-cohort authorization preflight; no inference.
    const goalId = randomUUID();
    const report = await evaluate(
      suite,
      config,
      (task, selection, signal, onCostEstimate) =>
        processWorker(
          { goalId, revision: 1, attemptId: task.id, task, selection, config },
          signal ?? new AbortController().signal,
          onCostEstimate,
        ),
      Date.now,
      () => undefined,
      checkpoint,
    );
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ ...config, observations: report.observations }, null, 2),
      { mode: 0o600 },
    );
    return checkpoint.read();
  } finally {
    checkpoint.close();
  }
}
