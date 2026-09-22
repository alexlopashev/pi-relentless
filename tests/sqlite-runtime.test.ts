import { expect, test } from "vitest";
import { mkdtempSync, closeSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "../src/sqlite.js";

test("SQLite preserves rollback, parameter binding, read-only access and safe backup", async () => {
  const root = mkdtempSync(join(tmpdir(), "sqlite-runtime-"));
  try {
    const path = join(root, "db.sqlite");
    const db = new DatabaseSync(path);
    db.exec(
      "PRAGMA journal_mode=WAL;CREATE TABLE rows(id INTEGER PRIMARY KEY,value TEXT);BEGIN IMMEDIATE",
    );
    expect(
      db.prepare("INSERT INTO rows(value) VALUES(?)").run("one").changes,
    ).toBe(1);
    db.exec("ROLLBACK");
    expect(db.prepare("SELECT * FROM rows").get()).toBeUndefined();
    db.prepare("INSERT INTO rows(value) VALUES(?)").run("stable");
    const read = new DatabaseSync(path, { readOnly: true });
    expect(() =>
      read.prepare("INSERT INTO rows(value) VALUES(?)").run("blocked"),
    ).toThrow();
    const out = join(root, "backup.sqlite");
    closeSync(openSync(out, "wx", 0o600));
    await backup(read, out);
    read.close();
    db.close();
    const restored = new DatabaseSync(out, { readOnly: true });
    expect(
      restored.prepare("SELECT value FROM rows WHERE id=?").get(1)?.["value"],
    ).toBe("stable");
    expect(
      restored.prepare("SELECT value FROM rows WHERE id=?").get(2),
    ).toBeUndefined();
    restored.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
