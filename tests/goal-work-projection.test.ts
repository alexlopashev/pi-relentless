import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../src/ledger.js";
import { assertGoalWork } from "../src/goal-work.js";
import { codingSchema } from "../src/coding-worker.js";
import { expect, test } from "vitest";
import { goalSchema } from "../src/goal-types.js";
import { projectGoalWork } from "../src/goal-work-projection.js";
function fixture() {
  return goalSchema.parse({
    id: "goal-a",
    revision: 1,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    history: [],
    contract: {
      objective: "Improve the parser",
      constraints: ["Preserve compatibility"],
      config: {
        candidates: [
          {
            name: "a",
            provider: "a",
            model: "a",
            billing: "subscription",
            enabled: true,
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      },
      tasks: [
        {
          id: "fix",
          prompt: "Fix the parser",
          effort: "low",
          minQuality: 1,
          acceptance: {
            kind: "workflow",
            specificationSha256: "a".repeat(64),
            reviewTask: {
              id: "review",
              prompt: "Review parser correctness",
              effort: "low",
              minQuality: 1,
            },
            maxReviewPairs: 1,
          },
        },
      ],
      memories: [
        {
          id: "instruction",
          kind: "instruction",
          authority: "user",
          text: "Keep the API",
          source: "user",
          scope: "fix",
        },
        {
          id: "fact",
          kind: "fact",
          authority: "observation",
          text: "Input can be empty",
          source: "fixture",
          verified: true,
        },
        {
          id: "expired",
          kind: "instruction",
          authority: "user",
          text: "Old rule",
          source: "old",
          expiresAt: 100,
        },
      ],
      maxAttempts: 2,
    },
    tasks: [
      {
        id: "fix",
        status: "ready",
        attempts: 0,
        noProgress: 0,
        dueAt: 0,
        reason: "ready",
      },
    ],
  });
}
test("projects scoped user constraints separately from untrusted evidence with stable identity", () => {
  const g = fixture();
  const p = projectGoalWork(g, "fix", 100);
  expect(p.context.requirements.join("\n")).toContain("Keep the API");
  expect(p.context.requirements.join("\n")).toContain("Preserve compatibility");
  expect(p.context.requirements.join("\n")).toContain("Fix the parser");
  expect(p.context.requirements.join("\n")).not.toContain("Old rule");
  expect(p.context.facts.join("\n")).toContain("Input can be empty");
  expect(p.goalOrigin.revision).toBe(1);
  expect(p.goalOrigin.contractSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(p.goalOrigin.contextSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(p.task.id).toBe(
    projectGoalWork({ ...g, revision: 2 }, "fix", 100).task.id,
  );
  expect(p.maxAttempts).toBe(2);
  expect(p.maxReviewPairs).toBe(1);
  expect(p.specificationSha256).toBe("a".repeat(64));
});
test("refuses inactive goals, expired deadlines, task attempts and unverifiable dependencies", () => {
  const g = fixture();
  expect(() =>
    projectGoalWork({ ...g, status: "cancelled" }, "fix", 100),
  ).toThrow();
  expect(() =>
    projectGoalWork(
      { ...g, contract: { ...g.contract, deadlineAt: 100 } },
      "fix",
      100,
    ),
  ).toThrow();
  expect(() =>
    projectGoalWork(
      { ...g, tasks: g.tasks.map((t) => ({ ...t, attempts: 1 })) },
      "fix",
      100,
    ),
  ).toThrow();
  const spec = g.contract.tasks[0];
  if (!spec) throw new Error("Missing fixture");
  expect(() =>
    projectGoalWork(
      {
        ...g,
        contract: {
          ...g.contract,
          tasks: [{ ...spec, dependsOn: ["missing"] }],
        },
      },
      "fix",
      100,
    ),
  ).toThrow();
});
test("never truncates requirements to fit the coding context budget", () => {
  const g = fixture();
  expect(() =>
    projectGoalWork(
      { ...g, contract: { ...g.contract, constraints: ["x".repeat(3000)] } },
      "fix",
      100,
    ),
  ).toThrow();
});
test("goal authorization validates evidence for the exact dispatched effort", async () => {
  const root = await mkdtemp(join(tmpdir(), "goal-effort-"));
  await mkdir(join(root, ".harness"));
  const ledger = new Ledger(join(root, ".harness/ledger.sqlite"));
  try {
    const g = fixture();
    const now = Date.now();
    const candidate = g.contract.config.candidates[0];
    const task = g.contract.tasks[0];
    if (!candidate || !task) throw new Error("Missing fixture");
    candidate.efforts = ["low", "high"];
    task.optimization = {
      workload: "coding",
      suiteHash: "b".repeat(64),
      caseIds: ["a", "b", "c"],
      metric: "latency",
      minSamples: 3,
      minCases: 2,
      minSuccessRate: 0.8,
      maxAgeMs: 86400000,
    };
    g.contract.config.observations = ["a", "b", "c"].map((caseId) => ({
      id: caseId,
      provider: candidate.provider,
      model: candidate.model,
      billing: candidate.billing,
      effort: "high",
      workload: "coding",
      suiteHash: "b".repeat(64),
      caseId,
      accepted: true,
      completedAt: now,
      elapsedMs: 1,
      estimatedUsd: null,
    }));
    const id = ledger.create(g.contract);
    const projected = projectGoalWork(ledger.goal(id), task.id, now);
    const request = codingSchema.parse({
      sourceRoot: root,
      task: projected.task,
      context: projected.context,
      goalOrigin: projected.goalOrigin,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: projected.maxAttempts,
    });
    expect(() =>
      assertGoalWork(request, { candidate, effort: "low" }, "coder", now),
    ).toThrow();
    expect(() =>
      assertGoalWork(request, { candidate, effort: "high" }, "coder", now),
    ).not.toThrow();
  } finally {
    ledger.close();
    await rm(root, { recursive: true, force: true });
  }
});
