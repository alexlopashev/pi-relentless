import { z } from "zod";
import {
  configSchema,
  efforts,
  route,
  type Config,
  type Task,
} from "./router.js";
import { parseReviewFindings } from "./review-findings.js";
import type { CodingReviewReport } from "./coding-review.js";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const candidateSchema = configSchema.shape.candidates.element;
const routeSchema = z.strictObject({
  candidate: candidateSchema,
  effort: z.enum(efforts),
});
const assessmentSchema = z.strictObject({
  verdict: z.enum(["no_findings", "changes_requested"]),
  findings: z.array(
    z.strictObject({
      path: z.string(),
      line: z.number().int().positive(),
      message: z.string(),
    }),
  ),
});
const continuationSchema = z
  .strictObject({
    id: z.string(),
    revision: z.number().int().nonnegative(),
    checkpointSha256: hashSchema,
    requestSha256: hashSchema,
    status: z.literal("waiting_retry"),
    retryAt: z.number().int().nonnegative(),
    reviews: z
      .array(
        z.strictObject({
          route: routeSchema,
          assessment: assessmentSchema,
        }),
      )
      .max(1),
    attempts: z
      .array(
        z.strictObject({
          route: routeSchema,
          elapsedMs: z.number().nonnegative().nullable(),
          outcome: z.literal("assessed"),
          estimatedUsd: z.number().nonnegative().nullable(),
        }),
      )
      .max(1),
  })
  .refine((value) => value.reviews.length === value.attempts.length);

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export function validateReviewContinuation(
  input: unknown,
  binding: {
    id: string;
    revision: number;
    checkpointSha256: string;
    requestSha256: string;
    config: Config;
    task: Task;
    authors: readonly string[];
    files: Readonly<Record<string, string>>;
  },
): CodingReviewReport {
  const parsed = continuationSchema.parse(input);
  if (
    parsed.id !== binding.id ||
    parsed.revision !== binding.revision ||
    parsed.checkpointSha256 !== binding.checkpointSha256 ||
    parsed.requestSha256 !== binding.requestSha256
  )
    throw new Error("Continuation binding mismatch");

  const taskWithoutOptimization = { ...binding.task };
  delete taskWithoutOptimization.optimization;
  const validatedAssessments = parsed.reviews.map((review) => {
    const candidate = binding.config.candidates.find((item) =>
      same(item, review.route.candidate),
    );
    if (!candidate || binding.authors.includes(candidate.provider))
      throw new Error("Invalid review candidate");
    if (
      efforts.indexOf(review.route.effort) <
      efforts.indexOf(binding.task.effort)
    )
      throw new Error("Review effort below task floor");
    const expected = route(
      binding.task.optimization
        ? { ...taskWithoutOptimization, effort: review.route.effort }
        : taskWithoutOptimization,
      [candidate],
      binding.config.allowMetered,
    );
    if (!same(expected, review.route)) throw new Error("Invalid review route");
    const assessment = parseReviewFindings(
      JSON.stringify(review.assessment),
      binding.files,
    );
    return { route: review.route, assessment };
  });

  for (const [index, attempt] of parsed.attempts.entries()) {
    if (!same(attempt.route, parsed.reviews[index]?.route))
      throw new Error("Review attempt route mismatch");
    const candidate = binding.config.candidates.find((item) =>
      same(item, attempt.route.candidate),
    );
    if (!candidate || binding.authors.includes(candidate.provider))
      throw new Error("Invalid attempt candidate");
    if (
      efforts.indexOf(attempt.route.effort) <
      efforts.indexOf(binding.task.effort)
    )
      throw new Error("Attempt effort below task floor");
    const expected = route(
      binding.task.optimization
        ? { ...taskWithoutOptimization, effort: attempt.route.effort }
        : taskWithoutOptimization,
      [candidate],
      binding.config.allowMetered,
    );
    if (!same(expected, attempt.route))
      throw new Error("Invalid attempt route");
  }

  return {
    ...parsed,
    reviews: validatedAssessments,
  };
}
