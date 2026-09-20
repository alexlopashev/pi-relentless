import { expect, test } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { setup } from "./fixtures/pi-calibration.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { CodingCalibrationJournal } from "../src/coding-calibration-journal.js";
import { preparePiCalibrationTrial } from "../src/pi-calibration-prepare.js";
import { readPiCalibrationReport } from "../src/pi-calibration-report.js";
test("reports every planned slot including unreserved and reserved-but-uncreated work", async () => {
  const f = await setup();
  const before = await readPiCalibrationReport(f.input.id, f.context);
  expect(before).toMatchObject({
    planned: 8,
    terminal: 0,
    complete: false,
    rankingEligible: false,
  });
  expect(before.trials).toHaveLength(8);
  expect(before.trials.every((row) => row.status === "planned")).toBe(true);
  const journal = new CodingCalibrationJournal(
    join(f.root, ".harness/calibration.sqlite"),
  );
  journal.reserve(f.input.id, f.trial.id);
  journal.close();
  const after = await readPiCalibrationReport(f.input.id, f.context);
  expect(after.trials[0]?.status).toBe("reserved");
  expect(after.trials).toHaveLength(8);
  expect(existsSync(join(f.root, ".harness/coding.sqlite"))).toBe(false);
});
test("counts cancelled work as terminal without dropping unfinished trials or claiming routing eligibility", async () => {
  const f = await setup();
  const prepared = await preparePiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
  );
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  coding.cancel(prepared.codingId);
  coding.close();
  const offline = {
    ...f.context,
    models: () => {
      throw new Error("offline");
    },
  };
  const result = await readPiCalibrationReport(f.input.id, offline);
  expect(result).toMatchObject({
    planned: 8,
    terminal: 1,
    complete: false,
    rankingEligible: false,
  });
  expect(result.trials[0]?.status).toBe("cancelled");
  expect(result.trials[0]?.authorElapsedMs).toBeNull();
  expect(result.trials[0]?.authorEstimatedUsd).toBeNull();
  expect(result.trials[0]?.reviewAccounting).toEqual({
    complete: true,
    attempts: 0,
    elapsedMs: 0,
    estimatedUsd: 0,
    knownMeteredUsd: 0,
  });
  expect(result.trials[0]?.workflowElapsedMs).toBeNull();
  expect(result.trials[0]?.workflowEstimatedUsd).toBeNull();
});
test("read-only workflow handles cannot create a missing database or dispatch", async () => {
  const f = await setup();
  const missing = join(f.root, "missing.sqlite");
  expect(() => new CodingWorkflows(missing, { readOnly: true })).toThrow();
  expect(existsSync(missing)).toBe(false);
  const prepared = await preparePiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
  );
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
    { readOnly: true },
  );
  let calls = 0;
  await expect(
    workflows.resume(prepared.codingId, coding, () => {
      calls++;
      return Promise.resolve("{}");
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  expect(workflows.read(prepared.codingId).phase).toBe("coding");
  workflows.close();
  coding.close();
});

test("Pi exposes full cohort accounting without starting work", async () => {
  const f = await setup();
  const { clankerCommand } = await import("../src/pi-extension.js");
  const notices: { message: string; type: string }[] = [];
  await clankerCommand("calibration-report " + f.input.id, {
    ...f.context,
    models: () => {
      throw new Error("Must stay offline");
    },
    ui: {
      notify: (message: string, type: "info" | "error") => {
        notices.push({ message, type });
      },
    },
  });
  expect(notices[0]?.type).toBe("info");
  expect(JSON.parse(notices[0]?.message ?? "null") as unknown).toMatchObject({
    planned: 8,
    terminal: 0,
    rankingEligible: false,
  });
  expect(existsSync(join(f.root, ".harness/coding.sqlite"))).toBe(false);
});

test("verified state remains unadmitted and author-only measurements never hide pending trials", async () => {
  const f = await setup();
  const p = await preparePiCalibrationTrial(f.input.id, f.trial.id, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
    workflows = new CodingWorkflows(join(f.root, ".harness/workflows.sqlite"));
  await workflows.resume(p.codingId, coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "a"
          ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  workflows.close();
  coding.close();
  const { stepPiCalibrationTrial } =
    await import("../src/pi-calibration-step.js");
  const { verificationDrivers } =
    await import("./fixtures/calibration-verification.js");
  await stepPiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
    verificationDrivers(f.input.cases[0]?.execution),
  );
  const report = await readPiCalibrationReport(f.input.id, f.context);
  expect(report).toMatchObject({
    planned: 8,
    terminal: 1,
    complete: false,
    rankingEligible: false,
  });
  expect(report.trials[0]).toMatchObject({
    status: "verified_unadmitted",
    authorMeasurementsComplete: true,
    attempts: 1,
    authorEstimatedUsd: null,
  });
  expect(report.trials[0]?.authorElapsedMs).toBeGreaterThan(0);
  expect(report.trials.filter((row) => row.status === "planned")).toHaveLength(
    7,
  );
  expect(report.trials[0]?.workflowActiveMs).toBeGreaterThan(0);
  // Legacy or incomplete verification telemetry cannot qualify as complete work.
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { z } = await import("zod");
  const db = new DatabaseSync(join(f.root, ".harness/workflows.sqlite"));
  try {
    const stored = db
      .prepare("SELECT body FROM workflows WHERE id=?")
      .get(p.codingId);
    if (typeof stored?.["body"] !== "string") throw Error("fixture");
    const body = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(stored["body"]) as unknown);
    delete body["verificationHistoryComplete"];
    const raw = JSON.stringify(body);
    db.prepare("UPDATE workflows SET body=?,hash=? WHERE id=?").run(
      raw,
      createHash("sha256").update(raw).digest("hex"),
      p.codingId,
    );
  } finally {
    db.close();
  }
  const legacy = await readPiCalibrationReport(f.input.id, f.context);
  expect(legacy.trials[0]?.workflowActiveMs).toBeNull();
});

test("terminal failed author includes known work while unstarted and incomplete stages stay unknown", async () => {
  const f = await setup();
  const p = await preparePiCalibrationTrial(f.input.id, f.trial.id, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  const { Failure } = await import("../src/failures.js");
  await workflows.resume(p.codingId, coding, () =>
    Promise.reject(new Failure("policy")),
  );
  workflows.close();
  coding.close();
  const report = await readPiCalibrationReport(f.input.id, f.context);
  const row = report.trials[0];
  expect(row?.terminal).toBe(true);
  expect(row?.workflowActiveMs).toBe(row?.authorElapsedMs);
  expect(row?.workflowActiveMs).toBeGreaterThan(0);
  expect(report.trials[1]?.workflowActiveMs).toBeNull();
});
