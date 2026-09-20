import { calibrationTrialBinding } from "./calibration-trial-binding.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { CodingCalibrationJournal } from "./coding-calibration-journal.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { attachPiCreation } from "./pi-creation-recovery.js";
import type { SavedPiCreation } from "./pi-creation-intent.js";
import { readDeclaredSource } from "./coding-worker.js";
import { route, type Candidate } from "./router.js";
import { canonicalDigest } from "./verification-assessment.js";
import { verifyPinnedArtifact } from "./pinned-artifact.js";
import { loadPiProjectConfig } from "./pi-project-config.js";
import { piRoleCandidates } from "./pi-role-routing.js";
import type { planPiCalibration } from "./pi-calibration-plan.js";

type Context = Parameters<typeof planPiCalibration>[1];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Materializes a reserved trial without inference; source snapshots and initial intent commit together. */
export async function preparePiCalibrationTrial(
  cohortId: string,
  trialId: string,
  context: Context,
) {
  const check = () => {
    if (!context.isProjectTrusted() || context.signal?.aborted)
      throw new Error("Project no longer active or trusted");
  };
  check();
  const root = await realpath(context.cwd);
  check();
  const calibrationPath = join(root, ".harness/calibration.sqlite");
  if (!existsSync(calibrationPath))
    throw new Error("Missing calibration journal");
  const calibration = new CodingCalibrationJournal(calibrationPath);
  let identity: string;
  let plan;
  try {
    plan = calibration.read(cohortId).plan;
    if (plan.contract.cases.some((item) => item.request.sourceRoot !== root))
      throw new Error("Cohort belongs to another project");
    identity = calibration.reserve(cohortId, trialId);
  } finally {
    calibration.close();
  }
  const { trial, item, key, inputSha256, request, config } =
    calibrationTrialBinding(plan, trialId, identity);
  const execution = item.execution.package;
  for (const artifact of [
    execution.emulator,
    execution.kernel,
    execution.baseImage,
  ])
    await verifyPinnedArtifact(artifact, 512 * 1024 * 1024, context.signal);
  let total = 0;
  for (const artifact of Object.values(execution.tests)) {
    total += await verifyPinnedArtifact(
      artifact,
      8 * 1024 * 1024,
      context.signal,
    );
    if (total > 32 * 1024 * 1024) throw new Error("Test bundle too large");
  }
  check();
  const codingPath = join(root, ".harness/coding.sqlite");
  const attach = (saved: SavedPiCreation, coding: CodingJournal) => {
    check();
    const snapshot = coding.read(saved.id);
    const originalPrompt =
      snapshot.revisions[0]?.prompt ?? snapshot.request.task.prompt;
    if (
      canonicalDigest({
        ...snapshot.request,
        task: { ...snapshot.request.task, prompt: originalPrompt },
      }) !== canonicalDigest(request) ||
      canonicalDigest(snapshot.config) !== canonicalDigest(config)
    )
      throw new Error("Trial coding contract changed");
    for (const [path, sha] of Object.entries(item.sourceHashes))
      if (
        snapshot.files[path] === undefined ||
        (snapshot.files[path].original === null
          ? null
          : hash(snapshot.files[path].original)) !== sha
      )
        throw new Error("Trial source snapshot changed");
    if (
      canonicalDigest(saved.intent.review) !==
        canonicalDigest(plan.contract.review) ||
      saved.intent.maxReviewPairs !== plan.contract.maxReviewPairs
    )
      throw new Error("Trial review contract changed");
    const workflows = new CodingWorkflows(
      join(root, ".harness/workflows.sqlite"),
    );
    try {
      const state = attachPiCreation(saved, coding, workflows);
      return {
        cohortId,
        trialId,
        codingId: saved.id,
        phase: state.phase,
        dispatched: false as const,
        sourcePinsVerified: true as const,
        artifactPinsVerified: true as const,
      };
    } finally {
      workflows.close();
    }
  };
  if (existsSync(codingPath)) {
    const coding = new CodingJournal(codingPath);
    try {
      const saved = coding.findPiCreation(key, inputSha256, root);
      if (saved) return attach(saved, coding);
    } finally {
      coding.close();
    }
  }
  const project = await loadPiProjectConfig(root, true);
  check();
  if (!project) throw new Error("Missing project policy");
  const models = context.models();
  const eligible = (role: "coder" | "reviewer") =>
    piRoleCandidates(
      project,
      role,
      models.available,
      models.scoped,
      {},
      Date.now(),
    );
  const matches = (
    saved: Candidate,
    current: Candidate,
    effort: Candidate["efforts"][number],
  ) =>
    saved.name === current.name &&
    saved.provider === current.provider &&
    saved.model === current.model &&
    saved.billing === current.billing &&
    current.quality >= saved.quality &&
    current.efforts.includes(effort);
  if (
    !eligible("coder").some((current) =>
      matches(trial.selection.candidate, current, trial.selection.effort),
    )
  )
    throw new Error("Assigned author no longer permitted");
  const reviewers = eligible("reviewer");
  const review = plan.contract.review;
  const candidates = review.config.candidates
    .filter((saved) => saved.provider !== trial.selection.candidate.provider)
    .map((saved) => ({
      ...saved,
      efforts: saved.efforts.filter((effort) =>
        reviewers.some((current) => matches(saved, current, effort)),
      ),
    }));
  const first = route(
    review.task,
    candidates,
    review.config.allowMetered,
    review.config.observations,
  );
  route(
    review.task,
    candidates.filter(
      (candidate) => candidate.provider !== first.candidate.provider,
    ),
    review.config.allowMetered,
    review.config.observations,
  );
  const sources: Record<string, string | null> = {};
  for (const file of request.files) {
    const text = await readDeclaredSource(root, file);
    if ((text === null ? null : hash(text)) !== item.sourceHashes[file.path])
      throw new Error("Declared source pin mismatch");
    sources[file.path] = text;
  }
  const current = await loadPiProjectConfig(root, true);
  check();
  if (canonicalDigest(current) !== canonicalDigest(project))
    throw new Error("Project policy changed during preparation");
  const coding = new CodingJournal(codingPath);
  try {
    const saved = coding.createPiWork(request, config, sources, {
      key,
      inputSha256,
      root,
      review: plan.contract.review,
      maxReviewPairs: plan.contract.maxReviewPairs,
    });
    return attach(saved, coding);
  } finally {
    coding.close();
  }
}
