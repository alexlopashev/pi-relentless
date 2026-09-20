import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CodingCalibrationJournal } from "./coding-calibration-journal.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { readPiCalibrationReport } from "./pi-calibration-report.js";
import { calibrationObservations } from "./calibration-observations.js";
import { calibrationAdmissionSchema } from "./calibration-admission-record.js";
import { inspectVerification } from "./workflow-verification.js";
import { canonicalDigest } from "./verification-assessment.js";
import { configSchema, efforts, route } from "./router.js";
type Context = Parameters<typeof readPiCalibrationReport>[1];
const routeSchema = z.strictObject({
  candidate: configSchema.shape.candidates.element,
  effort: z.enum(efforts),
});
const reviewProofSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  checkpointSha256: z.string(),
  status: z.literal("reviewed"),
  reviews: z
    .array(
      z.strictObject({
        route: routeSchema,
        assessment: z.strictObject({
          verdict: z.literal("no_findings"),
          findings: z.array(z.never()).length(0),
        }),
      }),
    )
    .length(2),
  attempts: z
    .array(z.object({ route: routeSchema, outcome: z.literal("assessed") }))
    .length(2),
});
const snapshotHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function inspectAdmission(
  cohortId: string,
  context: Context,
  requireSaved: boolean,
) {
  const check = () => {
    if (context.signal?.aborted || !context.isProjectTrusted())
      throw new Error("Project no longer active or trusted");
  };
  check();
  const report = await readPiCalibrationReport(cohortId, context);
  if (!report.complete) throw new Error("The entire cohort must be terminal");
  const root = await realpath(context.cwd);
  check();
  const journal = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
    { readOnly: true },
  );
  let coding: CodingJournal | undefined, workflows: CodingWorkflows | undefined;
  try {
    const state = journal.read(cohortId),
      plan = state.plan;
    if (
      !["author-attempts-v1", "workflow-active-v1"].includes(
        plan.contract.measurement ?? "",
      )
    )
      throw new Error("Measurement protocol was not declared prospectively");
    if (requireSaved && !state.admission)
      throw new Error("Cohort has not been admitted");
    if (report.contractSha256 !== plan.contractSha256)
      throw new Error("Cohort changed");
    coding = new CodingJournal(join(root, ".harness/coding.sqlite"), {
      readOnly: true,
    });
    const workflowPath = join(root, ".harness/workflows.sqlite");
    if (existsSync(workflowPath))
      workflows = new CodingWorkflows(workflowPath, { readOnly: true });
    const codingCheckpoints: Record<string, string> = {},
      workflowCheckpoints: Record<string, string | null> = {};
    const codingIds: Record<string, string> = {};
    for (const row of report.trials) {
      check();
      if (!row.codingId || !row.codingCheckpointSha256)
        throw new Error("Missing terminal coding identity");
      const snapshot = coding.read(row.codingId),
        workflow = workflows?.has(row.codingId)
          ? workflows.read(row.codingId)
          : null;
      if (
        snapshotHash(snapshot) !== row.codingCheckpointSha256 ||
        (workflow ? canonicalDigest(workflow) : null) !==
          row.workflowCheckpointSha256
      )
        throw new Error("Journal changed during admission");
      codingCheckpoints[row.id] = row.codingCheckpointSha256;
      codingIds[row.id] = row.codingId;
      workflowCheckpoints[row.id] = row.workflowCheckpointSha256;
      if (row.status !== "verified_unadmitted") continue;
      if (
        !workflow ||
        !workflows ||
        workflow.phase !== "verified" ||
        !workflow.lastReport ||
        workflow.lastReport !== workflow.reports.at(-1)
      )
        throw new Error("Missing final review proof");
      const review = reviewProofSchema.parse(
        JSON.parse(workflow.lastReport) as unknown,
      );
      if (
        review.id !== row.codingId ||
        review.revision !== snapshot.revision ||
        review.checkpointSha256 !== row.codingCheckpointSha256
      )
        throw new Error("Review checkpoint changed");
      const providers = new Set<string>();
      for (const [index, result] of review.reviews.entries()) {
        const selected = result.route;
        const configured = plan.contract.review.config.candidates.find(
          (candidate) => candidate.name === selected.candidate.name,
        );
        if (
          !configured ||
          canonicalDigest(configured) !== canonicalDigest(selected.candidate) ||
          selected.candidate.provider === row.provider ||
          providers.has(selected.candidate.provider) ||
          canonicalDigest(review.attempts[index]?.route) !==
            canonicalDigest(selected) ||
          route(
            plan.contract.review.task,
            [configured],
            plan.contract.review.config.allowMetered,
            plan.contract.review.config.observations,
          ).effort !== selected.effort
        )
          throw new Error("Independent review provenance mismatch");
        providers.add(selected.candidate.provider);
      }
      const trial = plan.trials.find((trial) => trial.id === row.id),
        item = plan.contract.cases.find((item) => item.id === trial?.caseId);
      if (!item) throw new Error("Missing trial case");
      const directory = join(
        root,
        ".harness/calibration-verification",
        row.id,
        row.codingCheckpointSha256,
      );
      if (workflow.verification?.directory !== directory)
        throw new Error("Verification directory mismatch");
      const proof = await inspectVerification(
        workflows,
        coding,
        row.codingId,
        directory,
        item.execution,
      );
      check();
      if (
        !proof.accepted ||
        canonicalDigest(proof) !== canonicalDigest(workflow.verification)
      )
        throw new Error("Missing accepted verification proof");
    }
    const observations = calibrationObservations(
      plan,
      report.trials.map((row) => ({
        trialId: row.id,
        accepted: row.status === "verified_unadmitted",
        ...(plan.contract.measurement === "workflow-active-v1"
          ? {
              activeMs: row.workflowActiveMs,
              elapsedMs: null,
              estimatedUsd: null,
            }
          : {
              elapsedMs:
                row.authorElapsedMs !== null && row.authorElapsedMs > 0
                  ? row.authorElapsedMs
                  : null,
              estimatedUsd: row.authorEstimatedUsd,
            }),
        completedAt: row.completedAt,
      })),
    );
    const record = calibrationAdmissionSchema.parse({
      admittedAt: state.admission?.admittedAt ?? Date.now(),
      observations,
      codingCheckpoints,
      workflowCheckpoints,
    });
    if (
      state.admission &&
      canonicalDigest(state.admission) !== canonicalDigest(record)
    )
      throw new Error("Admitted evidence is stale or changed");
    check();
    return { root, record, codingIds };
  } finally {
    workflows?.close();
    coding?.close();
    journal.close();
  }
}
/** Revalidation is read-only and never refreshes a sample's completion timestamp. */
export async function loadPiCalibrationAdmission(
  cohortId: string,
  context: Context,
) {
  return (await inspectAdmission(cohortId, context, true)).record;
}
/** Admit only a complete, prospectively bound cohort after independent review and VM checks. */
export async function admitPiCalibration(cohortId: string, context: Context) {
  const { root, record, codingIds } = await inspectAdmission(
    cohortId,
    context,
    false,
  );
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project no longer active or trusted");
  const codingPath = join(root, ".harness/coding.sqlite");
  const workflowPath = join(root, ".harness/workflows.sqlite");
  if (!existsSync(codingPath) || !existsSync(workflowPath))
    throw new Error("Admission requires existing coding and workflow journals");
  const coding = new CodingJournal(codingPath);
  let workflows: CodingWorkflows | undefined;
  let journal: CodingCalibrationJournal | undefined;
  try {
    workflows = new CodingWorkflows(workflowPath);
    const fencedWorkflows = workflows;
    journal = new CodingCalibrationJournal(
      join(root, ".harness/calibration.sqlite"),
    );
    const admissionJournal = journal;
    // Fixed lock order, fresh snapshots and no awaits between comparison and admission.
    coding.withWriteFence(() => {
      fencedWorkflows.withWriteFence(() => {
        for (const [trialId, codingId] of Object.entries(codingIds)) {
          if (
            snapshotHash(coding.read(codingId)) !==
              record.codingCheckpoints[trialId] ||
            (fencedWorkflows.has(codingId)
              ? canonicalDigest(fencedWorkflows.read(codingId))
              : null) !== record.workflowCheckpoints[trialId]
          )
            throw new Error("Journal changed before admission commit");
        }
        admissionJournal.admit(cohortId, record);
      });
    });
    return record;
  } finally {
    journal?.close();
    workflows?.close();
    coding.close();
  }
}
