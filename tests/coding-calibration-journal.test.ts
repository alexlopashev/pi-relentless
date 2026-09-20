import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./fixtures/coding-calibration.js";
import { planCodingCalibration } from "../src/coding-calibration-plan.js";
import { CodingCalibrationJournal } from "../src/coding-calibration-journal.js";
const path = () =>
  join(mkdtempSync(join(tmpdir(), "coding-cohort-")), "cohorts.sqlite");
test("persists the complete cohort before any trial, with idempotent creation and immutable policy", () => {
  const file = path();
  const input = fixture();
  const journal = new CodingCalibrationJournal(file);
  const state = journal.register(input);
  expect(state).toEqual({ plan: planCodingCalibration(input), bindings: {} });
  expect(journal.register(input)).toEqual(state);
  expect(() => journal.register({ ...input, repeats: 1 })).toThrow();
  journal.close();
  const reopened = new CodingCalibrationJournal(file);
  expect(reopened.read(input.id)).toEqual(state);
  reopened.close();
});
test("reservation survives reopening and competing handles cannot mint another coding identity", () => {
  const file = path(),
    input = fixture();
  const a = new CodingCalibrationJournal(file);
  a.register(input);
  const trial = planCodingCalibration(input).trials[0];
  if (!trial) throw new Error("Missing trial");
  const first = a.reserve(input.id, trial.id);
  const b = new CodingCalibrationJournal(file);
  expect(b.reserve(input.id, trial.id)).toEqual(first);
  expect(first).toEqual(expect.any(String));
  const before = b.read(input.id);
  expect(() => a.reserve(input.id, "unplanned")).toThrow();
  expect(b.read(input.id)).toEqual(before);
  a.close();
  b.close();
  const c = new CodingCalibrationJournal(file);
  expect(c.reserve(input.id, trial.id)).toEqual(first);
  c.close();
});
test("rejects corrupted storage rather than resetting a saved cohort", () => {
  const file = path();
  const input = fixture();
  const a = new CodingCalibrationJournal(file);
  a.register(input);
  a.close();
  const db = new DatabaseSync(file);
  db.prepare("UPDATE cohorts SET body=? WHERE id=?").run("{}", input.id);
  db.close();
  const b = new CodingCalibrationJournal(file);
  expect(() => b.read(input.id)).toThrow();
  expect(() => b.register(input)).toThrow();
  b.close();
});

test("read-only inspection preserves reservations and refuses mutation", () => {
  const file = path(),
    input = fixture();
  const writer = new CodingCalibrationJournal(file);
  writer.register(input);
  writer.close();
  const reader = new CodingCalibrationJournal(file, { readOnly: true });
  expect(reader.read(input.id)).toHaveProperty("plan.trials.length", 8);
  expect(() => reader.register(input)).toThrow();
  const trial = planCodingCalibration(input).trials[0];
  if (!trial) throw new Error("Missing trial");
  expect(() => reader.reserve(input.id, trial.id)).toThrow();
  reader.close();
});

test("rejects foreign databases and marked journals with missing schema without replacing identities", () => {
  const foreign = path();
  const db = new DatabaseSync(foreign);
  db.exec("CREATE TABLE unrelated(value TEXT)");
  db.close();
  expect(() => new CodingCalibrationJournal(foreign)).toThrow();
  const inspected = new DatabaseSync(foreign);
  expect(
    inspected
      .prepare("SELECT name FROM sqlite_schema WHERE name='cohorts'")
      .get(),
  ).toBeUndefined();
  inspected.close();
  const file = path();
  const journal = new CodingCalibrationJournal(file);
  journal.register(fixture());
  journal.close();
  const damaged = new DatabaseSync(file);
  damaged.exec("DROP TABLE cohorts");
  damaged.close();
  expect(() => new CodingCalibrationJournal(file)).toThrow();
  const reopened = new DatabaseSync(file);
  expect(
    reopened
      .prepare("SELECT name FROM sqlite_schema WHERE name='cohorts'")
      .get(),
  ).toBeUndefined();
  reopened.close();
});

test("admission cannot omit planned slots or overwrite its timestamp", () => {
  const file = path();
  const input = { ...fixture(), measurement: "author-attempts-v1" };
  const journal = new CodingCalibrationJournal(file);
  const state = journal.register(input);
  for (const trial of state.plan.trials) journal.reserve(input.id, trial.id);
  const { plan } = state;
  const observations = plan.trials.map((trial) => ({
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
  }));
  const record = {
    admittedAt: 1,
    observations,
    codingCheckpoints: Object.fromEntries(
      plan.trials.map((trial) => [trial.id, "a".repeat(64)]),
    ),
    workflowCheckpoints: Object.fromEntries(
      plan.trials.map((trial) => [trial.id, null]),
    ),
  };
  expect(() =>
    journal.admit(input.id, { ...record, observations: observations.slice(1) }),
  ).toThrow();
  journal.admit(input.id, record);
  expect(journal.read(input.id).admission).toEqual(record);
  expect(() => journal.admit(input.id, { ...record, admittedAt: 2 })).toThrow();
  journal.close();
  const reopened = new CodingCalibrationJournal(file, { readOnly: true });
  expect(reopened.read(input.id).admission).toEqual(record);
  reopened.close();
});
