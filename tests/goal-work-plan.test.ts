import { expect, test } from "vitest";
import { goalSchema } from "../src/goal-types.js";
import { planGoalWork } from "../src/goal-work-plan.js";
import { digest } from "../src/ledger.js";
function goal() {
  const task = {
    id: "first",
    prompt: "Fix x",
    minQuality: 1,
    effort: "low",
    acceptance: {
      kind: "workflow",
      specificationSha256: "a".repeat(64),
      reviewTask: { id: "r", prompt: "Review", minQuality: 1, effort: "low" },
      maxReviewPairs: 1,
      work: {
        files: [{ path: "x.ts", writable: true }],
        verificationFile: "verification.json",
      },
    },
  };
  return goalSchema.parse({
    id: "g",
    revision: 1,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    history: [],
    contract: {
      objective: "Fix project",
      constraints: [],
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
        task,
        { ...task, id: "second", dependsOn: ["first"] },
        { ...task, id: "independent" },
      ],
    },
    tasks: ["first", "second", "independent"].map((id) => ({
      id,
      status: "ready",
      attempts: 0,
      dueAt: 0,
      reason: "ready",
    })),
  });
}
test("orders declared eligible work and unlocks dependencies only from current verified output", () => {
  const g = goal();
  expect(planGoalWork(g, 1).tasks).toEqual(["first", "independent"]);
  const first = g.tasks[0];
  if (!first) throw Error("fixture");
  Object.assign(first, {
    status: "completed",
    verifiedRevision: 1,
    output: "artifact",
    outputHash: digest("artifact"),
  });
  expect(planGoalWork(g, 1).tasks).toEqual(["second", "independent"]);
  first.outputHash = "bad";
  expect(planGoalWork(g, 1).tasks).toEqual(["independent"]);
});
test("inactive goals and missing declarations never produce dispatch candidates", () => {
  const g = goal();
  expect(planGoalWork({ ...g, status: "cancelled" }, 1).tasks).toEqual([]);
  expect(
    planGoalWork({ ...g, contract: { ...g.contract, deadlineAt: 1 } }, 1).tasks,
  ).toEqual([]);
  const t = g.contract.tasks[0];
  if (t?.acceptance.kind !== "workflow") throw Error("fixture");
  delete t.acceptance.work;
  expect(planGoalWork(g, 1).tasks).toEqual(["independent"]);
});
test("invalid task state coverage and clocks cannot silently complete a goal", () => {
  const g = goal();
  expect(() => planGoalWork({ ...g, tasks: g.tasks.slice(1) }, 1)).toThrow();
  expect(() => planGoalWork(g, -1)).toThrow();
});
