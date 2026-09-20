import { existsSync } from "node:fs";
import { CodingJournal } from "./coding-journal.js";

export function readCodingHealth(path: string): {
  source: "coding_journal" | "no_coding_journal";
  health: Record<string, { until: number }>;
} {
  if (!existsSync(path)) {
    return { source: "no_coding_journal", health: {} };
  }

  const journal = new CodingJournal(path, { readOnly: true });
  try {
    return { source: "coding_journal", health: journal.health() };
  } finally {
    journal.close();
  }
}
