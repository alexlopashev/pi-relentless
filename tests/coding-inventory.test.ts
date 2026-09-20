import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { CodingJournal } from "../src/coding-journal.js";
import { Failure } from "../src/failures.js";
import { readCodingHealth } from "../src/coding-inventory.js";

test("reads recorded coding cooldowns without creating, changing, or trusting corrupt data", () => {
  const root = mkdtempSync(join(tmpdir(), "coding-inventory-"));
  const path = join(root, "coding.sqlite");
  try {
    expect(readCodingHealth(path)).toEqual({
      source: "no_coding_journal",
      health: {},
    });
    expect(existsSync(path)).toBe(false);
    const journal = new CodingJournal(path);
    const id = journal.create(
      {
        sourceRoot: root,
        task: { id: "a", prompt: "a", minQuality: 1, effort: "low" },
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 2,
      },
      {
        candidates: [
          {
            name: "a",
            provider: "meta",
            model: "fixture",
            billing: "subscription",
            enabled: true,
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      },
      { "x.ts": "x" },
    );
    const token = journal.start(id, "a", 100, 100);
    if (!token) throw new Error("Missing lease");
    journal.fail(id, token, new Failure("quota", 90000), 101);
    journal.close();
    const before = readFileSync(path);
    const mode = statSync(path).mode;
    expect(readCodingHealth(path)).toEqual({
      source: "coding_journal",
      health: { "provider:meta": { until: 90101 } },
    });
    expect(readFileSync(path)).toEqual(before);
    expect(statSync(path).mode).toBe(mode);
    const db = new DatabaseSync(path);
    db.exec("UPDATE runs SET hash='corrupt'");
    db.close();
    expect(() => readCodingHealth(path)).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
