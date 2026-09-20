import { reviewRoutes } from "./review-routing.js";
import { route } from "./router.js";
import { assertGoalWork, restrictGoalWorkPolicy } from "./goal-work.js";
import { loadPiEvidence } from "./pi-evidence.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { attachPiCreation } from "./pi-creation-recovery.js";
import type { SavedPiCreation } from "./pi-creation-intent.js";
import { z } from "zod";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { codingSchema, readDeclaredSource } from "./coding-worker.js";
import { taskSchema } from "./router.js";
import { loadPiProjectConfig } from "./pi-project-config.js";
import type { CatalogEntry } from "./model-inventory.js";
import { piWorkPolicy } from "./pi-work-policy.js";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows, type WorkflowState } from "./coding-workflow.js";
const inputSchema = z.strictObject({
  task: codingSchema.shape.task,
  context: codingSchema.shape.context,
  goalOrigin: codingSchema.shape.goalOrigin,
  files: codingSchema.shape.files,
  maxAttempts: codingSchema.shape.maxAttempts,
  reviewTask: taskSchema,
  maxReviewPairs: z.number().int().min(1).max(5),
});
interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
  models(): {
    available: readonly CatalogEntry[];
    scoped: readonly { provider: string; model: string; effort?: string }[];
  };
}
/** Creation snapshots inputs, never starts inference or modifies source files. */
export async function createPiWork(
  text: string,
  context: Context,
): Promise<{
  id: string;
  phase: WorkflowState["phase"] | "creation_incomplete";
  dispatched: false;
}> {
  const check = () => {
    if (!context.isProjectTrusted() || context.signal?.aborted)
      throw new Error("Project no longer active or trusted");
  };
  check();
  if (Buffer.byteLength(text) > 65536)
    throw new Error("Creation input exceeds 64 KiB");
  const input = inputSchema.parse(JSON.parse(text) as unknown);
  const root = await realpath(context.cwd);
  check();
  const inputSha256 = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  if (input.task.id.length > 200)
    throw new Error("Creation task id exceeds 200 characters");
  const {
    reviewTask: goalReviewTask,
    maxReviewPairs: goalReviewPairs,
    ...goalRequest
  } = input;
  const checkedGoal = assertGoalWork(
    codingSchema.parse({ ...goalRequest, sourceRoot: root }),
  );
  if (
    checkedGoal &&
    (JSON.stringify(goalReviewTask) !==
      JSON.stringify(checkedGoal.reviewTask) ||
      goalReviewPairs !== checkedGoal.maxReviewPairs)
  )
    throw new Error("Goal review contract changed");
  const codingPath = join(root, ".harness/coding.sqlite");
  const attach = (saved: SavedPiCreation, coding: CodingJournal) => {
    check();
    let workflows: CodingWorkflows | undefined;
    try {
      workflows = new CodingWorkflows(join(root, ".harness/workflows.sqlite"));
      attachPiCreation(saved, coding, workflows);
      const goal = assertGoalWork(coding.read(saved.id).request);
      if (goal)
        workflows.bindVerificationContract(saved.id, goal.specificationSha256);
      return {
        id: saved.id,
        phase: workflows.read(saved.id).phase,
        dispatched: false as const,
      };
    } catch {
      return {
        id: saved.id,
        phase: "creation_incomplete" as const,
        dispatched: false as const,
      };
    } finally {
      workflows?.close();
    }
  };
  if (existsSync(codingPath)) {
    const coding = new CodingJournal(codingPath);
    try {
      const saved = coding.findPiCreation(input.task.id, inputSha256, root);
      if (saved) return attach(saved, coding);
    } finally {
      coding.close();
    }
  }
  const project = await loadPiProjectConfig(root, true);
  if (!project) throw new Error("Missing Relentless project settings");
  const { reviewTask, maxReviewPairs, ...codingInput } = input;
  const request = codingSchema.parse({ ...codingInput, sourceRoot: root });
  const files: Record<string, string | null> = {};
  for (const file of request.files)
    files[file.path] = await readDeclaredSource(root, file);
  const evidenced = await loadPiEvidence(root, project);
  const current = await loadPiProjectConfig(root, true);
  check();
  if (JSON.stringify(current) !== JSON.stringify(project))
    throw new Error("Project policy changed during creation");
  const models = context.models();
  let policy = piWorkPolicy(
    evidenced,
    models.available,
    models.scoped,
    request.task,
    reviewTask,
  );
  check();
  const currentGoal = assertGoalWork(request);
  if (currentGoal)
    policy = {
      coding: restrictGoalWorkPolicy(policy.coding, currentGoal, "coder"),
      review: restrictGoalWorkPolicy(policy.review, currentGoal, "reviewer"),
    };
  route(
    request.task,
    policy.coding.candidates,
    policy.coding.allowMetered,
    policy.coding.observations,
  );
  for (const author of new Set(
    policy.coding.candidates.map((c) => c.provider),
  )) {
    if (
      reviewRoutes(reviewTask, policy.review, [author], {}, Date.now())
        .status !== "available"
    )
      throw new Error("No goal-permitted independent reviewers");
  }
  const coding = new CodingJournal(codingPath);
  try {
    const saved = coding.createPiWork(request, policy.coding, files, {
      key: input.task.id,
      inputSha256,
      root,
      review: { task: reviewTask, config: policy.review },
      maxReviewPairs,
    });
    return attach(saved, coding);
  } finally {
    coding.close();
  }
}
