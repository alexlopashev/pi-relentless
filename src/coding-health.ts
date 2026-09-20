export function mergeCodingHealth(
  states: readonly Readonly<Record<string, { until: number }>>[],
): Record<string, { until: number }> {
  const merged: Record<string, { until: number }> = {};

  for (const state of states) {
    if (typeof state !== "object" || Array.isArray(state)) {
      throw new TypeError("state must be an object");
    }

    for (const key of Object.getOwnPropertyNames(state)) {
      if (!key.startsWith("provider:") || key.length === "provider:".length) {
        throw new TypeError("invalid provider key");
      }

      const value = state[key];
      if (
        typeof value !== "object" ||
        Array.isArray(value) ||
        !Object.prototype.hasOwnProperty.call(value, "until") ||
        !Number.isSafeInteger(value.until) ||
        value.until < 0
      ) {
        throw new TypeError("invalid cooldown");
      }

      const current = merged[key];
      if (current === undefined || value.until > current.until) {
        merged[key] = { until: value.until };
      }
    }
  }

  return merged;
}
