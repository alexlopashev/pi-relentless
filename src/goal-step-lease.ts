import { randomUUID } from "node:crypto";
import { Ledger, requireGoal } from "./ledger.js";
interface Context {
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}
/** Shared with text supervision; a process death leaves a bounded lease, not replay authority. */
export async function withGoalStepLease<T>(
  ledger: Ledger,
  id: string,
  context: Context,
  action: (
    signal: AbortSignal,
    check: () => void,
    fence: <R>(commit: () => R) => R,
  ) => Promise<T>,
): Promise<T> {
  const owner = randomUUID(),
    controller = new AbortController();
  const signal = context.signal
    ? AbortSignal.any([context.signal, controller.signal])
    : controller.signal;
  const checkContext = () => {
    if (signal.aborted || !context.isProjectTrusted())
      throw new Error("Goal step inactive");
  };
  checkContext();
  const revision = ledger.transaction(
    "goal_step_started",
    Date.now(),
    (state) => {
      checkContext();
      const now = Date.now();
      if (state.lease && state.lease.until > now)
        throw new Error("Supervisor lease is held");
      const goal = requireGoal(state, id);
      if (goal.status !== "active") throw new Error("Goal is not active");
      state.lease = { owner, until: now + 30000 };
      return goal.revision;
    },
    { id, owner },
  );
  const check = () => {
    try {
      checkContext();
      const state = ledger.read();
      const goal = requireGoal(state, id, revision);
      if (
        state.lease?.owner !== owner ||
        state.lease.until <= Date.now() ||
        ["cancelled", "superseded"].includes(goal.status) ||
        (goal.contract.deadlineAt !== undefined &&
          goal.contract.deadlineAt <= Date.now())
      )
        throw new Error("Goal step lease or contract changed");
    } catch (error) {
      controller.abort();
      throw error;
    }
  };
  const heartbeat = setInterval(() => {
    try {
      check();
      ledger.transaction("goal_step_heartbeat", Date.now(), (state) => {
        if (state.lease?.owner !== owner || state.lease.until <= Date.now())
          throw new Error("Goal step lease lost");
        state.lease.until = Date.now() + 30000;
      });
    } catch {
      controller.abort();
    }
  }, 5000);
  try {
    check();
    const fence = <R>(commit: () => R): R =>
      ledger.transaction("goal_step_effect", Date.now(), () => {
        check();
        return commit();
      });
    const result = await action(signal, check, fence);
    check();
    return result;
  } finally {
    clearInterval(heartbeat);
    controller.abort();
    ledger.transaction(
      "goal_step_stopped",
      Date.now(),
      (state) => {
        if (state.lease?.owner === owner) state.lease = null;
      },
      { id, owner },
    );
  }
}
