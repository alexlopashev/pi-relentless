import { expect, test } from "vitest";
import { reviewAccounting } from "../src/review-accounting.js";
const report = (attempts: unknown[]) => JSON.stringify({ attempts });
const attempt = (
  elapsedMs: number,
  estimatedUsd: number | null,
  billing = "metered",
) => ({ route: { candidate: { billing } }, elapsedMs, estimatedUsd });
test("includes failed review attempts and preserves unknown subscription cost", () => {
  expect(
    reviewAccounting(
      [
        report([
          attempt(20, 0.2),
          { ...attempt(30, null, "subscription"), outcome: "failed" },
        ]),
      ],
      1,
    ),
  ).toEqual({
    complete: true,
    attempts: 2,
    elapsedMs: 50,
    estimatedUsd: null,
    knownMeteredUsd: 0.2,
  });
  expect(
    reviewAccounting([report([attempt(20, 0.2), attempt(30, 0.3)])], 1),
  ).toHaveProperty("estimatedUsd", 0.5);
});
test("missing reports or legacy attempt telemetry remain unknown", () => {
  expect(reviewAccounting([], 1)).toMatchObject({
    complete: false,
    elapsedMs: null,
    estimatedUsd: null,
  });
  expect(
    reviewAccounting([JSON.stringify({ status: "reviewed" })], 1),
  ).toMatchObject({ complete: false, elapsedMs: null, estimatedUsd: null });
  expect(reviewAccounting([], 0)).toEqual({
    complete: true,
    attempts: 0,
    elapsedMs: 0,
    estimatedUsd: 0,
    knownMeteredUsd: 0,
  });
});
test("rejects corrupt accounting and never imputes metered zero as known cost", () => {
  for (const reports of [
    [report([attempt(-1, 0.1)])],
    [report([attempt(1, -1)])],
    ["not json"],
    [report([attempt(1, 0.1)]), report([attempt(1, 0.1)])],
  ])
    expect(() => reviewAccounting(reports, 1)).toThrow();
  expect(reviewAccounting([report([attempt(1, 0)])], 1)).toMatchObject({
    complete: true,
    elapsedMs: 1,
    estimatedUsd: null,
    knownMeteredUsd: 0,
  });
});

test("missing reviewer latency does not erase separately known cost", () => {
  expect(
    reviewAccounting(
      [report([{ ...attempt(10, 0.2), elapsedMs: null }, attempt(20, 0.3)])],
      1,
    ),
  ).toMatchObject({
    complete: true,
    attempts: 2,
    elapsedMs: null,
    estimatedUsd: 0.5,
    knownMeteredUsd: 0.5,
  });
});

test("a waiting partial pair retains observed cost but is not complete measurement", () => {
  const partial = JSON.stringify({
    status: "waiting_retry",
    attempts: [
      {
        route: { candidate: { billing: "metered" } },
        elapsedMs: 20,
        estimatedUsd: 0.1,
      },
    ],
  });
  expect(reviewAccounting([partial], 1)).toEqual({
    complete: false,
    attempts: 1,
    elapsedMs: null,
    estimatedUsd: null,
    knownMeteredUsd: 0.1,
  });
});
