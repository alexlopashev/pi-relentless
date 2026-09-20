import { optimizationSchema } from "../src/model-evidence.js";
import { test, expect } from "vitest";
import { setup } from "./fixtures/pi-calibration.js";
import { CodingCalibrationJournal } from "../src/coding-calibration-journal.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { preparePiCalibrationTrial } from "../src/pi-calibration-prepare.js";
import { stepPiCalibrationTrial } from "../src/pi-calibration-step.js";
import { verificationDrivers } from "./fixtures/calibration-verification.js";
import { admitPiCalibration } from "../src/pi-calibration-admission.js";
import { loadPiEvidence } from "../src/pi-evidence.js";
import {
  loadPiProjectConfig,
  piProjectConfigSchema,
} from "../src/pi-project-config.js";
import { relentlessCommand } from "../src/pi-extension.js";
import { readPiCalibrationReport } from "../src/pi-calibration-report.js";
import { route } from "../src/router.js";
import { join } from "node:path";
import { chmod, readFile, writeFile } from "node:fs/promises";
test("admits a complete mixed-result cohort, preserves failed/unknown slots and cannot refresh timestamps", async () => {
  const f = await setup();
  const contract = {
    ...f.input,
    id: "admission",
    repeats: 1,
    measurement: "author-attempts-v1",
  };
  const journal = new CodingCalibrationJournal(
    join(f.root, ".harness/calibration.sqlite"),
  );
  const { plan } = journal.register(contract);
  journal.close();
  await expect(admitPiCalibration(contract.id, f.context)).rejects.toThrow();
  const preparedIds: string[] = [];
  for (const [index, trial] of plan.trials.entries()) {
    const prepared = await preparePiCalibrationTrial(
      contract.id,
      trial.id,
      f.context,
    );
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
    preparedIds.push(prepared.codingId);
    if (index === 0) {
      coding.cancel(prepared.codingId);
      coding.close();
      continue;
    }
    const workflows = new CodingWorkflows(
      join(f.root, ".harness/workflows.sqlite"),
    );
    await workflows.resume(prepared.codingId, coding, (_task, selection) =>
      Promise.resolve(
        JSON.stringify(
          selection.candidate.provider === trial.selection.candidate.provider
            ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
            : { verdict: "no_findings", findings: [] },
        ),
      ),
    );
    workflows.close();
    coding.close();
    const item = contract.cases.find((item) => item.id === trial.caseId);
    if (!item) throw new Error("Missing case");
    await stepPiCalibrationTrial(
      contract.id,
      trial.id,
      f.context,
      verificationDrivers(item.execution),
    );
  }
  const configured = await loadPiProjectConfig(f.root, true);
  if (!configured) throw new Error("Missing project policy");
  const project = piProjectConfigSchema.parse({
    ...configured,
    evidence: { calibrations: [contract.id] },
  });
  const settingsBefore = await readFile(join(f.root, ".pi/settings.json"));
  let checks = 0;
  let cancelledDuringInspection = false;
  await expect(
    admitPiCalibration(contract.id, {
      ...f.context,
      isProjectTrusted: () => {
        if (++checks === 10) {
          const id = preparedIds[1];
          if (!id) throw new Error("Missing binding");
          const coding = new CodingJournal(
            join(f.root, ".harness/coding.sqlite"),
          );
          coding.cancel(id);
          coding.close();
          cancelledDuringInspection = true;
        }
        return true;
      },
    }),
  ).rejects.toThrow();
  expect(cancelledDuringInspection).toBe(true);
  const unchanged = new CodingCalibrationJournal(
    join(f.root, ".harness/calibration.sqlite"),
    { readOnly: true },
  );
  expect(unchanged.read(contract.id).admission).toBeUndefined();
  unchanged.close();
  await expect(loadPiEvidence(f.root, project)).rejects.toThrow(
    /not been admitted/,
  );
  const messages: string[] = [];
  await relentlessCommand(`calibration-admit ${contract.id}`, {
    ...f.context,
    ui: {
      notify: (message, type) => {
        expect(type).toBe("info");
        messages.push(message);
      },
    },
  });
  expect(messages).toHaveLength(1);
  const record = await admitPiCalibration(contract.id, f.context);
  const accounting = await readPiCalibrationReport(contract.id, f.context);
  expect(accounting.trials[2]).toHaveProperty(
    "verificationTiming.scope",
    "prepare_to_assessment",
  );
  expect(record).toHaveProperty("observations.length", 4);
  expect(record).toHaveProperty("observations.0.accepted", false);
  expect(record).toHaveProperty("observations.0.elapsedMs", null);
  expect(await admitPiCalibration(contract.id, f.context)).toEqual(record);
  const loaded = await loadPiEvidence(f.root, project);
  expect(loaded.routing.observations).toEqual(record.observations);
  expect(loaded.routing.candidates).toEqual(project.routing.candidates);
  expect(loaded.routing.allowMetered).toBe(project.routing.allowMetered);
  expect(() =>
    route(
      {
        id: "coding-evidence",
        prompt: "Implement the project task",
        minQuality: 1,
        effort: "low",
        optimization: {
          workload: plan.contract.workload,
          suiteHash: plan.suiteHash,
          caseIds: plan.contract.cases.map((item) => item.id),
          metric: "latency",
          minSamples: 3,
          minCases: 2,
          minSuccessRate: 0.8,
          maxAgeMs: 86400000,
        },
      },
      loaded.routing.candidates,
      loaded.routing.allowMetered,
      loaded.routing.observations,
    ),
  ).toThrow(/sufficient current evidence/);
  expect(await readFile(join(f.root, ".pi/settings.json"))).toEqual(
    settingsBefore,
  );
  const completed = plan.trials[2];
  if (!completed) throw new Error("Missing trial");
  const prepared = await preparePiCalibrationTrial(
    contract.id,
    completed.id,
    f.context,
  );
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  const directory = workflows.read(prepared.codingId).verification?.directory;
  workflows.close();
  if (!directory) throw new Error("Missing proof");
  await chmod(join(directory, "assessment.json"), 0o600);
  await writeFile(join(directory, "assessment.json"), "{}");
  await expect(admitPiCalibration(contract.id, f.context)).rejects.toThrow();
  await expect(loadPiEvidence(f.root, project)).rejects.toThrow();
});

