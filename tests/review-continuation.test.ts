import { expect, test } from "vitest";
import { configSchema, taskSchema, route } from "../src/router.js";
import { validateReviewContinuation } from "../src/review-continuation.js";
const config = configSchema.parse({
  candidates: [
    {
      name: "a",
      provider: "a",
      model: "m",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const task = taskSchema.parse({
  id: "review",
  prompt: "Review",
  minQuality: 1,
  effort: "low",
});
const selection = route(task, config.candidates, false);
const binding = {
  id: "job",
  revision: 1,
  checkpointSha256: "a".repeat(64),
  requestSha256: "b".repeat(64),
  config,
  task,
  authors: ["author"],
  files: { "x.ts": "export const x = 1;" },
};
const report = () => ({
  id: binding.id,
  revision: 1,
  checkpointSha256: binding.checkpointSha256,
  requestSha256: binding.requestSha256,
  status: "waiting_retry",
  retryAt: 1000,
  reviews: [
    { route: selection, assessment: { verdict: "no_findings", findings: [] } },
  ],
  attempts: [
    {
      route: selection,
      outcome: "assessed",
      elapsedMs: 20,
      estimatedUsd: null,
    },
  ],
});
test("validates checkpoint-bound completed evidence without fabricating measurements", () => {
  const value = report();
  expect(validateReviewContinuation(value, binding)).toEqual(value);
  const first = value.attempts[0];
  if (!first) throw new Error("Missing fixture attempt");
  first.elapsedMs = 0;
  expect(
    validateReviewContinuation(value, binding).attempts[0]?.elapsedMs,
  ).toBe(0);
  expect(
    validateReviewContinuation(
      { ...report(), reviews: [], attempts: [] },
      binding,
    ).reviews,
  ).toEqual([]);
});
test.each([
  { revision: 2 },
  { checkpointSha256: "c".repeat(64) },
  { requestSha256: "c".repeat(64) },
  { id: "other" },
  { status: "failed", failure: "policy" },
  { retryAt: NaN },
  { reviews: [] },
  { attempts: [] },
  { failure: "quota" },
])(
  "rejects stale, incomplete or failed continuation evidence: %j",
  (change) => {
    expect(() =>
      validateReviewContinuation({ ...report(), ...change }, binding),
    ).toThrow();
  },
);
test("rejects author, modified route, completed pair and invalid finding evidence", () => {
  expect(() =>
    validateReviewContinuation(report(), { ...binding, authors: ["a"] }),
  ).toThrow();
  const value = report();
  const altered = {
    ...selection,
    candidate: { ...selection.candidate, model: "other" },
  };
  expect(() =>
    validateReviewContinuation(
      { ...value, reviews: [{ ...value.reviews[0], route: altered }] },
      binding,
    ),
  ).toThrow();
  expect(() =>
    validateReviewContinuation(
      {
        ...value,
        reviews: [...value.reviews, ...value.reviews],
        attempts: [...value.attempts, ...value.attempts],
      },
      binding,
    ),
  ).toThrow();
  expect(() =>
    validateReviewContinuation(
      {
        ...value,
        reviews: [
          {
            route: selection,
            assessment: {
              verdict: "changes_requested",
              findings: [{ path: "unknown.ts", line: 1, message: "defect" }],
            },
          },
        ],
      },
      binding,
    ),
  ).toThrow();
  expect(() =>
    validateReviewContinuation(value, {
      ...binding,
      task: { ...task, effort: "high" },
    }),
  ).toThrow();
});

test("rejects two different valid providers in the assessment and matching attempt slot", () => {
  const second = { ...selection.candidate, name: "b", provider: "b" };
  const extended = {
    ...binding,
    config: { ...config, candidates: [...config.candidates, second] },
  };
  const value = report();
  expect(() =>
    validateReviewContinuation(
      {
        ...value,
        attempts: [
          { ...value.attempts[0], route: { ...selection, candidate: second } },
        ],
      },
      extended,
    ),
  ).toThrow();
});
test("retains a completed higher-effort review without re-ranking history or lowering the floor", () => {
  const candidate = {
    ...selection.candidate,
    efforts: ["low", "high"] as ("low" | "high")[],
  };
  const high = { candidate, effort: "high" as const };
  const value = report();
  const completed = {
    ...value,
    reviews: value.reviews.map((r) => ({ ...r, route: high })),
    attempts: value.attempts.map((a) => ({ ...a, route: high })),
  };
  const scoped = {
    ...binding,
    config: { ...config, candidates: [candidate] },
    task: taskSchema.parse({
      ...task,
      optimization: {
        workload: "x",
        suiteHash: "c".repeat(64),
        caseIds: ["a", "b"],
        metric: "latency",
      },
    }),
  };
  expect(validateReviewContinuation(completed, scoped)).toEqual(completed);
  const low = { candidate, effort: "low" as const };
  expect(() =>
    validateReviewContinuation(
      {
        ...value,
        reviews: value.reviews.map((r) => ({ ...r, route: low })),
        attempts: value.attempts.map((a) => ({ ...a, route: low })),
      },
      { ...scoped, task: { ...scoped.task, effort: "high" } },
    ),
  ).toThrow();
});
