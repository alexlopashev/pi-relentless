import { expect, test } from "vitest";
import { mergeCodingHealth } from "../src/coding-health.js";

test("merges provider cooldowns by maximum without mutating input", () => {
  const first = { "provider:a": { until: 500 } };
  const next = { "provider:a": { until: 100 }, "provider:b": { until: 200 } };
  const merged = mergeCodingHealth([first, next]);
  expect(merged).toEqual({
    "provider:a": { until: 500 },
    "provider:b": { until: 200 },
  });
  if (merged["provider:a"]) merged["provider:a"].until = 1;
  expect(first["provider:a"].until).toBe(500);
  expect(next["provider:a"].until).toBe(100);
});
test("rejects invalid provider keys and timestamps rather than disabling cooldowns", () => {
  for (const state of [
    { invalid: { until: 1 } },
    { "provider:": { until: 1 } },
    { "provider:a": { until: NaN } },
    { "provider:a": { until: -1 } },
    { "provider:a": { until: Number.MAX_SAFE_INTEGER + 1 } },
  ]) {
    expect(() => mergeCodingHealth([state])).toThrow();
  }
  expect(mergeCodingHealth([])).toEqual({});
});