test("evidence references require a nonempty unique list and preserve legacy evaluation input", async () => {
  const f = await setup();
  const project = await loadPiProjectConfig(f.root, true);
  for (const evidence of [
    {},
    { calibrations: [] },
    { calibrations: ["x", "x"] },
  ]) {
    expect(
      piProjectConfigSchema.safeParse({ ...project, evidence }).success,
    ).toBe(false);
  }
  const evidence = { evaluations: [".harness/evaluations/old"] };
  expect(
    piProjectConfigSchema.parse({ ...project, evidence }).evidence,
  ).toEqual(evidence);
});

test("full workflow active measurements reach admitted evidence without becoming latency or cost", async () => {
  const f = await setup();
  const contract = {
    ...f.input,
    id: "active-accounting",
    repeats: 2,
    measurement: "workflow-active-v1",
  };
  const journal = new CodingCalibrationJournal(
    join(f.root, ".harness/calibration.sqlite"),
  );
  const { plan } = journal.register(contract);
  journal.close();
  for (const trial of plan.trials) {
    const p = await preparePiCalibrationTrial(contract.id, trial.id, f.context);
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
    const workflows = new CodingWorkflows(
      join(f.root, ".harness/workflows.sqlite"),
    );
    try {
      await workflows.resume(p.codingId, coding, (_t, r) =>
        Promise.resolve(
          JSON.stringify(
            r.candidate.provider === trial.selection.candidate.provider
              ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
              : { verdict: "no_findings", findings: [] },
          ),
        ),
      );
    } finally {
      workflows.close();
      coding.close();
    }
    const item = contract.cases.find((c) => c.id === trial.caseId);
    if (!item) throw Error("fixture");
    await stepPiCalibrationTrial(
      contract.id,
      trial.id,
      f.context,
      verificationDrivers(item.execution),
    );
  }
  const report = await readPiCalibrationReport(contract.id, f.context);
  for (const row of report.trials) {
    expect(row.workflowActiveMs).toBeGreaterThan(0);
    expect(row.workflowActiveMs).toBe(
      (row.authorElapsedMs ?? 0) +
        (row.reviewAccounting?.elapsedMs ?? 0) +
        (row.verificationHistoryAccounting.elapsedMs ?? 0),
    );
  }
  await admitPiCalibration(contract.id, f.context);
  const { loadPiCalibrationAdmission } =
    await import("../src/pi-calibration-admission.js");
  const saved = await loadPiCalibrationAdmission(contract.id, f.context);
  expect(
    saved.observations.every(
      (r) =>
        r.activeMs !== null &&
        r.activeMs !== undefined &&
        r.elapsedMs === null &&
        r.estimatedUsd === null,
    ),
  ).toBe(true);
  const policy = optimizationSchema.parse({
    workload: contract.workload,
    suiteHash: plan.suiteHash,
    caseIds: contract.cases.map((c) => c.id),
    metric: "activeTime",
    minSamples: 3,
  });
  const configured = await loadPiProjectConfig(f.root, true);
  if (!configured) throw Error("fixture");
  const project = piProjectConfigSchema.parse({
    ...configured,
    evidence: { calibrations: [contract.id] },
  });
  const loaded = await loadPiEvidence(f.root, project);
  expect(
    loaded.routing.observations?.some((r) => r.activeMs !== undefined),
  ).toBe(true);
  // Admitted full-workflow observations drive an actual eligible route.
  const first = plan.contract.cases[0];
  if (!first) throw Error("fixture");
  const selected = route(
    { ...first.request.task, optimization: policy },
    plan.contract.config.candidates,
    false,
    loaded.routing.observations,
  );
  expect(
    plan.contract.config.candidates.some(
      (c) => c.name === selected.candidate.name,
    ),
  ).toBe(true);
  expect(() =>
    route(
      { ...first.request.task, optimization: { ...policy, metric: "latency" } },
      plan.contract.config.candidates,
      false,
      saved.observations,
    ),
  ).toThrow();
  expect(() =>
    route(
      { ...first.request.task, optimization: { ...policy, metric: "cost" } },
      plan.contract.config.candidates,
      false,
      saved.observations,
    ),
  ).toThrow();
});
