import { expect, test } from "vitest";
import { piRoleCandidates } from "../src/pi-role-routing.js";
import { piProjectConfigSchema } from "../src/pi-project-config.js";
import { route } from "../src/router.js";
const project = piProjectConfigSchema.parse({
  version: 1,
  routing: {
    candidates: [
      {
        name: "cloud",
        provider: "cloud",
        model: "one",
        enabled: true,
        billing: "subscription",
        quality: 2,
        preference: 1,
        efforts: ["low", "high"],
      },
      {
        name: "paid",
        provider: "paid",
        model: "two",
        enabled: true,
        billing: "metered",
        quality: 2,
        preference: 1,
        efforts: ["low"],
      },
      {
        name: "local",
        provider: "relentless-local",
        model: "qwen3.5-4b",
        enabled: true,
        billing: "local",
        quality: 1,
        preference: 0,
        efforts: ["off"],
      },
    ],
    maxConcurrency: 1,
    allowMetered: false,
  },
  roles: { coder: ["cloud", "paid"], scheduler: ["cloud", "local"] },
});
const available = [
  { provider: "cloud", model: "one", efforts: ["low", "high"] },
  { provider: "paid", model: "two", efforts: ["low"] },
  { provider: "relentless-local", model: "qwen3.5-4b", efforts: ["off"] },
];
test("role routing intersects project, available models, billing and provider cooldown", () => {
  expect(
    piRoleCandidates(project, "coder", available, [], {}, 100).map(
      (c) => c.name,
    ),
  ).toEqual(["cloud"]);
  expect(piRoleCandidates(project, "coder", [], [], {}, 100)).toEqual([]);
  expect(
    piRoleCandidates(
      project,
      "coder",
      available,
      [],
      { "provider:cloud": { until: 101 } },
      100,
    ),
  ).toEqual([]);
  expect(
    piRoleCandidates(
      project,
      "coder",
      available,
      [],
      { "provider:cloud": { until: 100 } },
      100,
    ),
  ).toHaveLength(1);
});
test("session scopes preserve provider identity and exact thinking pins", () => {
  const narrowed = piRoleCandidates(
    project,
    "coder",
    available,
    [{ provider: "cloud", model: "one", effort: "high" }],
    {},
    100,
  );
  expect(narrowed[0]?.efforts).toEqual(["high"]);
  expect(
    piRoleCandidates(
      project,
      "coder",
      available,
      [{ provider: "other", model: "one" }],
      {},
      100,
    ),
  ).toEqual([]);
  expect(
    piRoleCandidates(
      project,
      "coder",
      available,
      [{ provider: "cloud", model: "one", effort: "off" }],
      {},
      100,
    ),
  ).toEqual([]);
  expect(project.routing.candidates[0]?.efforts).toEqual(["low", "high"]);
});
test("local role eligibility never lowers task effort or quality floors", () => {
  const local = piRoleCandidates(
    project,
    "scheduler",
    available,
    [{ provider: "relentless-local", model: "qwen3.5-4b" }],
    {},
    100,
  );
  expect(local.map((c) => c.name)).toEqual(["local"]);
  const task = {
    id: "x",
    prompt: "plan",
    minQuality: 1 as const,
    effort: "low" as const,
  };
  expect(() => route(task, local, false)).toThrow();
  expect(route({ ...task, effort: "off" }, local, false).candidate.name).toBe(
    "local",
  );
  expect(() =>
    route({ ...task, effort: "off", provider: "cloud" }, local, false),
  ).toThrow();
});
test("missing roles and unsupported catalog efforts do not broaden eligibility", () => {
  expect(piRoleCandidates(project, "reviewer", available, [], {}, 100)).toEqual(
    [],
  );
  expect(
    piRoleCandidates(
      project,
      "coder",
      [{ provider: "cloud", model: "one", efforts: null }],
      [],
      {},
      100,
    ),
  ).toEqual([]);
});
test("invalid cooldown or clock and ambiguous duplicate scope fail closed", () => {
  expect(() =>
    piRoleCandidates(project, "coder", available, [], {}, NaN),
  ).toThrow();
  expect(() =>
    piRoleCandidates(
      project,
      "coder",
      available,
      [],
      { "provider:cloud": { until: NaN } },
      100,
    ),
  ).toThrow();
  expect(() =>
    piRoleCandidates(
      project,
      "coder",
      available,
      [
        { provider: "cloud", model: "one", effort: "low" },
        { provider: "cloud", model: "one", effort: "high" },
      ],
      {},
      100,
    ),
  ).toThrow();
});

test("workload evidence can outrank policy tiers but cannot override scope or invent costs", () => {
  const suiteHash = "a".repeat(64);
  const observations = ["cloud", "local"].flatMap((name) =>
    ["one", "two", "one", "two"].map((caseId, index) => ({
      id: `${name}-${String(index)}`,
      provider: name === "cloud" ? "cloud" : "relentless-local",
      model: name === "cloud" ? "one" : "qwen3.5-4b",
      billing: name === "cloud" ? "subscription" : "local",
      effort: name === "cloud" ? "low" : "off",
      workload: "retry-planning",
      suiteHash,
      caseId,
      completedAt: 100,
      accepted: true,
      elapsedMs: name === "cloud" ? 20 : 500,
      estimatedUsd: null,
    })),
  );
  const task = {
    id: "x",
    prompt: "plan",
    minQuality: 1 as const,
    effort: "off" as const,
    optimization: {
      workload: "retry-planning",
      suiteHash,
      caseIds: ["one", "two"],
      metric: "latency" as const,
      minSamples: 4,
      minCases: 2,
      minSuccessRate: 1,
      maxAgeMs: 100,
    },
  };
  const candidates = piRoleCandidates(
    project,
    "scheduler",
    available,
    [],
    {},
    150,
  );
  expect(route(task, candidates, false, observations, 150).candidate.name).toBe(
    "cloud",
  );
  const scoped = piRoleCandidates(
    project,
    "scheduler",
    available,
    [{ provider: "relentless-local", model: "qwen3.5-4b" }],
    {},
    150,
  );
  expect(route(task, scoped, false, observations, 150).candidate.name).toBe(
    "local",
  );
  expect(() => route(task, candidates, false, observations, 300)).toThrow();
  expect(() =>
    route(
      { ...task, optimization: { ...task.optimization, metric: "cost" } },
      candidates,
      false,
      observations,
      150,
    ),
  ).toThrow();
});
