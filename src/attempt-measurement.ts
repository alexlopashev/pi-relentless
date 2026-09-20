export interface AttemptMeasurement {
  elapsedMs: number;
  estimatedUsd: number | null;
}
export function attemptMeasurement(
  metered: boolean,
  clock: () => number = () => performance.now(),
): {
  cost: (value: number) => void;
  finish: () => AttemptMeasurement | undefined;
} {
  let start: number | undefined;
  let latest: number | null = null;
  let closed = false;
  let cached: AttemptMeasurement | undefined;
  try {
    const value = clock();
    if (Number.isFinite(value) && value >= 0) start = value;
  } catch {
    // Missing clock data must not alter the task outcome.
  }
  return {
    cost(value: number): void {
      if (!closed && metered && Number.isFinite(value) && value > 0)
        latest = value;
    },
    finish(): AttemptMeasurement | undefined {
      if (closed) return cached === undefined ? undefined : { ...cached };
      closed = true;
      let end: number | undefined;
      try {
        const value = clock();
        if (Number.isFinite(value) && value >= 0) end = value;
      } catch {
        // Missing clock data must not alter the task outcome.
      }
      if (start !== undefined && end !== undefined && end >= start)
        cached = { elapsedMs: end - start, estimatedUsd: latest };
      return cached === undefined ? undefined : { ...cached };
    },
  };
}
