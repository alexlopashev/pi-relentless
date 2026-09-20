import { codingContextSchema } from "./coding-context.js";
import { z } from "zod";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import {
  reviewCoding,
  reviewRequestSchema,
  type CodingReviewReport,
} from "./coding-review.js";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { CodingJournal } from "./coding-journal.js";
import { createCodingRun, resumeCoding } from "./durable-coding.js";
import { configSchema } from "./router.js";
import type { FailureKind } from "./failures.js";
import { processWorker } from "./process-worker.js";
async function input(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (Buffer.byteLength(text) > 8_000_000)
    throw new Error("Input exceeds 8 MB");
  return JSON.parse(text) as unknown;
}
export async function codingCli(
  args: string[],
  root = process.cwd(),
): Promise<{
  id: string;
  status: string;
  attempts: number;
  revision: number;
  maxAttempts: number;
  retryAt: number | null;
  cancelledAt: number | null;
  lastFailure: FailureKind | null;
  directory?: string;
  artifactRevision?: number;
  reviewStatus?: CodingReviewReport["status"];
}> {
  const [command, first, second, ...extra] = args;
  if (
    !first ||
    extra.length ||
    (command === "create" || command === "revise" || command === "review"
      ? !second
      : (command !== "resume" &&
          command !== "status" &&
          command !== "cancel") ||
        second)
  )
    throw new Error(
      "Usage: coding create <config> <request> | coding resume <id> | coding status <id> | coding cancel <id> | coding revise <id> <update.json> | coding review <id> <review.json>",
    );
  const path = join(root, ".harness", "coding.sqlite");
  if (command !== "create" && !existsSync(path))
    throw new Error("No coding journal in this project");
  const journal = new CodingJournal(path);
  try {
    let id = first;
    let directory: string | undefined;
    let artifactRevision: number | undefined;
    let reviewStatus: CodingReviewReport["status"] | undefined;
    if (command === "create" && second)
      id = await createCodingRun(
        await input(second),
        configSchema.parse(await input(first)),
        journal,
      );
    if (command === "revise" && second) {
      const update = z
        .strictObject({
          expectedRevision: z.number().int().positive(),
          prompt: z.string().min(1).max(100000),
          context: codingContextSchema.optional(),
        })
        .parse(await input(second));
      journal.revisePrompt(
        id,
        update.expectedRevision,
        update.prompt,
        Date.now(),
        update.context,
      );
    }
    if (command === "review" && second) {
      const request = reviewRequestSchema.parse(await input(second));
      const reviewRoot = join(root, ".harness", "reviews");
      await mkdir(reviewRoot, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(reviewRoot, "review-"));
      await writeFile(
        join(directory, "request.json"),
        JSON.stringify({ id, ...request }, null, 2),
        { mode: 0o600 },
      );
      const report = await reviewCoding(
        id,
        journal,
        request,
        (task, selection, signal, onCostEstimate) =>
          processWorker(
            {
              goalId: id,
              revision: journal.read(id).revision,
              attemptId: randomUUID(),
              task,
              selection,
              config: request.config,
            },
            signal ?? new AbortController().signal,
            onCostEstimate,
          ),
      );
      await writeFile(
        join(directory, "report.json"),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
      artifactRevision = report.revision;
      reviewStatus = report.status;
    }
    if (command === "cancel") journal.cancel(id);
    if (command === "resume") {
      const config = journal.read(id).config;
      const result = await resumeCoding(
        id,
        journal,
        (task, selection, signal, onCostEstimate) =>
          processWorker(
            {
              goalId: id,
              revision: journal.read(id).revision,
              attemptId: randomUUID(),
              task,
              selection,
              config,
            },
            signal ?? new AbortController().signal,
            onCostEstimate,
          ),
      );
      directory = result.directory;
      artifactRevision = result.revision;
    }
    const state = journal.read(id);
    return {
      id,
      status: state.status,
      attempts: state.attempts,
      revision: state.revision,
      maxAttempts: state.request.maxAttempts,
      cancelledAt: state.cancelledAt,
      retryAt: state.status === "waiting_retry" ? state.dueAt : null,
      lastFailure: state.failures.at(-1)?.kind ?? null,
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(directory && artifactRevision !== undefined
        ? { directory, artifactRevision }
        : {}),
    };
  } finally {
    journal.close();
  }
}
