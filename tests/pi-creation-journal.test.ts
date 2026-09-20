import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-atomic-"));
  const path = join(root, "coding.sqlite");
  const coding = new CodingJournal(path);
  const task = { id: "atomic", prompt: "fix", minQuality: 1, effort: "low" };
  const config = {
    candidates: [
      {
        name: "author",
        provider: "author",
        model: "one",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  };
  const request = {
    sourceRoot: root,
    task,
    files: [{ path: "x.ts", writable: true }],
    maxAttempts: 2,
  };
  const intent = {
    key: "atomic",
    inputSha256: "a".repeat(64),
    root,
    review: { task, config },
    maxReviewPairs: 2,
  };
  return {
    root,
    path,
    coding,
    request,
    config,
    intent,
    files: { "x.ts": "export const x=1;" },
  };
}
test("failure after inserting a coding run rolls back both task and creation identity", () => {
  const f = fixture();
  const fault = new DatabaseSync(f.path);
  fault.exec(
    "CREATE TRIGGER fail_insert AFTER INSERT ON runs BEGIN SELECT RAISE(ABORT, 'fault'); END",
  );
  try {
    expect(() =>
      f.coding.createPiWork(f.request, f.config, f.files, f.intent),
    ).toThrow("fault");
    expect(
      f.coding.findPiCreation("atomic", "a".repeat(64), f.root),
    ).toBeNull();
    const db = new DatabaseSync(f.path);
    try {
      expect(db.prepare("SELECT * FROM runs").all()).toHaveLength(0);
    } finally {
      db.close();
    }
    fault.exec("DROP TRIGGER fail_insert");
    const saved = f.coding.createPiWork(f.request, f.config, f.files, f.intent);
    expect(f.coding.findPiCreation("atomic", "a".repeat(64), f.root)).toEqual(
      saved,
    );
  } finally {
    fault.close();
    f.coding.close();
  }
});
test("corrupt intent and a changed key binding fail closed without replacing saved work", () => {
  const f = fixture();
  try {
    const saved = f.coding.createPiWork(f.request, f.config, f.files, f.intent);
    expect(() =>
      f.coding.createPiWork(f.request, f.config, f.files, {
        ...f.intent,
        inputSha256: "b".repeat(64),
      }),
    ).toThrow();
    const db = new DatabaseSync(f.path);
    try {
      db.prepare("UPDATE pi_creations SET body='{}'").run();
    } finally {
      db.close();
    }
    expect(() =>
      f.coding.findPiCreation("atomic", "a".repeat(64), f.root),
    ).toThrow();
    expect(() =>
      f.coding.createPiWork(f.request, f.config, f.files, f.intent),
    ).toThrow();
    expect(f.coding.read(saved.id).attempts).toBe(0);
  } finally {
    f.coding.close();
  }
});
