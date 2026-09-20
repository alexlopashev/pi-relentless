import { expect, test } from "vitest";
import { workflowActiveTime } from "../src/workflow-active-time.js";
test("complete terminal workflow sums author, all reviews and verification work", () => {
  expect(workflowActiveTime(true, 10, 20, 30)).toBe(60);
  expect(workflowActiveTime(true, 10, 0, 0)).toBe(10);
  expect(workflowActiveTime(false, 10, 20, 30)).toBeNull();
});
test("missing stages remain unknown and invalid accounting is rejected", () => {
  expect(workflowActiveTime(true, null, 20, 30)).toBeNull();
  expect(workflowActiveTime(true, 10, null, 30)).toBeNull();
  expect(workflowActiveTime(true, 10, 20, null)).toBeNull();
  expect(workflowActiveTime(true, 0, 0, 0)).toBeNull();
  expect(() => workflowActiveTime(true, -1, 20, 30)).toThrow();
  expect(() => workflowActiveTime(false, NaN, null, 0)).toThrow();
  expect(() =>
    workflowActiveTime(true, Number.MAX_VALUE, Number.MAX_VALUE, 0),
  ).toThrow();
});
