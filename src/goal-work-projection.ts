import { createHash } from "node:crypto";
import { codingContextSchema } from "./coding-context.js";
import { goalWorkOriginSchema } from "./goal-work-origin.js";
import { Goal } from "./goal-types.js";
import { taskSchema } from "./router.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function projectGoalWork(goal: Goal, taskId: string, now: number) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid now");
  if (goal.status !== "active") throw new Error("Goal is not active");
  if (goal.contract.deadlineAt !== undefined && goal.contract.deadlineAt <= now)
    throw new Error("Goal deadline expired");

  const spec = goal.contract.tasks.find((task) => task.id === taskId);
  const state = goal.tasks.find((task) => task.id === taskId);
  if (spec === undefined || state?.id !== spec.id)
    throw new Error("Task spec/state mismatch");
  if (spec.acceptance.kind !== "workflow")
    throw new Error("Task is not workflow");
  if (
    state.attempts > 0 ||
    ["completed", "blocked_policy", "running", "blocked_constraints"].includes(
      state.status,
    )
  )
    throw new Error("Task cannot be projected");

  const dependencyEvidence: string[] = [];
  for (const dependencyId of spec.dependsOn) {
    const dependency = goal.tasks.find((task) => task.id === dependencyId);
    if (
      dependency?.status !== "completed" ||
      dependency.verifiedRevision !== goal.revision ||
      dependency.output === undefined ||
      dependency.outputHash !== sha256(dependency.output)
    )
      throw new Error("Dependency is not verified");
    dependencyEvidence.push(
      JSON.stringify({
        id: dependency.id,
        output: dependency.output,
        hash: dependency.outputHash,
      }),
    );
  }

  const requirements = [
    goal.contract.objective,
    spec.prompt,
    ...goal.contract.constraints,
  ];
  const facts: string[] = [];
  for (const memory of goal.contract.memories) {
    if (
      (memory.scope === "goal" || memory.scope === taskId) &&
      (memory.expiresAt === undefined || memory.expiresAt > now)
    ) {
      if (memory.kind === "instruction") requirements.push(memory.text);
      else facts.push(JSON.stringify(memory));
    }
  }
  facts.push(...dependencyEvidence);
  const context = codingContextSchema.parse({ requirements, facts });
  const key = `goal-work-${sha256(JSON.stringify([goal.id, taskId]))}`;
  const task = taskSchema.parse({
    id: key,
    prompt: spec.prompt,
    minQuality: spec.minQuality,
    effort: spec.effort,
    ...(spec.provider === undefined ? {} : { provider: spec.provider }),
    ...(spec.model === undefined ? {} : { model: spec.model }),
    ...(spec.optimization === undefined
      ? {}
      : { optimization: spec.optimization }),
  });
  const goalOrigin = goalWorkOriginSchema.parse({
    goalId: goal.id,
    taskId,
    revision: goal.revision,
    contractSha256: sha256(JSON.stringify(goal.contract)),
    contextSha256: sha256(JSON.stringify(context)),
  });
  return {
    task,
    context,
    goalOrigin,
    maxAttempts: Math.min(5, goal.contract.maxAttempts),
    reviewTask: spec.acceptance.reviewTask,
    maxReviewPairs: spec.acceptance.maxReviewPairs,
    specificationSha256: spec.acceptance.specificationSha256,
    config: goal.contract.config,
    allowedCandidates: spec.allowedCandidates,
  };
}
