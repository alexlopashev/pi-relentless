import { expect, test } from "vitest";
import { planGoalRun } from "../src/goal-run-plan.js";
const waiting = { action: "idle", phase: "waiting", skipped: [] };
test("temporary waits use earliest authoritative retry bounded by deadline", () => {
  expect(
    planGoalRun(
      {
        ...waiting,
        skipped: [
          { reason: "waiting_retry", retryAt: 900 },
          { reason: "running", retryAt: 800 },
        ],
      },
      100,
    ),
  ).toEqual({ kind: "wait", until: 800 });
  expect(
    planGoalRun(
      { ...waiting, skipped: [{ reason: "waiting_retry", retryAt: 900 }] },
      100,
      700,
    ),
  ).toEqual({ kind: "wait", until: 700 });
  expect(planGoalRun(waiting, 100, 100)).toEqual({
    kind: "stop",
    reason: "expired",
  });
});
test("actions continue, terminal goals stop and blocked work requires attention", () => {
  expect(
    planGoalRun(
      { action: "workflow", phase: "waiting_retry", skipped: [] },
      100,
    ),
  ).toEqual({ kind: "continue" });
  for (const phase of ["completed", "cancelled", "superseded", "expired"])
    expect(planGoalRun({ ...waiting, phase }, 100)).toEqual({
      kind: "stop",
      reason: phase,
    });
  expect(
    planGoalRun(
      { ...waiting, skipped: [{ reason: "policy", retryAt: 900 }] },
      100,
    ),
  ).toEqual({ kind: "stop", reason: "needs_attention" });
  expect(
    planGoalRun(
      { ...waiting, skipped: [{ reason: "dependency_sources_not_applied" }] },
      100,
    ),
  ).toEqual({ kind: "stop", reason: "needs_attention" });
});
test("invalid clocks and retry times cannot cause an unbounded spin", () => {
  for (const now of [-1, NaN, Infinity, 1.5])
    expect(() => planGoalRun(waiting, now)).toThrow();
  for (const retryAt of [NaN, Infinity, 1.5, -1])
    expect(() =>
      planGoalRun(
        { ...waiting, skipped: [{ reason: "waiting_retry", retryAt }] },
        100,
      ),
    ).toThrow();
  expect(
    planGoalRun(
      { ...waiting, skipped: [{ reason: "waiting_retry", retryAt: 99 }] },
      100,
    ),
  ).toEqual({ kind: "stop", reason: "needs_attention" });
});
