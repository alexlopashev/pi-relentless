import { setTimeout as sleep } from "node:timers/promises";

export async function runWorkflow<
  T extends { phase: string; retryAt: number | null },
>(
  resume: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  wait?: (ms: number, signal: AbortSignal) => Promise<void>,
  now: () => number = Date.now,
  verify?: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const stopped = (): boolean => signal.aborted;
  if (stopped()) return null;

  const waitFor =
    wait ??
    ((ms: number, abortSignal: AbortSignal): Promise<void> =>
      sleep(ms, undefined, { signal: abortSignal }).then(() => undefined));

  let state: T | null = null;

  while (!stopped()) {
    state = await resume(signal);

    if (state.phase === "verification_required" && verify !== undefined) {
      if (stopped()) return state;
      state = await verify(signal);
      if (stopped()) return state;
    }

    if (
      state.phase === "blocked" ||
      state.phase === "verification_required" ||
      state.phase === "verified"
    ) {
      return state;
    }

    if (stopped()) return state;

    const current = now();
    const target =
      state.retryAt !== null && state.retryAt > current
        ? state.retryAt
        : current + 1000;

    while (!stopped()) {
      const remaining = target - now();
      if (remaining <= 0) break;

      try {
        await waitFor(Math.min(remaining, 30000), signal);
      } catch (error) {
        if (stopped()) return state;
        throw error;
      }

      if (stopped()) return state;
    }
  }

  return state;
}
