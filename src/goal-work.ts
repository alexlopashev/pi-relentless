import { completeGoalWork } from "./goal-work-completion.js";
import { goalWorkEvidenceSchema } from "./goal-work-admission-schema.js";
import { DatabaseSync } from "./sqlite.js";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { stateSchema } from "./goal-types.js";
import { projectGoalWork } from "./goal-work-projection.js";
import type { CodingRequest } from "./coding-journal.js";
import {
  configSchema,
  efforts,
  route,
  type Config,
  type Route,
} from "./router.js";
import { Failure } from "./failures.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function readGoalDocument(root: string, goalId: string) {
  const db = new DatabaseSync(join(root, ".harness/ledger.sqlite"), {
    readOnly: true,
  });
  try {
    const row = db.prepare("SELECT body,hash FROM checkpoint WHERE id=1").get();
    if (typeof row?.["body"] !== "string" || hash(row["body"]) !== row["hash"])
      throw new Error("Corrupt goal checkpoint");
    const state = stateSchema.parse(JSON.parse(row["body"]) as unknown);
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) throw new Error("Unknown goal");
    return goal;
  } finally {
    db.close();
  }
}
export function readGoalWork(
  root: string,
  goalId: string,
  taskId: string,
  now = Date.now(),
) {
  return projectGoalWork(readGoalDocument(root, goalId), taskId, now);
}
export function assertGoalWork(
  request: CodingRequest,
  selection?: Route,
  role: "coder" | "reviewer" = "coder",
  now = Date.now(),
  policy?: Config,
  artifact?: { codingId: string; checkpointSha256: string },
) {
  const origin = request.goalOrigin;
  if (!origin) return undefined;
  try {
    let goal = readGoalDocument(request.sourceRoot, origin.goalId);
    const admitted = goal.tasks.find(
      (t) => t.id === origin.taskId,
    )?.workflowAdmission;
    if (artifact && admitted) {
      if (
        admitted.codingId !== artifact.codingId ||
        admitted.checkpointSha256 !== artifact.checkpointSha256 ||
        !same(admitted.origin, origin)
      )
        throw new Error("Artifact admission changed");
      const evidence = Object.fromEntries(
        Object.entries(admitted).filter(([key]) => key !== "admittedAt"),
      );
      goal = completeGoalWork(
        goal,
        origin.taskId,
        goalWorkEvidenceSchema.parse(evidence),
        now,
      );
      // Inspection reconstructs the original context; dispatch never takes this path.
      goal.status = "active";
      const task = goal.tasks.find((t) => t.id === origin.taskId);
      if (!task) throw new Error("Missing admitted task");
      task.status = "ready";
      task.attempts = 0;
    }
    const declaration = goal.contract.tasks.find(
      (t) => t.id === origin.taskId,
    )?.acceptance;
    if (
      declaration?.kind === "workflow" &&
      declaration.work &&
      !same(declaration.work.files, request.files)
    )
      throw new Error("Declared goal files changed");
    const current = projectGoalWork(goal, origin.taskId, now);
    const taskPolicy = { ...request.task, prompt: "" };
    const expectedPolicy = { ...current.task, prompt: "" };
    if (
      !same(origin, current.goalOrigin) ||
      !same(request.context, current.context) ||
      !same(taskPolicy, expectedPolicy) ||
      request.maxAttempts > current.maxAttempts
    )
      throw new Error("Goal binding changed");
    if (
      policy &&
      ((current.config.readOnlyAuth === true && policy.readOnlyAuth !== true) ||
        (policy.allowMetered && !current.config.allowMetered) ||
        policy.timeoutMs > current.config.timeoutMs ||
        policy.maxConcurrency > current.config.maxConcurrency)
    )
      throw new Error("Goal execution policy changed");
    if (selection) {
      const spec = role === "coder" ? current.task : current.reviewTask;
      const candidate = current.config.candidates.find(
        (c) =>
          c.enabled &&
          c.provider === selection.candidate.provider &&
          c.model === selection.candidate.model &&
          c.billing === selection.candidate.billing &&
          (role !== "coder" ||
            !current.allowedCandidates ||
            current.allowedCandidates.includes(c.name)),
      );
      if (
        !candidate ||
        efforts.indexOf(selection.effort) < efforts.indexOf(spec.effort) ||
        !candidate.efforts.includes(selection.effort) ||
        candidate.quality < selection.candidate.quality
      )
        throw new Error("Goal route changed");
      route(
        { ...spec, effort: selection.effort },
        [{ ...candidate, efforts: [selection.effort] }],
        current.config.allowMetered,
        current.config.observations,
        now,
      );
    }
    return current;
  } catch {
    throw new Failure("permission");
  }
}
export function restrictGoalWorkPolicy(
  policy: Config,
  goal: ReturnType<typeof projectGoalWork>,
  role: "coder" | "reviewer",
): Config {
  return configSchema.parse({
    ...policy,
    allowMetered: policy.allowMetered && goal.config.allowMetered,
    ...(policy.readOnlyAuth || goal.config.readOnlyAuth
      ? { readOnlyAuth: true }
      : {}),
    timeoutMs: Math.min(policy.timeoutMs, goal.config.timeoutMs),
    maxConcurrency: Math.min(policy.maxConcurrency, goal.config.maxConcurrency),
    candidates: policy.candidates.flatMap((candidate) => {
      const allowed = goal.config.candidates.find(
        (c) =>
          c.enabled &&
          c.provider === candidate.provider &&
          c.model === candidate.model &&
          c.billing === candidate.billing &&
          (role !== "coder" ||
            !goal.allowedCandidates ||
            goal.allowedCandidates.includes(c.name)),
      );
      if (!allowed) return [];
      const common = candidate.efforts.filter((e) =>
        allowed.efforts.includes(e),
      );
      return common.length
        ? [
            {
              ...candidate,
              quality: Math.min(candidate.quality, allowed.quality),
              efforts: common,
            },
          ]
        : [];
    }),
  });
}

/** The mutating helper owns the actual goal fence, including after parent death. */
export function goalPromotionReference(
  request: CodingRequest,
  artifact?: { codingId: string; checkpointSha256: string },
) {
  const origin = request.goalOrigin;
  if (!origin) return undefined;
  const now = Date.now();
  const goal = readGoalDocument(request.sourceRoot, origin.goalId);
  const projected = assertGoalWork(
    request,
    undefined,
    "coder",
    now,
    undefined,
    artifact,
  );
  if (
    !projected ||
    !same(projected.goalOrigin, origin) ||
    !same(projected.context, request.context)
  )
    throw new Failure("permission");
  const expiries = goal.contract.memories
    .filter(
      (memory) =>
        (memory.scope === "goal" || memory.scope === origin.taskId) &&
        memory.expiresAt !== undefined &&
        memory.expiresAt > now,
    )
    .flatMap((memory) =>
      memory.expiresAt === undefined ? [] : [memory.expiresAt],
    );
  if (goal.contract.deadlineAt !== undefined)
    expiries.push(goal.contract.deadlineAt);
  return {
    path: join(request.sourceRoot, ".harness/ledger.sqlite"),
    expected: goal,
    validUntil: expiries.length ? Math.min(...expiries) : null,
  };
}
