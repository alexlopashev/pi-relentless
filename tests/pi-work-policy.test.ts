import { expect, test } from "vitest";
import { piWorkPolicy } from "../src/pi-work-policy.js";
import { piProjectConfigSchema } from "../src/pi-project-config.js";
import { taskSchema } from "../src/router.js";
const candidate = (name: string) => ({
  name,
  provider: name,
  model: name,
  billing: "subscription",
  enabled: true,
  quality: 2,
  preference: 1,
  efforts: ["low", "high"],
});
const project = piProjectConfigSchema.parse({
  version: 1,
  routing: {
    candidates: ["author", "review-a", "review-b", "outsider"].map(candidate),
    maxConcurrency: 1,
    timeoutMs: 1200,
    readOnlyAuth: true,
  },
  roles: { coder: ["author"], reviewer: ["review-a", "review-b"] },
});
const available = project.routing.candidates.map((c) => ({
  provider: c.provider,
  model: c.model,
  efforts: c.efforts,
}));
const task = taskSchema.parse({
  id: "fix",
  prompt: "Fix it",
  minQuality: 1,
  effort: "low",
});
test("freezes role-specific configs without mutating project and retains runtime permissions", () => {
  const before = JSON.stringify(project);
  const result = piWorkPolicy(project, available, [], task, task);
  expect(result.coding.candidates.map((c) => c.name)).toEqual(["author"]);
  expect(result.review.candidates.map((c) => c.name)).toEqual([
    "review-a",
    "review-b",
  ]);
  expect(result.coding).toMatchObject({
    timeoutMs: 1200,
    readOnlyAuth: true,
    allowMetered: false,
    maxConcurrency: 1,
  });
  result.coding.candidates[0]?.efforts.pop();
  expect(JSON.stringify(project)).toBe(before);
});
test("rejects creation without two independently routable non-author review providers", () => {
  expect(() =>
    piWorkPolicy(
      project,
      available.filter((c) => c.provider !== "review-b"),
      [],
      task,
      task,
    ),
  ).toThrow();
  expect(() =>
    piWorkPolicy(project, available, [], task, {
      ...task,
      provider: "review-a",
    }),
  ).toThrow();
  const overlapping = structuredClone(project);
  overlapping.roles.coder = ["author", "review-a"];
  expect(() => piWorkPolicy(overlapping, available, [], task, task)).toThrow();
});
test("preserves task pins, exact Pi effort scope and missing model constraints", () => {
  expect(() =>
    piWorkPolicy(project, available, [], { ...task, model: "outsider" }, task),
  ).toThrow();
  expect(() =>
    piWorkPolicy(
      project,
      available,
      available.map((c) => ({ ...c, effort: "low" })),
      { ...task, effort: "high" },
      task,
    ),
  ).toThrow();
  expect(() => piWorkPolicy(project, [], [], task, task)).toThrow();
});

test("an explicit author pin does not require reviews independent of unused coder providers", () => {
  const overlapping = structuredClone(project);
  overlapping.roles.coder = ["author", "review-a"];
  expect(
    piWorkPolicy(
      overlapping,
      available,
      [],
      { ...task, provider: "author" },
      task,
    ).coding.candidates.map((c) => c.name),
  ).toEqual(["author"]);
});
