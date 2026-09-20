import { test, expect } from "vitest";
import { fixture } from "./fixtures/coding-calibration.js";
import { planCodingCalibration } from "../src/coding-calibration-plan.js";
import { calibrationObservations } from "../src/calibration-observations.js";
test("requires a prospectively declared measurement protocol and the entire ordered cohort", () => {
  const plan = planCodingCalibration({
    ...fixture(),
    measurement: "author-attempts-v1",
  });
  const rows = plan.trials.map((trial) => ({
    trialId: trial.id,
    accepted: true,
    elapsedMs: 10,
    estimatedUsd: null,
    completedAt: 1000,
  }));
  const observations = calibrationObservations(plan, rows);
  expect(observations).toHaveLength(8);
  expect(() => calibrationObservations(plan, rows.slice(1))).toThrow();
  expect(() => calibrationObservations(plan, [...rows].reverse())).toThrow();
  expect(() =>
    calibrationObservations(planCodingCalibration(fixture()), rows),
  ).toThrow();
});
test("preserves failed slots and unknown metrics without imputing zeros", () => {
  const plan = planCodingCalibration({
    ...fixture(),
    measurement: "author-attempts-v1",
  });
  const rows = plan.trials.map((trial) => ({
    trialId: trial.id,
    accepted: false,
    elapsedMs: null,
    estimatedUsd: null,
    completedAt: 0,
  }));
  expect(calibrationObservations(plan, rows)).toEqual(
    plan.trials.map((trial) => ({
      id: trial.id,
      provider: trial.selection.candidate.provider,
      model: trial.selection.candidate.model,
      billing: trial.selection.candidate.billing,
      effort: trial.selection.effort,
      workload: plan.contract.workload,
      suiteHash: plan.suiteHash,
      caseId: trial.caseId,
      accepted: false,
      elapsedMs: null,
      estimatedUsd: null,
      completedAt: 0,
    })),
  );
});

test("workflow active protocol keeps aggregate work separate from latency and cost", () => {
  const input = fixture();
  const plan = planCodingCalibration({
    ...input,
    measurement: "workflow-active-v1",
  });
  const author = planCodingCalibration({
    ...input,
    measurement: "author-attempts-v1",
  });
  expect(plan.suiteHash).not.toBe(author.suiteHash);
  const rows = plan.trials.map((t) => ({
    trialId: t.id,
    accepted: true,
    elapsedMs: null,
    activeMs: 60,
    estimatedUsd: null,
    completedAt: 1000,
  }));
  const observed = calibrationObservations(plan, rows);
  expect(
    observed.every(
      (r) =>
        r.activeMs === 60 && r.elapsedMs === null && r.estimatedUsd === null,
    ),
  ).toBe(true);
  expect(() =>
    calibrationObservations(
      plan,
      rows.map((r) => ({ ...r, elapsedMs: 60 })),
    ),
  ).toThrow();
  expect(() =>
    calibrationObservations(
      plan,
      rows.map((r) => ({ ...r, estimatedUsd: 0 })),
    ),
  ).toThrow();
  expect(() =>
    calibrationObservations(
      author,
      author.trials.map((t) => ({ ...rows[0], trialId: t.id })),
    ),
  ).toThrow();
});
