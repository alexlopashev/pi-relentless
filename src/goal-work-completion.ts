import { createHash } from "node:crypto";
import { goalSchema, Goal } from "./goal-types.js";
import {
  goalWorkAdmissionSchema,
  goalWorkEvidenceSchema,
} from "./goal-work-admission-schema.js";
import { projectGoalWork } from "./goal-work-projection.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function completeGoalWork(
  goal: Goal,
  taskId: string,
  input: unknown,
  now: number,
): Goal {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid now");
  const clone = goalSchema.parse(goal);
  if (clone.status !== "active" && clone.status !== "completed")
    throw new Error("Goal is not completable");
  if (
    clone.contract.deadlineAt !== undefined &&
    clone.contract.deadlineAt <= now
  )
    throw new Error("Goal deadline expired");

  const evidence = goalWorkEvidenceSchema.parse(input);
  const task = clone.tasks.find((value) => value.id === taskId);
  const spec = clone.contract.tasks.find((value) => value.id === taskId);
  if (task === undefined || spec === undefined) throw new Error("Unknown task");
  if (spec.acceptance.kind !== "workflow")
    throw new Error("Task is not workflow");

  const integrated = spec.acceptance.work?.integration === "verified";
  if (integrated !== (evidence.installation !== undefined))
    throw new Error(
      "Source installation evidence does not match task contract",
    );

  if (task.workflowAdmission !== undefined) {
    const admission = goalWorkAdmissionSchema.parse(task.workflowAdmission);
    const admittedEvidence = goalWorkEvidenceSchema.parse(
      Object.fromEntries(
        Object.entries(admission).filter(([key]) => key !== "admittedAt"),
      ),
    );
    if (!equalJson(admittedEvidence, evidence))
      throw new Error("Evidence mismatch");
    const contractSha256 = sha256(JSON.stringify(clone.contract));
    if (
      evidence.origin.goalId !== clone.id ||
      evidence.origin.taskId !== taskId ||
      evidence.origin.revision !== clone.revision ||
      evidence.origin.contractSha256 !== contractSha256 ||
      task.status !== "completed" ||
      task.verifiedRevision !== clone.revision ||
      task.attempts !== evidence.attempts ||
      task.output === undefined ||
      task.outputHash !== sha256(task.output)
    )
      throw new Error("Invalid completion receipt");
    const expectedOutput = JSON.stringify({
      kind: "verified_workflow",
      codingId: evidence.codingId,
      checkpointSha256: evidence.checkpointSha256,
      specificationSha256: evidence.specificationSha256,
      files: evidence.files,
      sourceApplied: evidence.installation !== undefined,
    });
    if (
      task.output !== expectedOutput ||
      task.outputHash !== sha256(expectedOutput)
    )
      throw new Error("Invalid stored output");
    return clone;
  }

  if (clone.status !== "active") throw new Error("Goal is not active");
  const projected = projectGoalWork(clone, taskId, now);
  if (
    !equalJson(evidence.origin, projected.goalOrigin) ||
    evidence.specificationSha256 !== projected.specificationSha256 ||
    evidence.attempts > projected.maxAttempts
  )
    throw new Error("Invalid workflow evidence");

  const output = JSON.stringify({
    kind: "verified_workflow",
    codingId: evidence.codingId,
    checkpointSha256: evidence.checkpointSha256,
    specificationSha256: evidence.specificationSha256,
    files: evidence.files,
    sourceApplied: evidence.installation !== undefined,
  });
  task.workflowAdmission = { ...evidence, admittedAt: now };
  task.output = output;
  task.outputHash = sha256(output);
  task.status = "completed";
  task.attempts = evidence.attempts;
  task.verifiedRevision = clone.revision;
  task.reason = "verified coding workflow";
  clone.updatedAt = now;
  clone.status = clone.tasks.every(
    (value) =>
      value.status === "completed" &&
      value.verifiedRevision === clone.revision &&
      value.output !== undefined &&
      value.outputHash === sha256(value.output),
  )
    ? "completed"
    : "active";
  return goalSchema.parse(clone);
}
