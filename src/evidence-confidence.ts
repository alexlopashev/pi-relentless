/**
 * Wilson lower endpoint for a two-sided 95% interval.
 *
 * This is diagnostic under independent Bernoulli trials; correlated repeated
 * model prompts do not establish generalization or guaranteed confidence.
 */
export function wilsonLower95(successes: number, samples: number): number {
  if (
    !Number.isSafeInteger(successes) ||
    !Number.isSafeInteger(samples) ||
    successes < 0 ||
    samples < 0 ||
    successes > samples ||
    samples > 10000
  ) {
    throw new RangeError("successes and samples must be valid counts");
  }

  if (samples === 0) return 0;

  const z = 1.959963984540054;
  const n = samples;
  const p = successes / n;
  const z2 = z * z;
  const lower =
    (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) /
    (1 + z2 / n);

  return Math.min(1, Math.max(0, lower));
}
