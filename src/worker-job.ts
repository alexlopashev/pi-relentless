import { z } from "zod";
import { configSchema, taskSchema, route } from "./router.js";
import { fromProviderError, Failure } from "./failures.js";
import { nativeWorker } from "./native-worker.js";
import { createPiWorker } from "./pi-worker.js";
import { failureOriginSchema, type FailureOrigin } from "./failure-origin.js";
const jobSchema = z.strictObject({
  goalId: z.string(),
  revision: z.number().int(),
  attemptId: z.string(),
  task: taskSchema,
  config: configSchema,
  selection: z.strictObject({ candidate: z.unknown(), effort: z.string() }),
});
export async function executeJob(
  input: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  let estimatedUsd: number | undefined;
  let origin: FailureOrigin = "job_validation";
  try {
    const job = jobSchema.parse(input);
    const single = configSchema.parse({
      ...job.config,
      candidates: [job.selection.candidate],
    });
    const selection = route(
      job.task,
      single.candidates,
      single.allowMetered,
      single.observations,
    );
    if (selection.effort !== job.selection.effort) throw new Failure("unknown");
    origin = "worker_setup";
    let output: string;
    if (["claude-code", "codex-cli"].includes(selection.candidate.provider)) {
      origin = "worker_inference";
      output = await nativeWorker(job.task, selection, single, signal);
    } else {
      const worker = await createPiWorker(
        single,
        [selection],
        (_taskId, cost) => {
          if (
            selection.candidate.billing === "metered" &&
            Number.isFinite(cost) &&
            cost > 0
          )
            estimatedUsd = cost;
        },
      );
      origin = "worker_inference";
      output = await worker(job.task, selection, signal);
    }
    if (Buffer.byteLength(output) > 65536) {
      origin = "output_limit";
      throw new Failure("invalid_output");
    }
    return {
      status: "completed",
      output,
      ...(estimatedUsd !== undefined ? { estimatedUsd } : {}),
    };
  } catch (error) {
    const failure = fromProviderError(error);
    const suppliedOrigin =
      "origin" in failure
        ? failureOriginSchema.safeParse(failure.origin)
        : undefined;
    const failureOrigin =
      suppliedOrigin?.success === true ? suppliedOrigin.data : origin;
    return {
      status: "failed",
      kind: failure.kind,
      origin: failureOrigin,
      ...(estimatedUsd !== undefined ? { estimatedUsd } : {}),
      ...(failure.retryAfterMs !== undefined
        ? { retryAfterMs: failure.retryAfterMs }
        : {}),
    };
  }
}
