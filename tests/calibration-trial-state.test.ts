import { expect, test } from "vitest";
import { join } from "node:path";
import { setup } from "./fixtures/pi-calibration.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { preparePiCalibrationTrial } from "../src/pi-calibration-prepare.js";
import { classifyCalibrationTrial } from "../src/calibration-trial-state.js";
test("classifies missing workflow, cancelled, ambiguous and expired worker ownership without changing journals", async () => {
  const f = await setup();
  const p = await preparePiCalibrationTrial(f.input.id, f.trial.id, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
    workflows = new CodingWorkflows(join(f.root, ".harness/workflows.sqlite"));
  const snapshot = coding.read(p.codingId),
    workflow = workflows.read(p.codingId);
  expect(classifyCalibrationTrial(snapshot, null, 100)).toEqual({
    status: "creation_incomplete",
    terminal: false,
  });
  expect(
    classifyCalibrationTrial(
      { ...snapshot, status: "cancelled" },
      workflow,
      100,
    ),
  ).toEqual({ status: "cancelled", terminal: true });
  expect(
    classifyCalibrationTrial(
      { ...snapshot, status: "ambiguous" },
      workflow,
      100,
    ),
  ).toEqual({ status: "ambiguous", terminal: false });
  expect(
    classifyCalibrationTrial(
      {
        ...snapshot,
        status: "running",
        lease: { owner: "test", epoch: 1, until: 99 },
      },
      workflow,
      100,
    ),
  ).toEqual({ status: "ambiguous", terminal: false });
  expect(
    classifyCalibrationTrial(
      snapshot,
      { ...workflow, phase: "blocked", reason: "policy" },
      100,
    ),
  ).toEqual({ status: "blocked", terminal: true });
  expect(
    classifyCalibrationTrial(
      snapshot,
      {
        ...workflow,
        phase: "verified",
        reviewedCheckpointSha256: "0".repeat(64),
      },
      100,
    ),
  ).toEqual({ status: "inconsistent", terminal: false });
  coding.close();
  workflows.close();
});

test("recovering an interrupted review keeps its unresolved outcome outside terminal counts", async () => {
  const f = await setup();
  const p = await preparePiCalibrationTrial(f.input.id, f.trial.id, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
    path = join(f.root, ".harness/workflows.sqlite"),
    workflows = new CodingWorkflows(path);
  const { resumeCoding } = await import("../src/durable-coding.js");
  await resumeCoding(p.codingId, coding, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x=2;" }],
      }),
    ),
  );
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const interrupted = { ...workflows.read(p.codingId), phase: "reviewing" };
  const body = JSON.stringify(interrupted);
  const db = new DatabaseSync(path);
  db.prepare(
    "UPDATE workflows SET body=?,hash=?,owner=NULL,until=0 WHERE id=?",
  ).run(body, createHash("sha256").update(body).digest("hex"), p.codingId);
  db.close();
  expect(
    classifyCalibrationTrial(
      coding.read(p.codingId),
      workflows.read(p.codingId),
      Date.now(),
    ),
  ).toEqual({ status: "ambiguous", terminal: false });
  const recovered = await workflows.resume(p.codingId, coding, () => {
    throw new Error("Review must not replay");
  });
  expect(recovered).toMatchObject({
    phase: "blocked",
    reason: "ambiguous_review",
  });
  expect(
    classifyCalibrationTrial(coding.read(p.codingId), recovered, Date.now()),
  ).toEqual({ status: "ambiguous", terminal: false });
  workflows.close();
  coding.close();
});
