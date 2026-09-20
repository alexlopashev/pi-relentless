import { expect, it } from "vitest";
import {
  configSchema,
  route,
  taskSchema,
  type Candidate,
} from "../src/router.js";
const hash = "a".repeat(64);
const baseTask = { id: "x", prompt: "x", minQuality: 1, effort: "low" };
const candidates: Candidate[] = ["a", "b"].map((name) => ({
  name,
  provider: name,
  model: name,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: name === "a" ? 1 : 2,
  efforts: ["low", "high"],
}));
const observations = candidates.flatMap((c) =>
  Array.from({ length: 3 }, (_, i) => ({
    id: c.name + String(i),
    provider: c.provider,
    billing: c.billing,
    model: c.model,
    effort: "low",
    workload: "json",
    suiteHash: hash,
    caseId: String(i),
    completedAt: 1000,
    accepted: true,
    elapsedMs: c.name === "a" ? 100 : 10,
    estimatedUsd: 0,
  })),
);
const input = {
  ...baseTask,
  optimization: {
    workload: "json",
    suiteHash: hash,
    caseIds: ["0", "1", "2"],
    metric: "latency",
  },
};
it("opts into measured ranking while preserving the legacy default", () => {
  const task = taskSchema.parse(input);
  const config = configSchema.parse({ candidates, observations });
  expect(
    route(task, candidates, false, config.observations, 1000).candidate.name,
  ).toBe("b");
  expect(
    route(taskSchema.parse(baseTask), candidates, false, observations, 1000)
      .candidate.name,
  ).toBe("a");
});
it("fails closed when an explicitly requested optimization lacks evidence", () => {
  const task = taskSchema.parse(input);
  expect(() => route(task, candidates, false, [], 1000)).toThrow(/evidence/i);
});
it("never lets measurements override billing, provider, tier, disabled status or effort", () => {
  const task = taskSchema.parse(input);
  for (const override of [
    { billing: "metered" as const },
    { enabled: false },
    { quality: 1 as const, efforts: ["off" as const] },
  ]) {
    const restricted = candidates.map((c) =>
      c.name === "b" ? { ...c, ...override } : c,
    );
    expect(
      route(task, restricted, false, observations, 1000).candidate.name,
    ).toBe("a");
  }
  expect(
    route(
      taskSchema.parse({ ...input, provider: "a" }),
      candidates,
      false,
      observations,
      1000,
    ).candidate.name,
  ).toBe("a");
  expect(() =>
    route(
      taskSchema.parse({ ...input, effort: "high" }),
      candidates,
      false,
      observations,
      1000,
    ),
  ).toThrow(/evidence/i);
  expect(() =>
    route(
      taskSchema.parse({ ...input, minQuality: 3 }),
      candidates,
      false,
      observations,
      1000,
    ),
  ).toThrow();
});
it("compares measured efforts above the floor instead of silently ignoring qualified routes", () => {
  const higher = observations.map((row) => ({
    ...row,
    id: `high-${row.id}`,
    effort: "high",
    elapsedMs: row.provider === "a" ? 1 : 50,
  }));
  const selected = route(
    taskSchema.parse(input),
    candidates,
    false,
    [...observations, ...higher],
    1000,
  );
  expect(selected.candidate.name).toBe("a");
  expect(selected.effort).toBe("high");
  expect(
    route(taskSchema.parse(input), candidates, false, higher, 1000).effort,
  ).toBe("high");
  expect(
    route(
      taskSchema.parse({ ...input, provider: "b", model: "b" }),
      candidates,
      false,
      [...observations, ...higher],
      1000,
    ).effort,
  ).toBe("low");
  expect(
    route(
      taskSchema.parse({ ...input, effort: "high" }),
      candidates,
      false,
      [...observations, ...higher],
      1000,
    ).effort,
  ).toBe("high");
  expect(
    route(taskSchema.parse(baseTask), candidates, false, higher, 1000).effort,
  ).toBe("low");
});
