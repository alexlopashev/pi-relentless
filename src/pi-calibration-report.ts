import { workflowActiveTime } from "./workflow-active-time.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { CodingCalibrationJournal } from "./coding-calibration-journal.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { calibrationTrialBinding } from "./calibration-trial-binding.js";
import { classifyCalibrationTrial } from "./calibration-trial-state.js";
import { canonicalDigest } from "./verification-assessment.js";
import { reviewAccounting } from "./review-accounting.js";
import { verificationTiming } from "./verification-timing.js";
import { verificationHistoryAccounting } from "./verification-history-accounting.js";
interface ReportContext {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Read-only accounting. Verified workflow state is not admitted routing evidence. */
export async function readPiCalibrationReport(
  cohortId: string,
  context: ReportContext,
) {
  const check = () => {
    if (context.signal?.aborted || !context.isProjectTrusted())
      throw new Error("Project no longer active or trusted");
  };
  check();
  if (!cohortId || cohortId.length > 200) throw new Error("Invalid cohort ID");
  const root = await realpath(context.cwd);
  check();
  const calibration = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
    { readOnly: true },
  );
  let coding: CodingJournal | undefined, workflows: CodingWorkflows | undefined;
  try {
    const state = calibration.read(cohortId),
      plan = state.plan;
    if (plan.contract.cases.some((item) => item.request.sourceRoot !== root))
      throw new Error("Cohort belongs to another project");
    const codingPath = join(root, ".harness/coding.sqlite"),
      workflowPath = join(root, ".harness/workflows.sqlite");
    if (existsSync(codingPath))
      coding = new CodingJournal(codingPath, { readOnly: true });
    if (existsSync(workflowPath))
      workflows = new CodingWorkflows(workflowPath, { readOnly: true });
    const now = Date.now();
    const trials = plan.trials.map((trial) => {
      check();
      const base = {
        id: trial.id,
        index: trial.index,
        repeat: trial.repeat,
        caseId: trial.caseId,
        provider: trial.selection.candidate.provider,
        model: trial.selection.candidate.model,
        billing: trial.selection.candidate.billing,
        effort: trial.selection.effort,
        authorElapsedMs: null as number | null,
        authorEstimatedUsd: null as number | null,
        authorMeasurementsComplete: false,
        attempts: 0,
        codingId: null as string | null,
        codingCheckpointSha256: null as string | null,
        workflowCheckpointSha256: null as string | null,
        completedAt: 0,
        reviewAccounting: null as ReturnType<typeof reviewAccounting> | null,
        modelAttemptElapsedMs: null as number | null,
        modelAttemptEstimatedUsd: null as number | null,
        workflowElapsedMs: null,
        workflowActiveMs: null as number | null,
        workflowEstimatedUsd: null,
        verificationHistoryAccounting: verificationHistoryAccounting(
          undefined,
          false,
        ),
        verificationTiming: null as ReturnType<
          typeof verificationTiming
        > | null,
      };
      const identity = state.bindings[trial.id];
      if (!identity) return { ...base, status: "planned", terminal: false };
      if (!coding) return { ...base, status: "reserved", terminal: false };
      const binding = calibrationTrialBinding(plan, trial.id, identity);
      const saved = coding.findPiCreation(
        binding.key,
        binding.inputSha256,
        root,
      );
      if (!saved) return { ...base, status: "reserved", terminal: false };
      const snapshot = coding.read(saved.id);
      const originalPrompt =
        snapshot.revisions[0]?.prompt ?? snapshot.request.task.prompt;
      if (
        canonicalDigest({
          ...snapshot.request,
          task: { ...snapshot.request.task, prompt: originalPrompt },
        }) !== canonicalDigest(binding.request) ||
        canonicalDigest(snapshot.config) !== canonicalDigest(binding.config) ||
        canonicalDigest(saved.intent.review) !==
          canonicalDigest(plan.contract.review) ||
        saved.intent.maxReviewPairs !== plan.contract.maxReviewPairs
      )
        throw new Error("Trial contract changed");
      for (const [path, sha] of Object.entries(binding.item.sourceHashes))
        if (
          snapshot.files[path] === undefined ||
          (snapshot.files[path].original === null
            ? null
            : hash(snapshot.files[path].original)) !== sha
        )
          throw new Error("Trial source snapshot changed");
      const workflow = workflows?.has(saved.id)
        ? workflows.read(saved.id)
        : null;
      if (
        workflow &&
        (canonicalDigest(workflow.review) !==
          canonicalDigest(plan.contract.review) ||
          workflow.maxReviewPairs !== plan.contract.maxReviewPairs)
      )
        throw new Error("Workflow review policy changed");
      const measurements = snapshot.measurements ?? [];
      const complete =
        snapshot.attempts > 0 &&
        measurements.length === snapshot.attempts &&
        snapshot.dispatches.length === snapshot.attempts &&
        snapshot.dispatches.every(
          (dispatch) =>
            dispatch.candidate === trial.selection.candidate.name &&
            dispatch.effort === trial.selection.effort,
        );
      const elapsed = complete
        ? measurements.reduce((sum, item) => sum + item.elapsedMs, 0)
        : null;
      const cost =
        complete &&
        trial.selection.candidate.billing === "metered" &&
        measurements.every((item) => item.estimatedUsd !== null)
          ? measurements.reduce(
              (sum, item) => sum + (item.estimatedUsd ?? 0),
              0,
            )
          : null;
      const reviews = workflow
        ? reviewAccounting(workflow.reports, workflow.reviewPairsUsed)
        : null;
      const modelElapsed =
        elapsed !== null &&
        reviews?.elapsedMs !== null &&
        reviews?.elapsedMs !== undefined
          ? elapsed + reviews.elapsedMs
          : null;
      const modelCost =
        cost !== null &&
        reviews?.estimatedUsd !== null &&
        reviews?.estimatedUsd !== undefined
          ? cost + reviews.estimatedUsd
          : null;
      const classification = classifyCalibrationTrial(snapshot, workflow, now);
      const verificationAccounting = verificationHistoryAccounting(
        workflow?.verificationAttempts,
        workflow?.verificationHistoryComplete === true,
      );
      return {
        ...base,
        ...classification,
        workflowActiveMs: workflowActiveTime(
          classification.terminal,
          elapsed,
          reviews?.elapsedMs ?? null,
          verificationAccounting.elapsedMs,
        ),
        codingId: saved.id,
        codingCheckpointSha256: hash(JSON.stringify(snapshot)),
        workflowCheckpointSha256: workflow ? canonicalDigest(workflow) : null,
        completedAt: Math.max(
          snapshot.cancelledAt ?? 0,
          ...measurements.map((measurement) => measurement.completedAt),
        ),
        attempts: snapshot.attempts,
        reviewAccounting: reviews,
        verificationTiming: workflow?.verification?.timing ?? null,
        verificationHistoryAccounting: verificationAccounting,
        modelAttemptElapsedMs:
          modelElapsed !== null && Number.isFinite(modelElapsed)
            ? modelElapsed
            : null,
        modelAttemptEstimatedUsd:
          modelCost !== null && Number.isFinite(modelCost) ? modelCost : null,
        authorMeasurementsComplete: complete,
        authorElapsedMs:
          elapsed !== null && Number.isFinite(elapsed) ? elapsed : null,
        authorEstimatedUsd:
          cost !== null && Number.isFinite(cost) ? cost : null,
      };
    });
    return {
      cohortId,
      contractSha256: plan.contractSha256,
      suiteHash: plan.suiteHash,
      planned: trials.length,
      terminal: trials.filter((trial) => trial.terminal).length,
      complete: trials.every((trial) => trial.terminal),
      rankingEligible: false as const,
      snapshotConsistency: "independent_journals" as const,
      trials,
    };
  } finally {
    workflows?.close();
    coding?.close();
    calibration.close();
  }
}
