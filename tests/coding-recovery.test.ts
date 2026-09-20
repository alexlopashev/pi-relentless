import { expect, test } from "vitest";
import { codingRoute, retryAt } from "../src/coding-recovery.js";
import { configSchema, taskSchema } from "../src/router.js";
const first = {
  name: "first",
  provider: "a",
  model: "one",
  enabled: true,
  billing: "subscription",
  quality: 2,
  preference: 0,
  efforts: ["high"],
};
const config = configSchema.parse({
  candidates: [
    first,
    { ...first, name: "same-provider", model: "two", preference: 1 },
    {
      ...first,
      name: "fallback",
      provider: "b",
      model: "three",
      preference: 2,
    },
    {
      ...first,
      name: "paid",
      provider: "c",
      billing: "metered",
      preference: 0,
    },
  ],
});
const task = taskSchema.parse({
  id: "repair",
  prompt: "repair",
  minQuality: 2,
  effort: "high",
});
test("cooldown excludes every model on a provider, retaining billing and effort boundaries", () => {
  const result = codingRoute(
    task,
    config,
    { "provider:a": { until: 5000 } },
    1000,
  );
  expect(result.status).toBe("available");
  if (result.status === "available") {
    expect(result.selection.candidate.name).toBe("fallback");
    expect(result.selection.effort).toBe("high");
  }
});
test("provider and exact model pins wait rather than silently switch", () => {
  expect(
    codingRoute(
      { ...task, provider: "a" },
      config,
      { "provider:a": { until: 5000 } },
      1000,
    ),
  ).toEqual({ status: "waiting_retry", dueAt: 5000 });
  expect(
    codingRoute(
      { ...task, model: "one" },
      config,
      { "provider:a": { until: 5000 } },
      1000,
    ),
  ).toEqual({ status: "waiting_retry", dueAt: 5000 });
});
test("only eligible routes determine the recovery timestamp", () => {
  const result = codingRoute(
    task,
    config,
    {
      "provider:a": { until: 5000 },
      "provider:b": { until: 6000 },
      "provider:c": { until: 1001 },
    },
    1000,
  );
  expect(result).toEqual({ status: "waiting_retry", dueAt: 5000 });
  expect(codingRoute({ ...task, effort: "max" }, config, {}, 1000)).toEqual({
    status: "blocked",
  });
});
test("backoff honors server Retry-After without truncating it", () => {
  expect(retryAt(1, undefined, 1000)).toBe(31000);
  expect(retryAt(2, undefined, 1000)).toBe(61000);
  expect(retryAt(2, 5000000, 1000)).toBe(5001000);
  expect(() => retryAt(1, NaN, 1000)).toThrow();
  expect(() => retryAt(0, undefined, 1000)).toThrow();
  expect(() => retryAt(1, undefined, Number.MAX_SAFE_INTEGER)).toThrow();
});
test("insufficient capability evidence cannot enable an unmeasured fallback", () => {
  expect(
    codingRoute(
      {
        ...task,
        optimization: {
          workload: "probe",
          suiteHash: "0".repeat(64),
          caseIds: ["a", "b"],
          metric: "latency",
          minSamples: 3,
          minCases: 2,
          minSuccessRate: 0.8,
          maxAgeMs: 86400000,
        },
      },
      config,
      {},
      1000,
    ),
  ).toEqual({ status: "blocked" });
});
