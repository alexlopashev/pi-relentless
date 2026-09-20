import { inspectGoalInstallation } from "./goal-source-installation.js";
import { projectGoalWorkProgress } from "./goal-work-progress.js";
import { recordGoalWorkProgress } from "./goal-work-progress-record.js";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { Ledger, digest, requireGoal } from "./ledger.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { reviewAuthors } from "./coding-review.js";
import { configSchema, efforts } from "./router.js";
import { assertGoalWork } from "./goal-work.js";
import { completeGoalWork } from "./goal-work-completion.js";
import { goalWorkEvidenceSchema } from "./goal-work-admission-schema.js";
import { inspectVerification } from "./workflow-verification.js";
import { canonicalDigest } from "./verification-assessment.js";
const routeSchema = z.strictObject({
  candidate: configSchema.shape.candidates.element,
  effort: z.enum(efforts),
});
const reviewSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  checkpointSha256: z.string(),
  requestSha256: z.string(),
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
interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}
interface Inspection {
  root: string;
  coding: CodingJournal;
  workflows: CodingWorkflows;
  snapshot: ReturnType<CodingJournal["read"]>;
  workflow: ReturnType<CodingWorkflows["read"]>;
  evidence: z.infer<typeof goalWorkEvidenceSchema>;
  check: () => void;
}
async function withGoalWorkInspection<T>(
  id: string,
  context: Context,
  action: (inspection: Inspection) => T,
): Promise<T> {
  const check = () => {
    if (context.signal?.aborted || !context.isProjectTrusted())
      throw new Error("Project not active or trusted");
  };
  check();
  const root = await realpath(context.cwd);
  check();
  const paths = {
    goal: join(root, ".harness/ledger.sqlite"),
    coding: join(root, ".harness/coding.sqlite"),
    workflow: join(root, ".harness/workflows.sqlite"),
  };
  if (Object.values(paths).some((p) => !existsSync(p)))
    throw new Error("Missing project journals");
  const coding = new CodingJournal(paths.coding);
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(paths.workflow);
    const snapshot = coding.read(id),
      workflow = workflows.read(id),
      origin = snapshot.request.goalOrigin;
    const checkpointSha256 = digest(JSON.stringify(snapshot));
    const artifact = { codingId: id, checkpointSha256 };
    if (
      !origin ||
      snapshot.request.sourceRoot !== root ||
      snapshot.status !== "ready_for_review" ||
      snapshot.cancelledAt !== null ||
      snapshot.lease !== null ||
      workflow.phase !== "verified" ||
      !workflow.verification?.accepted ||
      !workflow.lastReport ||
      workflow.lastReport !== workflow.reports.at(-1)
    )
      throw new Error("Missing verified goal workflow");
    const goal = assertGoalWork(
      snapshot.request,
      undefined,
      "coder",
      Date.now(),
      snapshot.config,
      artifact,
    );
    if (
      !goal ||
      workflow.verificationContractSha256 !== goal.specificationSha256
    )
      throw new Error("Goal verification binding mismatch");
    const review = reviewSchema.parse(
      JSON.parse(workflow.lastReport) as unknown,
    );
    if (
      review.id !== id ||
      review.revision !== snapshot.revision ||
      review.checkpointSha256 !== checkpointSha256 ||
      review.requestSha256 !== digest(JSON.stringify(workflow.review))
    )
      throw new Error("Review binding mismatch");
    const excluded = new Set(reviewAuthors(snapshot));
    for (const [index, result] of review.reviews.entries()) {
      const selected = result.route;
      const configured = workflow.review.config.candidates.find(
        (c) => c.name === selected.candidate.name,
      );
      if (
        !configured ||
        canonicalDigest(configured) !== canonicalDigest(selected.candidate) ||
        excluded.has(selected.candidate.provider) ||
        canonicalDigest(review.attempts[index]?.route) !==
          canonicalDigest(selected)
      )
        throw new Error("Independent review provenance mismatch");
      assertGoalWork(
        snapshot.request,
        selected,
        "reviewer",
        Date.now(),
        workflow.review.config,
        artifact,
      );
      excluded.add(selected.candidate.provider);
    }
    const proof = await inspectVerification(
      workflows,
      coding,
      id,
      workflow.verification.directory,
    );
    check();
    if (
      !proof.accepted ||
      proof.checkpointSha256 !== checkpointSha256 ||
      proof.specificationSha256 !== goal.specificationSha256 ||
      canonicalDigest(proof) !== canonicalDigest(workflow.verification)
    )
      throw new Error("Missing accepted verification proof");
    const evidence = goalWorkEvidenceSchema.parse({
      codingId: id,
      origin,
      checkpointSha256,
      workflowSha256: canonicalDigest(workflow),
      specificationSha256: proof.specificationSha256,
      attempts: snapshot.attempts,
      files: Object.entries(snapshot.files)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, file]) => ({ path, sha256: digest(file.current) })),
    });
    return action({
      root,
      coding,
      workflows,
      snapshot,
      workflow,
      evidence,
      check,
    });
  } finally {
    workflows?.close();
    coding.close();
  }
}

/** Full independent-review and verification inspection, without acceptance or mutation. */
export async function inspectPiGoalWork(id: string, context: Context) {
  return withGoalWorkInspection(id, context, ({ evidence }) => evidence);
}
/** Complete only under fresh goal/coding/workflow fences. */
export async function admitPiGoalWork(id: string, context: Context) {
  return withGoalWorkInspection(
    id,
    context,
    ({ root, coding, workflows, snapshot, workflow, evidence, check }) => {
      const { origin, checkpointSha256 } = evidence;
      const artifact = { codingId: id, checkpointSha256 };
      const ledger = new Ledger(join(root, ".harness/ledger.sqlite"));
      try {
        const fencedWorkflows = workflows;
        // Fixed order shared with promotion: goal, coding, workflow. No async gaps.
        return ledger.transaction(
          "goal_work_admitted",
          Date.now(),
          (state) => {
            check();
            if (
              digest(JSON.stringify(coding.read(id))) !== checkpointSha256 ||
              canonicalDigest(fencedWorkflows.read(id)) !==
                evidence.workflowSha256
            )
              throw new Error("Workflow changed during admission");
            const current = requireGoal(state, origin.goalId, origin.revision);
            assertGoalWork(
              snapshot.request,
              undefined,
              "coder",
              Date.now(),
              snapshot.config,
              artifact,
            );
            const progress = recordGoalWorkProgress(
              current,
              projectGoalWorkProgress(id, snapshot, workflow, Date.now()),
            );
            const spec = current.contract.tasks.find(
              (t) => t.id === origin.taskId,
            );
            const completionEvidence =
              spec?.acceptance.kind === "workflow" &&
              spec.acceptance.work?.integration === "verified"
                ? {
                    ...evidence,
                    installation: inspectGoalInstallation(root, evidence),
                  }
                : evidence;
            check();
            const completed = completeGoalWork(
              progress,
              origin.taskId,
              completionEvidence,
              Date.now(),
            );
            const task = completed.tasks.find((t) => t.id === origin.taskId);
            if (!task?.workflowAdmission) throw new Error("Missing admission");
            state.goals[state.goals.indexOf(current)] = completed;
            return task.workflowAdmission;
          },
          { codingId: id, origin, checkpointSha256 },
          undefined,
          (commit) =>
            coding.withWriteFence(() => fencedWorkflows.withWriteFence(commit)),
        );
      } finally {
        ledger.close();
      }
    },
  );
}
