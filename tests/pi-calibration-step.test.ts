import { test, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "./fixtures/pi-calibration.js";
import { preparePiCalibrationTrial } from "../src/pi-calibration-prepare.js";
import { stepPiCalibrationTrial } from "../src/pi-calibration-step.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
test("advances the pinned workflow through current Pi permission checks", async () => {
  const f = await setup();
  let calls = 0;
  const result = await stepPiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
    {
      advance: async (id, options) => {
        await options.beforeDispatch?.("coder", f.trial.selection);
        calls++;
        const coding = new CodingJournal(
            join(f.root, ".harness/coding.sqlite"),
          ),
          workflows = new CodingWorkflows(
            join(f.root, ".harness/workflows.sqlite"),
          );
        try {
          return await workflows.resume(id, coding, (_task, selection) =>
            Promise.resolve(
              JSON.stringify(
                selection.candidate.provider === "a"
                  ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
                  : { verdict: "no_findings", findings: [] },
              ),
            ),
          );
        } finally {
          workflows.close();
          coding.close();
        }
      },
    },
  );
  expect(calls).toBe(1);
  expect(result).toHaveProperty("phase", "verification_required");
});
test("an existing partial VM directory is never replayed", async () => {
  const f = await setup();
  const prepared = await preparePiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
  );
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
    workflows = new CodingWorkflows(join(f.root, ".harness/workflows.sqlite"));
  const state = await workflows.resume(
    prepared.codingId,
    coding,
    (_task, selection) =>
      Promise.resolve(
        JSON.stringify(
          selection.candidate.provider === "a"
            ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
            : { verdict: "no_findings", findings: [] },
        ),
      ),
  );
  const directory = join(
    f.root,
    ".harness/calibration-verification",
    f.trial.id,
    state.reviewedCheckpointSha256 ?? "missing",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "execution.json"),
    JSON.stringify(f.input.cases[0]?.execution),
  );
  let runs = 0;
  await expect(
    stepPiCalibrationTrial(f.input.id, f.trial.id, f.context, {
      run: () => {
        runs++;
        return Promise.resolve(0);
      },
      pack: () => {
        runs++;
        return Promise.resolve(0);
      },
    }),
  ).rejects.toThrow();
  expect(runs).toBe(0);
  expect(workflows.read(prepared.codingId).phase).toBe("verification_required");
  workflows.close();
  coding.close();
});

