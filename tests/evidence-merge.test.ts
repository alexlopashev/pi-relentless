import { expect, test } from "vitest";
import { mergeEvidence } from "../src/evidence-merge.js";
const row = {
  id: "one",
  provider: "p",
  model: "m",
  billing: "subscription",
  effort: "low",
  workload: "json",
  suiteHash: "a".repeat(64),
  caseId: "a",
  completedAt: 10,
  accepted: false,
  elapsedMs: 2,
  estimatedUsd: null,
};
test("deduplicates identical trials, preserves failed trials and returns independent copies", () => {
  const rows = mergeEvidence([
    [row],
    [{ ...row }, { ...row, id: "two", accepted: true }],
  ]);
  expect(rows).toEqual([row, { ...row, id: "two", accepted: true }]);
  const first = rows[0];
  if (!first) throw new Error("Missing trial");
  first.accepted = true;
  expect(row.accepted).toBe(false);
});
test("conflicting identities, invalid rows and aggregate overflow fail closed", () => {
  expect(() => mergeEvidence([[row], [{ ...row, accepted: true }]])).toThrow();
  expect(() =>
    mergeEvidence([[{ ...row, estimatedUsd: undefined }]]),
  ).toThrow();
  expect(() =>
    mergeEvidence([
      Array.from({ length: 6000 }, (_, i) => ({ ...row, id: `a${String(i)}` })),
      Array.from({ length: 6000 }, (_, i) => ({ ...row, id: `b${String(i)}` })),
    ]),
  ).toThrow();
});
