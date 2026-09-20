import { route, type Config, type Route, type Task } from "./router.js";

export type CodingRouteResult =
  | { status: "available"; selection: Route }
  | { status: "waiting_retry"; dueAt: number }
  | { status: "blocked" };

function assertSafeNonnegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a safe nonnegative integer`);
  }
}

export function codingRoute(
  task: Task,
  config: Config,
  health: Record<string, { until: number }>,
  now: number,
): CodingRouteResult {
  assertSafeNonnegative(now, "now");
  for (const entry of Object.values(health)) {
    assertSafeNonnegative(entry.until, "health.until");
  }

  const observations = config.observations ?? [];
  try {
    route(task, config.candidates, config.allowMetered, observations, now);
  } catch {
    return { status: "blocked" };
  }

  const available = config.candidates.filter((candidate) => {
    const until = health[`provider:${candidate.provider}`]?.until;
    return until === undefined || until <= now;
  });

  try {
    return {
      status: "available",
      selection: route(task, available, config.allowMetered, observations, now),
    };
  } catch {
    let dueAt: number | undefined;
    for (const candidate of config.candidates) {
      try {
        route(task, [candidate], config.allowMetered, observations, now);
        const until = health[`provider:${candidate.provider}`]?.until;
        if (
          until !== undefined &&
          until > now &&
          (dueAt === undefined || until < dueAt)
        ) {
          dueAt = until;
        }
      } catch {
        // This candidate is ineligible under the route's policy.
      }
    }
    return dueAt === undefined
      ? { status: "blocked" }
      : { status: "waiting_retry", dueAt };
  }
}

export function retryAt(
  attempt: number,
  retryAfterMs: number | undefined,
  now: number,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 5) {
    throw new Error("attempt must be an integer from 1 through 5");
  }
  assertSafeNonnegative(now, "now");
  if (retryAfterMs !== undefined)
    assertSafeNonnegative(retryAfterMs, "retryAfterMs");
  const backoff = Math.min(3_600_000, 30_000 * 2 ** (attempt - 1));
  const delay = Math.max(backoff, retryAfterMs ?? 0);
  const result = now + delay;
  if (!Number.isSafeInteger(result))
    throw new Error("retry timestamp overflow");
  return result;
}