test("uses the frozen execution contract and reconciles verified work without another VM launch", async () => {
  const f = await setup();
  const prepared = await preparePiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
  );
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
    workflows = new CodingWorkflows(join(f.root, ".harness/workflows.sqlite"));
  await workflows.resume(prepared.codingId, coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "a"
          ? { edits: [{ path: "x.ts", content: "export const x=2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  const { verificationDrivers } =
    await import("./fixtures/calibration-verification.js");
  const execution = f.input.cases[0]?.execution;
  const drivers = verificationDrivers(execution);
  let runs = 0;
  const result = await stepPiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
    {
      ...drivers,
      run: (path, output) => {
        runs++;
        return drivers.run(path, output);
      },
    },
  );
  expect(result).toMatchObject({
    phase: "verified",
    action: "verified_attempt",
  });
  expect(runs).toBe(1);
  const recovered = await stepPiCalibrationTrial(
    f.input.id,
    f.trial.id,
    f.context,
    {
      pack: () => {
        throw new Error("must not repack");
      },
      run: () => {
        throw new Error("must not replay");
      },
    },
  );
  expect(recovered).toMatchObject({ phase: "verified", action: "reconciled" });
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const notices: { message: string; type: string }[] = [];
  await relentlessCommand(
    "calibration-step " +
      JSON.stringify({ cohortId: f.input.id, trialId: f.trial.id }),
    {
      ...f.context,
      ui: {
        notify: (message: string, type: "info" | "error") => {
          notices.push({ message, type });
        },
      },
    },
  );
  expect(notices[0]?.type).toBe("info");
  expect(JSON.parse(notices[0]?.message ?? "null") as unknown).toMatchObject({
    phase: "verified",
    action: "reconciled",
  });

  expect(runs).toBe(1);
  workflows.close();
  coding.close();
});

test("session shutdown and revoked author role prevent dispatch", async () => {
  const f = await setup();
  await preparePiCalibrationTrial(f.input.id, f.trial.id, f.context);
  let calls = 0;
  const advance: NonNullable<
    import("../src/pi-calibration-step.js").CalibrationStepDrivers["advance"]
  > = async (_id, options) => {
    await options.beforeDispatch?.("coder", f.trial.selection);
    calls++;
    throw new Error("Should not dispatch");
  };
  await expect(
    stepPiCalibrationTrial(
      f.input.id,
      f.trial.id,
      { ...f.context, signal: AbortSignal.abort() },
      { advance },
    ),
  ).rejects.toThrow();
  await writeFile(
    join(f.root, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: f.input.config,
        roles: { coder: ["b"] },
      },
    }),
  );
  await expect(
    stepPiCalibrationTrial(f.input.id, f.trial.id, f.context, { advance }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("a repaired checkpoint gets its own verification attempt within the same trial budgets", async () => {
  const f = await setup();
  f.input.id = "repair-cohort";
  f.input.maxReviewPairs = 2;
  for (const item of f.input.cases) item.request.maxAttempts = 2;
  const { CodingCalibrationJournal } =
    await import("../src/coding-calibration-journal.js");
  const journal = new CodingCalibrationJournal(
    join(f.root, ".harness/calibration.sqlite"),
  );
  const state = journal.register(f.input);
  journal.close();
  const trial = state.plan.trials[0];
  if (!trial) throw new Error("Missing trial");
  let version = 2;
  const advance: NonNullable<
    import("../src/pi-calibration-step.js").CalibrationStepDrivers["advance"]
  > = async (id, options) => {
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
      workflows = new CodingWorkflows(
        join(f.root, ".harness/workflows.sqlite"),
      );
    try {
      return await workflows.resume(id, coding, async (_task, selection) => {
        await options.beforeDispatch?.(
          selection.candidate.provider === "a" ? "coder" : "reviewer",
          selection,
        );
        return JSON.stringify(
          selection.candidate.provider === "a"
            ? {
                edits: [
                  {
                    path: "x.ts",
                    content: `export const x=${String(version)};`,
                  },
                ],
              }
            : { verdict: "no_findings", findings: [] },
        );
      });
    } finally {
      workflows.close();
      coding.close();
    }
  };
  expect(
    await stepPiCalibrationTrial(f.input.id, trial.id, f.context, { advance }),
  ).toHaveProperty("phase", "verification_required");
  const { verificationDrivers } =
    await import("./fixtures/calibration-verification.js");
  expect(
    await stepPiCalibrationTrial(
      f.input.id,
      trial.id,
      f.context,
      verificationDrivers(f.input.cases[0]?.execution, true),
    ),
  ).toHaveProperty("phase", "repair");
  version = 3;
  expect(
    await stepPiCalibrationTrial(f.input.id, trial.id, f.context, { advance }),
  ).toHaveProperty("phase", "verification_required");
  expect(
    await stepPiCalibrationTrial(
      f.input.id,
      trial.id,
      f.context,
      verificationDrivers(f.input.cases[0]?.execution),
    ),
  ).toHaveProperty("phase", "verified");
  const { readPiCalibrationReport } =
    await import("../src/pi-calibration-report.js");
  const report = await readPiCalibrationReport(f.input.id, f.context);
  const row = report.trials.find((item) => item.id === trial.id);
  expect(row?.verificationHistoryAccounting).toMatchObject({
    observedAttempts: 2,
    recorded: 2,
    pending: 0,
    complete: true,
  });
  expect(row?.verificationHistoryAccounting.elapsedMs).toBeGreaterThanOrEqual(
    row?.verificationTiming?.activeMs ?? 0,
  );
});
