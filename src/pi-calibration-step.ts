import { existsSync } from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { join, dirname } from "node:path";
import { preparePiCalibrationTrial } from "./pi-calibration-prepare.js";
import { CodingCalibrationJournal } from "./coding-calibration-journal.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { workflowCli } from "./workflow-cli.js";
import {
  verifyWorkflow,
  reconcileVerification,
} from "./workflow-verification.js";
import { verificationCli } from "./verification-cli.js";
import { assertPiDispatch } from "./pi-dispatch-policy.js";
import { canonicalDigest } from "./verification-assessment.js";
type Context = Parameters<typeof preparePiCalibrationTrial>[2];
type WorkflowOptions = NonNullable<Parameters<typeof workflowCli>[2]>;
export interface CalibrationStepDrivers {
  advance?: (
    id: string,
    options: WorkflowOptions,
  ) => ReturnType<typeof workflowCli>;
  pack?: (request: string, output: string) => Promise<number>;
  run?: (manifest: string, output: string) => Promise<number>;
}
/** One explicit bounded step; an existing verification directory is reconciliation-only. */
export async function stepPiCalibrationTrial(
  cohortId: string,
  trialId: string,
  context: Context,
  drivers: CalibrationStepDrivers = {},
) {
  const check = () => {
    if (context.signal?.aborted || !context.isProjectTrusted())
      throw new Error("Project no longer active or trusted");
  };
  check();
  const prepared = await preparePiCalibrationTrial(cohortId, trialId, context);
  const summary = { cohortId, trialId, codingId: prepared.codingId };
  const root = await realpath(context.cwd);
  check();
  const journal = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
    { readOnly: true },
  );
  let plan;
  try {
    plan = journal.read(cohortId).plan;
  } finally {
    journal.close();
  }
  const trial = plan.trials.find((trial) => trial.id === trialId);
  const item = plan.contract.cases.find((item) => item.id === trial?.caseId);
  if (!trial || item?.request.sourceRoot !== root)
    throw new Error("Trial/project mismatch");
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  let openedWorkflows: CodingWorkflows | undefined;
  try {
    const workflows = new CodingWorkflows(
      join(root, ".harness/workflows.sqlite"),
    );
    openedWorkflows = workflows;
    const state = workflows.read(prepared.codingId);
    if (state.phase === "blocked")
      return {
        ...summary,
        phase: state.phase,
        action: "blocked" as const,
        reason: state.reason,
      };
    if (state.phase !== "verification_required" && state.phase !== "verified") {
      check();
      const options: WorkflowOptions = {
        ...(context.signal ? { signal: context.signal } : {}),
        beforeDispatch: (role, selection, config) =>
          assertPiDispatch(context, role, selection, config),
      };
      const next = await (drivers.advance
        ? drivers.advance(prepared.codingId, options)
        : workflowCli(["resume", prepared.codingId], root, options));
      return {
        ...summary,
        phase: next.phase,
        action: "workflow" as const,
        retryAt: next.retryAt,
      };
    }
    const checkpoint = state.reviewedCheckpointSha256;
    if (!checkpoint) throw new Error("Missing reviewed checkpoint");
    const directory = join(
      root,
      ".harness/calibration-verification",
      trialId,
      checkpoint,
    );
    check();
    if (
      state.verification &&
      (state.verification.specificationSha256 !==
        canonicalDigest(item.execution) ||
        state.verification.directory !==
          join(
            root,
            ".harness/calibration-verification",
            trialId,
            state.verification.checkpointSha256,
          ))
    )
      throw new Error("Verification is outside the calibration contract");
    if (existsSync(directory)) {
      await reconcileVerification(
        workflows,
        coding,
        prepared.codingId,
        directory,
        item.execution,
      );
      return {
        ...summary,
        phase: workflows.read(prepared.codingId).phase,
        action: "reconciled" as const,
      };
    }
    if (state.phase === "verified")
      throw new Error("Missing verified artifacts");
    await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
    check();
    const invoke = async (
      kind: "pack" | "run",
      input: string,
      output: string,
    ) => {
      check();
      const custom = kind === "pack" ? drivers.pack : drivers.run;
      const exit = await (custom
        ? custom(input, output)
        : verificationCli(
            [kind === "pack" ? "package" : "run", input, output],
            context.signal,
          ));
      check();
      return exit;
    };
    await verifyWorkflow(
      workflows,
      coding,
      prepared.codingId,
      item.execution,
      directory,
      {
        pack: (input, output) => invoke("pack", input, output),
        run: (input, output) => invoke("run", input, output),
      },
    );
    return {
      ...summary,
      phase: workflows.read(prepared.codingId).phase,
      action: "verified_attempt" as const,
    };
  } finally {
    openedWorkflows?.close();
    coding.close();
  }
}
