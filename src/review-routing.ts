import { Config, Route, Task, route } from "./router.js";

export function reviewRoutes(
  task: Task,
  config: Config,
  authors: readonly string[],
  health: Record<string, { until: number }>,
  now: number,
  completedProviders: readonly string[] = [],
):
  | { status: "available"; routes: [Route, Route] | [Route] }
  | { status: "waiting_retry"; dueAt: number }
  | { status: "blocked" } {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError("now must be a nonnegative safe integer");
  }
  for (const entry of Object.values(health)) {
    if (!Number.isSafeInteger(entry.until) || entry.until < 0) {
      throw new RangeError("health.until must be a nonnegative safe integer");
    }
  }

  const authorSet = new Set(authors);
  if (
    completedProviders.length > 1 ||
    completedProviders.some((provider) => authorSet.has(provider))
  )
    throw new Error("Invalid completed reviewer providers");
  for (const provider of completedProviders) authorSet.add(provider);
  const candidates = config.candidates.filter(
    (candidate) => !authorSet.has(candidate.provider),
  );
  const observations = config.observations;

  const select = (timestamp: number): [Route, Route] | [Route] | undefined => {
    const available = candidates.filter(
      (candidate) =>
        (health[`provider:${candidate.provider}`]?.until ?? 0) <= timestamp,
    );
    try {
      const first = route(
        task,
        available,
        config.allowMetered,
        observations,
        now,
      );
      if (completedProviders.length === 1) return [first];
      const second = route(
        task,
        available.filter(
          (candidate) => candidate.provider !== first.candidate.provider,
        ),
        config.allowMetered,
        observations,
        now,
      );
      return [first, second];
    } catch {
      return undefined;
    }
  };

  if (select(Number.MAX_SAFE_INTEGER) === undefined) {
    return { status: "blocked" };
  }

  const current = select(now);
  if (current) return { status: "available", routes: current };

  const expiries = [
    ...new Set(
      candidates
        .map((candidate) => health[`provider:${candidate.provider}`]?.until)
        .filter((until): until is number => until !== undefined && until > now),
    ),
  ].sort((a, b) => a - b);
  for (const dueAt of expiries) {
    if (select(dueAt)) return { status: "waiting_retry", dueAt };
  }
  return { status: "blocked" };
}
