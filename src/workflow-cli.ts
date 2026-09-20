import type { Route, Config } from "./router.js";
import { runWorkflow } from "./workflow-runner.js";
import { executionSchema, readSpecification } from "./workflow-verification.js";
import { stepWorkflowVerification } from "./workflow-verification-step.js";
import { canonicalDigest } from "./verification-assessment.js";
import { Failure } from "./failures.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows, type WorkflowState } from "./coding-workflow.js";
import { reviewRequestSchema } from "./coding-review.js";
import { processWorker } from "./process-worker.js";
export async function workflowCli(
  args: string[],
  root = process.cwd(),
  options: {
    signal?: AbortSignal;
    beforeVerification?: () => Promise<void>;
    afterDispatch?: () => Promise<void>;
    commitFence?: <T>(commit: () => T) => T;
    beforeDispatch?: (
      role: "coder" | "reviewer",
      selection: Route,
      config?: Config,
    ) => Promise<void>;
  } = {},
): Promise<WorkflowState> {
  const [command, id, file, ...extra] = args;
  if (
    !id ||
    extra.length ||
    (["create", "run-verified"].includes(command ?? "")
      ? !file
      : !["resume", "status", "run"].includes(command ?? "") || file)
  )
    throw new Error(
      "Usage: workflow create <coding-id> <workflow.json> | workflow resume <coding-id> | workflow status <coding-id> | workflow run <coding-id> | workflow run-verified <coding-id> <execution.json>",
    );
  const codingPath = join(root, ".harness", "coding.sqlite");
  const path = join(root, ".harness", "workflows.sqlite");
  if (!existsSync(codingPath) || (command !== "create" && !existsSync(path)))
    throw new Error("Missing project journal");
  const request =
    command === "create" && file
      ? await readFile(resolve(root, file), "utf8")
      : null;
  if (request !== null && Buffer.byteLength(request) > 8_000_000)
    throw new Error("Input exceeds 8 MB");
  const parsed =
    request === null || command !== "create"
      ? null
      : z
          .strictObject({
            review: reviewRequestSchema,
            maxReviewPairs: z.number().int().min(1).max(5),
          })
          .parse(JSON.parse(request) as unknown);
  const execution =
    command === "run-verified" && file
      ? executionSchema.parse(await readSpecification(resolve(root, file)))
      : null;
  const coding = new CodingJournal(codingPath);
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(path);
    if (parsed)
      workflows.create(id, coding, parsed.review, parsed.maxReviewPairs);
    const active = workflows;
    const resume = async (shutdown = options.signal): Promise<WorkflowState> =>
      active.resume(
        id,
        coding,
        async (task, selection, signal, config, onCostEstimate) => {
          const checkInterrupted = () => {
            if (shutdown?.aborted || signal.aborted)
              throw new Failure("interrupted");
          };
          checkInterrupted();
          await options.beforeDispatch?.(
            active.read(id).phase === "reviewing" ? "reviewer" : "coder",
            selection,
            config,
          );
          checkInterrupted();
          const output = await processWorker(
            {
              goalId: id,
              revision: coding.read(id).revision,
              attemptId: randomUUID(),
              task,
              selection,
              config,
            },
            shutdown ? AbortSignal.any([signal, shutdown]) : signal,
            onCostEstimate,
          );
          await options.afterDispatch?.();
          checkInterrupted();
          return output;
        },
        shutdown,
        options.commitFence,
      );
    if (command === "resume") return await resume();
    if (command === "run" || command === "run-verified") {
      if (!execution && active.read(id).phase === "verified")
        return await resume();
      const candidates = [
        ...coding.read(id).config.candidates,
        ...active.read(id).review.config.candidates,
      ];
      if (
        candidates.some(
          (c) => c.enabled && c.provider === "qwen-token-plan-individual",
        )
      )
        throw new Error(
          "Alibaba Personal is not authorized for unattended workflow execution",
        );
      const shutdown = new AbortController();
      const stop = (): void => {
        shutdown.abort();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        const signal = options.signal
          ? AbortSignal.any([shutdown.signal, options.signal])
          : shutdown.signal;
        if (signal.aborted) return active.read(id);
        const verify = execution
          ? async (signal: AbortSignal) => {
              await options.beforeVerification?.();
              return stepWorkflowVerification(
                active,
                coding,
                id,
                execution,
                root,
                signal,
                {
                  ...(options.beforeVerification
                    ? { beforeEffect: options.beforeVerification }
                    : {}),
                },
              );
            }
          : undefined;
        if (execution)
          active.bindVerificationContract(id, canonicalDigest(execution));
        if (verify && active.read(id).phase === "verified")
          return await verify(signal);
        return (
          (await runWorkflow(resume, signal, undefined, undefined, verify)) ??
          active.read(id)
        );
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    }
    return workflows.read(id);
  } finally {
    workflows?.close();
    coding.close();
  }
}
