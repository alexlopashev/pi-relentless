import { observationsSchema } from "./model-evidence.js";
import type { Observation } from "./model-evidence.js";

export function mergeEvidence(groups: readonly unknown[]): Observation[] {
  const merged = new Map<string, { row: Observation; normalized: string }>();

  for (const group of groups) {
    const rows = observationsSchema.parse(group);
    for (const row of rows) {
      const normalized = JSON.stringify(row);
      const existing = merged.get(row.id);
      if (existing === undefined) {
        merged.set(row.id, { row, normalized });
      } else if (existing.normalized !== normalized) {
        throw new Error(`Conflicting observation ID: ${row.id}`);
      }
    }
  }

  return observationsSchema.parse(
    Array.from(merged.values(), (entry) => entry.row),
  );
}
