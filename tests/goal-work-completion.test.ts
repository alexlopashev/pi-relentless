import { expect, test } from "vitest";
import { goalSchema } from "../src/goal-types.js";
import { projectGoalWork } from "../src/goal-work-projection.js";
import { completeGoalWork } from "../src/goal-work-completion.js";
const goal = () =>
  goalSchema.parse({
    id: "g",
    revision: 1,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    history: [],
    contract: {
      objective: "Fix x",
      constraints: [],
      config: {
        candidates: [
          {
            name: "local",
            provider: "local",
            model: "local",
            billing: "subscription",
            enabled: true,
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      },
      maxAttempts: 2,
      tasks: [
        {
          id: "x",
          prompt: "Fix x",
          minQuality: 1,
          effort: "low",
          acceptance: {
            kind: "workflow",
            specificationSha256: "a".repeat(64),
            reviewTask: {
              id: "r",
              prompt: "Review",
              minQuality: 1,
              effort: "low",
            },
            maxReviewPairs: 1,
          },
        },
      ],
    },
    tasks: [
      { id: "x", status: "ready", attempts: 0, dueAt: 0, reason: "ready" },
    ],
  });
function receipt(g = goal()) {
  return {
    codingId: "coding-id",
    origin: projectGoalWork(g, "x", 1).goalOrigin,
    checkpointSha256: "b".repeat(64),
    workflowSha256: "c".repeat(64),
    specificationSha256: "a".repeat(64),
    attempts: 1,
    files: [{ path: "x.ts", sha256: "d".repeat(64) }],
  };
}
test("completion stores provenance and accounts author attempts atomically without mutating input", () => {
  const g = goal();
  const r = receipt(g);
  const done = completeGoalWork(g, "x", r, 2);
  expect(g.tasks[0]?.status).toBe("ready");
  expect(done.status).toBe("completed");
  expect(done.tasks[0]).toMatchObject({
    status: "completed",
    attempts: 1,
    verifiedRevision: 1,
    workflowAdmission: { ...r, admittedAt: 2 },
  });
  expect(JSON.parse(done.tasks[0]?.output ?? "{}")).toMatchObject({
    kind: "verified_workflow",
    codingId: "coding-id",
    sourceApplied: false,
  });
  expect(completeGoalWork(done, "x", r, 3)).toEqual(done);
});
test("rejects stale, expired, changed or over-budget completion and mismatching retries", () => {
  const g = goal();
  const r = receipt(g);
  for (const changed of [
    { ...r, attempts: 3 },
    { ...r, specificationSha256: "f".repeat(64) },
    { ...r, origin: { ...r.origin, revision: 2 } },
  ])
    expect(() => completeGoalWork(g, "x", changed, 2)).toThrow();
  expect(() =>
    completeGoalWork({ ...g, status: "cancelled" }, "x", r, 2),
  ).toThrow();
  expect(() =>
    completeGoalWork(
      { ...g, contract: { ...g.contract, deadlineAt: 2 } },
      "x",
      r,
      2,
    ),
  ).toThrow();
  const done = completeGoalWork(g, "x", r, 2);
  expect(() =>
    completeGoalWork(done, "x", { ...r, codingId: "other" }, 3),
  ).toThrow();
});
test("only current verified dependencies unlock; completing one task leaves others active", () => {
  const g = goal();
  const spec = g.contract.tasks[0];
  if (!spec) throw Error("fixture");
  g.contract.tasks.push({ ...spec, id: "next", dependsOn: ["x"] });
  g.tasks.push({
    id: "next",
    status: "ready",
    attempts: 0,
    noProgress: 0,
    dueAt: 0,
    reason: "ready",
  });
  const done = completeGoalWork(g, "x", receipt(g), 2);
  expect(done.status).toBe("active");
  expect(projectGoalWork(done, "next", 3).context.facts.join(" ")).toContain(
    "verified_workflow",
  );
});
