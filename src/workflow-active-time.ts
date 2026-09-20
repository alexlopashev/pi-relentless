export function workflowActiveTime(
  terminal: boolean,
  authorMs: number | null,
  reviewMs: number | null,
  verificationMs: number | null,
): number | null {
  for (const value of [authorMs, reviewMs, verificationMs]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error("Invalid active time");
    }
  }

  if (
    !terminal ||
    authorMs === null ||
    reviewMs === null ||
    verificationMs === null
  ) {
    return null;
  }

  const sum = authorMs + reviewMs + verificationMs;
  if (!Number.isFinite(sum)) {
    throw new Error("Invalid active time sum");
  }

  return sum === 0 ? null : sum;
}
