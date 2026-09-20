type GoalRunPlan =
  | { kind: "continue" }
  | { kind: "wait"; until: number }
  | { kind: "stop"; reason: string };

export function planGoalRun(
  result: {
    action: string;
    phase: string;
    skipped: readonly { reason: string; retryAt?: number }[];
  },
  now: number,
  deadlineAt?: number,
): GoalRunPlan {
  const validClock = (value: number): boolean =>
    Number.isSafeInteger(value) && value >= 0;

  if (
    !validClock(now) ||
    (deadlineAt !== undefined && !validClock(deadlineAt))
  ) {
    throw new Error("invalid clock");
  }
  for (const skipped of result.skipped) {
    if (skipped.retryAt !== undefined && !validClock(skipped.retryAt)) {
      throw new Error("invalid retry time");
    }
  }

  if (deadlineAt !== undefined && deadlineAt <= now) {
    return { kind: "stop", reason: "expired" };
  }
  if (result.action !== "idle") {
    return { kind: "continue" };
  }
  if (
    ["completed", "cancelled", "superseded", "expired"].includes(result.phase)
  ) {
    return { kind: "stop", reason: result.phase };
  }

  let earliest: number | undefined;
  for (const skipped of result.skipped) {
    if (
      (skipped.reason === "waiting_retry" || skipped.reason === "running") &&
      skipped.retryAt !== undefined &&
      skipped.retryAt > now &&
      (earliest === undefined || skipped.retryAt < earliest)
    ) {
      earliest = skipped.retryAt;
    }
  }
  if (earliest !== undefined) {
    return {
      kind: "wait",
      until:
        deadlineAt === undefined ? earliest : Math.min(earliest, deadlineAt),
    };
  }
  return { kind: "stop", reason: "needs_attention" };
}
