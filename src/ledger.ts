import { DatabaseSync, backup as sqliteBackup } from "./sqlite.js";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  contractSchema,
  stateSchema,
  type Goal,
  type State,
} from "./goal-types.js";
export const digest = (text: string): string =>
  createHash("sha256").update(text).digest("hex");
/** SQLite is the authoritative checkpoint; every transition and event share one commit. */
export class Ledger {
  private readonly db: DatabaseSync;
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const existing = existsSync(path);
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
    );
    const check = this.db.prepare("PRAGMA quick_check").get();
    if (check?.["quick_check"] !== "ok") {
      this.db.close();
      throw new Error("Ledger integrity check failed");
    }
    if (!existing)
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, state_hash TEXT NOT NULL);",
      );
    const empty: State = { version: 1, goals: [], health: {}, lease: null };
    const body = JSON.stringify(empty);
    if (!existing)
      this.db
        .prepare("INSERT INTO checkpoint VALUES(1,?,?)")
        .run(body, digest(body));
    try {
      this.db.prepare("SELECT seq FROM events LIMIT 1").get();
      this.read();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  read(): State {
    const row = this.db
      .prepare("SELECT body,hash FROM checkpoint WHERE id=1")
      .get();
    if (
      typeof row?.["body"] !== "string" ||
      digest(row["body"]) !== row["hash"]
    )
      throw new Error("Corrupt checkpoint");
    return stateSchema.parse(JSON.parse(row["body"]) as unknown);
  }
  transaction<T>(
    kind: string,
    at: number,
    action: (state: State) => T,
    details: unknown = {},
    evidence?: (state: State) => unknown,
    commitFence?: (commit: () => T) => T,
  ): T {
    this.db.exec("BEGIN IMMEDIATE");
    const checkpoint = { committed: false };
    try {
      const commit = () => {
        const state = this.read();
        const previous = JSON.stringify(state);
        const result = action(state);
        const body = JSON.stringify(stateSchema.parse(state));
        const hash = digest(body);
        if (body === previous) {
          this.db.exec("COMMIT");
          checkpoint.committed = true;
          return result;
        }
        this.db
          .prepare("UPDATE checkpoint SET body=?,hash=? WHERE id=1")
          .run(body, hash);
        this.db
          .prepare(
            "INSERT INTO events(at,kind,body,state_hash) VALUES(?,?,?,?)",
          )
          .run(
            at,
            kind,
            JSON.stringify({ details, evidence: evidence?.(state) }),
            hash,
          );
        this.db.exec("COMMIT");
        checkpoint.committed = true;
        return result;
      };
      return commitFence ? commitFence(commit) : commit();
    } catch (error) {
      if (!checkpoint.committed) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  goal(id: string): Goal {
    const goal = this.read().goals.find((g) => g.id === id);
    if (!goal) throw new Error("Unknown goal");
    return goal;
  }
  create(input: unknown, at = Date.now()): string {
    const contract = contractSchema.parse(input);
    const id = randomUUID();
    this.transaction(
      "goal_created",
      at,
      (state) => {
        state.goals.push({
          id,
          revision: 1,
          status: "active",
          contract,
          createdAt: at,
          updatedAt: at,
          history: [
            { revision: 1, contract, source: "local user contract", at },
          ],
          tasks: contract.tasks.map((t) => ({
            id: t.id,
            status: "ready",
            attempts: 0,
            noProgress: 0,
            dueAt: at,
            reason: "awaiting dispatch",
          })),
        });
      },
      { id },
    );
    return id;
  }
  revise(
    id: string,
    expected: number,
    input: unknown,
    source: string,
    at = Date.now(),
  ): void {
    const contract = contractSchema.parse(input);
    this.transaction(
      "goal_revised",
      at,
      (state) => {
        const goal = requireGoal(state, id, expected);
        if (goal.status === "cancelled" || goal.status === "superseded")
          throw new Error("Terminal goal cannot be revised");
        // Preserve task identity/budgets and denial history. A new goal is not a policy-clear operation.
        if (
          goal.tasks.length !== contract.tasks.length ||
          goal.tasks.some((t) => !contract.tasks.some((n) => n.id === t.id))
        )
          throw new Error("Revision must preserve task IDs");
        goal.revision++;
        goal.contract = contract;
        goal.status = "active";
        goal.updatedAt = at;
        goal.history.push({ revision: goal.revision, contract, source, at });
        for (const task of goal.tasks) {
          delete task.output;
          delete task.outputHash;
          delete task.verifiedRevision;
          delete task.workflowAdmission;
          if (task.status === "blocked_policy") continue;
          // Running results are fenced by revision; do not overlap the in-flight attempt.
          if (task.status !== "running") {
            task.status = "ready";
            task.dueAt = at;
            task.reason = "contract updated; reverify";
          }
        }
      },
      { id, expected, source },
    );
  }
  cancel(
    id: string,
    expected: number,
    source: string,
    at = Date.now(),
    superseded = false,
  ): void {
    this.transaction(
      superseded ? "goal_superseded" : "goal_cancelled",
      at,
      (state) => {
        const goal = requireGoal(state, id, expected);
        goal.status = superseded ? "superseded" : "cancelled";
        goal.updatedAt = at;
      },
      { id, expected, source },
    );
  }
  events(): unknown[] {
    return this.db
      .prepare("SELECT seq,at,kind,body,state_hash FROM events ORDER BY seq")
      .all();
  }
  static async restore(source: string, destination: string): Promise<void> {
    if (!existsSync(source)) throw new Error("Backup does not exist");
    const db = new DatabaseSync(source, { readOnly: true });
    let created = false;
    try {
      const check = db.prepare("PRAGMA quick_check").get();
      const row = db
        .prepare("SELECT body,hash FROM checkpoint WHERE id=1")
        .get();
      if (
        check?.["quick_check"] !== "ok" ||
        typeof row?.["body"] !== "string" ||
        digest(row["body"]) !== row["hash"]
      )
        throw new Error("Corrupt backup");
      db.prepare("SELECT seq FROM events LIMIT 1").get();
      const state = stateSchema.parse(JSON.parse(row["body"]) as unknown);
      if (state.lease)
        throw new Error("Backup must be taken with supervisor stopped");
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      closeSync(openSync(destination, "wx", 0o600));
      created = true;
      await sqliteBackup(db, destination);
    } catch (error) {
      if (created) unlinkSync(destination);
      throw error;
    } finally {
      db.close();
    }
  }
  backup(destination: string): void {
    this.db.prepare("VACUUM INTO ?").run(destination);
    chmodSync(destination, 0o600);
  }
  close(): void {
    this.db.close();
  }
}
export function requireGoal(state: State, id: string, expected?: number): Goal {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) throw new Error("Unknown goal");
  if (expected !== undefined && goal.revision !== expected)
    throw new Error("Stale contract revision");
  return goal;
}
