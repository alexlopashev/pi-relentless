import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { z } from "zod";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";

type Row = Record<string, SQLOutputValue>;
interface Statement {
  finalize?(): void;
  get(...params: SQLInputValue[]): Row | null | undefined;
  all(...params: SQLInputValue[]): Row[];
  run(...params: SQLInputValue[]): { changes: number | bigint };
}
interface Driver {
  exec(sql: string): unknown;
  prepare(sql: string): Statement;
  close(throwOnError?: boolean): unknown;
}
type Constructor = new (
  path: string,
  options: Record<string, boolean>,
) => Driver;
const nativeRequire = createRequire(import.meta.url);
const isBun = process.versions["bun"] !== undefined;
// Only built-in modules cross this boundary; validate the constructors/functions
// before applying the narrow driver contract exercised on both runtimes.
const constructorSchema = z.custom<Constructor>(
  (value) => typeof value === "function",
);
const native = isBun
  ? z
      .object({ Database: constructorSchema })
      .parse(nativeRequire("bun:sqlite") as unknown)
  : z
      .object({
        DatabaseSync: constructorSchema,
        backup: z.custom<(db: Driver, destination: string) => Promise<unknown>>(
          (value) => typeof value === "function",
        ),
      })
      .parse(nativeRequire("node:sqlite") as unknown);

export class DatabaseSync {
  readonly driver: Driver;
  constructor(path: string, options: { readOnly?: boolean } = {}) {
    if ("Database" in native) {
      this.driver = new native.Database(path, {
        readonly: options.readOnly ?? false,
        create: !(options.readOnly ?? false),
        strict: true,
      });
      this.driver.exec("PRAGMA foreign_keys=ON");
    } else {
      this.driver = new native.DatabaseSync(path, {
        readOnly: options.readOnly ?? false,
      });
    }
  }
  exec(sql: string): void {
    this.driver.exec(sql);
  }
  prepare(sql: string) {
    // Bun statements keep the connection busy until finalized. Prepare per
    // operation so long-lived journals do not retain every statement they use.
    if (isBun) {
      const use = <T>(action: (statement: Statement) => T): T => {
        const statement = this.driver.prepare(sql);
        try {
          return action(statement);
        } finally {
          statement.finalize?.();
        }
      };
      return {
        get: (...params: SQLInputValue[]): Row | undefined =>
          use((s) => s.get(...params) ?? undefined),
        all: (...params: SQLInputValue[]): Row[] =>
          use((s) => s.all(...params)),
        run: (...params: SQLInputValue[]): { changes: number | bigint } =>
          use((s) => s.run(...params)),
      };
    }
    const statement = this.driver.prepare(sql);
    return {
      get: (...params: SQLInputValue[]): Row | undefined =>
        statement.get(...params) ?? undefined,
      all: (...params: SQLInputValue[]): Row[] => statement.all(...params),
      run: (...params: SQLInputValue[]): { changes: number | bigint } =>
        statement.run(...params),
    };
  }

  close(): void {
    this.driver.close(true);
  }
}

export async function backup(
  db: DatabaseSync,
  destination: string,
): Promise<void> {
  if ("backup" in native) await native.backup(db.driver, destination);
  else {
    // macOS SQLite rejects even an empty existing VACUUM destination. Keep the
    // exclusively reserved restore file; copy a consistent SQLite snapshot into
    // its open descriptor without unlinking it or buffering the database in RAM.
    const directory = mkdtempSync(join(tmpdir(), "relentless-backup-"));
    let output: number | undefined;
    let input: number | undefined;
    try {
      output = openSync(
        destination,
        constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const stat = fstatSync(output);
      if (!stat.isFile() || stat.size !== 0)
        throw new Error("Restore destination must be an empty regular file");
      const snapshot = join(directory, "snapshot.sqlite");
      db.prepare("VACUUM INTO ?").run(snapshot);
      input = openSync(snapshot, "r");
      const buffer = Buffer.alloc(64 * 1024);
      let length: number;
      while ((length = readSync(input, buffer)) > 0) {
        let offset = 0;
        while (offset < length)
          offset += writeSync(output, buffer, offset, length - offset);
      }
      fsyncSync(output);
    } finally {
      if (input !== undefined) closeSync(input);
      if (output !== undefined) closeSync(output);
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
