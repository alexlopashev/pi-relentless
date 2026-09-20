import { fork } from "node:child_process";
import { z } from "zod";
import { failureOriginSchema } from "./failure-origin.js";
import { Failure, failureKind, mergeFailure } from "./failures.js";
import type { Job } from "./supervisor.js";
export const workerReplySchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("completed"),
    output: z.string().max(65536),
    estimatedUsd: z.number().positive().optional(),
  }),
  z.strictObject({
    status: z.literal("failed"),
    kind: failureKind,
    origin: failureOriginSchema.optional(),
    estimatedUsd: z.number().positive().optional(),
    retryAfterMs: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER / 2)
      .optional(),
  }),
]);
/** IPC owns the child lifetime; stdout/stderr are discarded, never copied into the ledger. */
export const processWorker = (
  job: Job,
  signal: AbortSignal,
  onCostEstimate?: (estimatedUsd: number) => void,
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Failure("interrupted"));
      return;
    }
    // Pi can load this module from src; child processes always use the build.
    const child = fork(
      new URL("../dist/worker-entry.js", import.meta.url),
      [],
      {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        execArgv: ["--max-old-space-size=256"],
      },
    );
    let reply: z.infer<typeof workerReplySchema> | undefined;
    const observeFailure = (observed: Failure): void => {
      const failure = mergeFailure(
        reply?.status === "failed"
          ? new Failure(reply.kind, reply.retryAfterMs, reply.origin)
          : undefined,
        observed,
      );
      reply = {
        status: "failed",
        kind: failure.kind,
        ...(failure.origin !== undefined ? { origin: failure.origin } : {}),
        ...(failure.retryAfterMs !== undefined
          ? { retryAfterMs: failure.retryAfterMs }
          : {}),
        ...(reply?.estimatedUsd !== undefined
          ? { estimatedUsd: reply.estimatedUsd }
          : {}),
      };
    };
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      child.kill("SIGTERM");
      killTimer ??= setTimeout(() => {
        child.kill("SIGKILL");
      }, 1000);
    };
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, job.config.timeoutMs + 10000);
    child.on("message", (message: unknown) => {
      const result = workerReplySchema.safeParse(message);
      if (!result.success || reply) {
        observeFailure(new Failure("unknown", undefined, "worker_protocol"));
        if (result.success && result.data.status === "failed")
          observeFailure(
            new Failure(
              result.data.kind,
              result.data.retryAfterMs,
              result.data.origin,
            ),
          );
        stop();
        return;
      }
      reply = result.data;
    });
    child.on("error", () => {
      observeFailure(new Failure("interrupted", undefined, "worker_exit"));
      stop();
    });
    child.on("close", () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal.removeEventListener("abort", stop);
      let observerFailed = false;
      try {
        if (
          job.selection.candidate.billing === "metered" &&
          reply?.estimatedUsd !== undefined
        )
          onCostEstimate?.(reply.estimatedUsd);
      } catch {
        observerFailed = true;
      }
      if (reply?.status === "failed")
        reject(new Failure(reply.kind, reply.retryAfterMs, reply.origin));
      else if (signal.aborted) reject(new Failure("interrupted"));
      else if (observerFailed)
        reject(new Failure("unknown", undefined, "observer"));
      else if (reply?.status === "completed") resolve(reply.output);
      else reject(new Failure("interrupted", undefined, "worker_exit"));
    });
    child.send(job, (error) => {
      if (error) stop();
    });
  });
