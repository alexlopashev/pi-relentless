import { test, expect } from "vitest";
import { reviewRetryAt } from "../src/review-retry.js";
test("only recognized transient inference failures retry within remaining review budget", () => {
  for (const failure of ["quota", "outage", "unavailable"])
    expect(
      reviewRetryAt(
        {
          status: "failed",
          failureStage: "inference",
          failure,
          retryAfterMs: 90000,
        },
        1,
        2,
        100,
      ),
    ).toBe(90100);
  expect(
    reviewRetryAt(
      { status: "failed", failureStage: "inference", failure: "quota" },
      1,
      2,
      100,
    ),
  ).toBe(30100);
  for (const failure of [
    "policy",
    "permission",
    "approval",
    "auth",
    "unknown",
    "timeout",
    "interrupted",
    "invalid_output",
  ])
    expect(
      reviewRetryAt(
        { status: "failed", failureStage: "inference", failure },
        1,
        2,
        100,
      ),
    ).toBeNull();
  expect(
    reviewRetryAt(
      { status: "failed", failureStage: "validation", failure: "quota" },
      1,
      2,
      100,
    ),
  ).toBeNull();
  expect(
    reviewRetryAt(
      { status: "stale", failureStage: "inference", failure: "quota" },
      1,
      2,
      100,
    ),
  ).toBeNull();
  expect(
    reviewRetryAt(
      { status: "failed", failureStage: "inference", failure: "quota" },
      2,
      2,
      100,
    ),
  ).toBeNull();
});
test("invalid budgets or retry timestamps cannot authorize a retry", () => {
  const r = { status: "failed", failureStage: "inference", failure: "quota" };
  expect(() => reviewRetryAt(r, 3, 2, 100)).toThrow();
  expect(() => reviewRetryAt({ ...r, retryAfterMs: -1 }, 1, 2, 100)).toThrow();
  expect(() => reviewRetryAt(r, 1, 2, Number.MAX_SAFE_INTEGER)).toThrow();
});

test("a final allowed pair still records provider cooldown without authorizing another pair", async () => {
  const { reviewCooldownAt } = await import("../src/review-retry.js");
  const r = { status: "failed", failureStage: "inference", failure: "quota" };
  expect(reviewCooldownAt(r, 5, 100)).toBe(480100);
  expect(reviewRetryAt(r, 5, 5, 100)).toBeNull();
});
