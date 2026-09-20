import { createHash } from "node:crypto";
import type { Goal } from "./goal-types.js";
import { projectGoalWork } from "./goal-work-projection.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function planGoalWork(
  goal: Goal,
  now: number,
): {
  tasks: string[];
  blocked: { id: string; reason: string }[];
  status: string;
} {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid now");

  const contractIds = goal.contract.tasks.map((task) => task.id);
  const stateIds = goal.tasks.map((task) => task.id);
  if (
    new Set(contractIds).size !== contractIds.length ||
    new Set(stateIds).size !== stateIds.length ||
    contractIds.length !== stateIds.length ||
    contractIds.some((id) => !new Set(stateIds).has(id))
  )
    throw new Error("Task spec/state mismatch");

  if (goal.status !== "active")
    return { tasks: [], blocked: [], status: goal.status };
  if (goal.contract.deadlineAt !== undefined && goal.contract.deadlineAt <= now)
    return { tasks: [], blocked: [], status: "expired" };

  const tasks: string[] = [];
  const blocked: { id: string; reason: string }[] = [];
  for (const spec of goal.contract.tasks) {
    const state = goal.tasks.find((task) => task.id === spec.id);
    if (state === undefined) throw new Error("Task spec/state mismatch");
    if (
      state.status === "completed" &&
      state.verifiedRevision === goal.revision &&
      state.output !== undefined &&
      state.outputHash === sha256(state.output)
    )
      continue;
    if (state.status === "completed") {
      blocked.push({ id: spec.id, reason: "invalid_completion" });
      continue;
    }
    if (spec.acceptance.kind !== "workflow") {
      blocked.push({ id: spec.id, reason: "requires_text_supervisor" });
      continue;
    }
    if (spec.acceptance.work === undefined) {
      blocked.push({ id: spec.id, reason: "missing_work_declaration" });
      continue;
    }
    try {
      projectGoalWork(goal, spec.id, now);
      tasks.push(spec.id);
    } catch {
      blocked.push({ id: spec.id, reason: "goal_constraints_or_dependencies" });
    }
  }
  return { tasks, blocked, status: "active" };
}
