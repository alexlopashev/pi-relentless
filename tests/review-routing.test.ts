import { expect, test } from "vitest";
import { configSchema, taskSchema } from "../src/router.js";
import { reviewRoutes } from "../src/review-routing.js";
const candidate = (provider: string) => ({
  name: provider,
  provider,
  model: provider,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
});
const config = configSchema.parse({
  candidates: [
    candidate("author"),
    candidate("a"),
    candidate("b"),
    candidate("c"),
  ],
});
const task = taskSchema.parse({
  id: "review",
  prompt: "review",
  minQuality: 1,
  effort: "low",
});
test("selects independent providers outside author provenance and active cooldowns", () => {
  const plan = reviewRoutes(
    task,
    config,
    ["author"],
    { "provider:a": { until: 100 } },
    0,
  );
  expect(plan.status).toBe("available");
  if (plan.status === "available")
    expect(plan.routes.map((r) => r.candidate.provider)).toEqual(["b", "c"]);
});
test("waits until an entire pair is available and never relaxes static pins", () => {
  const pair = {
    ...config,
    candidates: config.candidates.filter((c) => c.provider !== "c"),
  };
  expect(
    reviewRoutes(
      task,
      pair,
      ["author"],
      { "provider:a": { until: 100 }, "provider:b": { until: 200 } },
      0,
    ),
  ).toEqual({ status: "waiting_retry", dueAt: 200 });
  expect(
    reviewRoutes({ ...task, provider: "a" }, config, ["author"], {}, 0),
  ).toEqual({ status: "blocked" });
  expect(() =>
    reviewRoutes(task, config, ["author"], { "provider:a": { until: NaN } }, 0),
  ).toThrow();
});

test("a completed provider needs only one remaining independent route", () => {
  const pair = {
    ...config,
    candidates: config.candidates.filter((c) => c.provider !== "c"),
  };
  expect(
    reviewRoutes(
      task,
      pair,
      ["author"],
      {
        "provider:a": { until: 500 },
        "provider:b": { until: 200 },
      },
      0,
      ["a"],
    ),
  ).toEqual({ status: "waiting_retry", dueAt: 200 });
  const plan = reviewRoutes(
    task,
    pair,
    ["author"],
    { "provider:a": { until: 500 } },
    200,
    ["a"],
  );
  expect(plan.status).toBe("available");
  if (plan.status === "available")
    expect(plan.routes.map((r) => r.candidate.provider)).toEqual(["b"]);
  expect(() =>
    reviewRoutes(task, pair, ["author"], {}, 0, ["a", "b"]),
  ).toThrow();
  expect(() =>
    reviewRoutes(task, pair, ["author"], {}, 0, ["author"]),
  ).toThrow();
});
