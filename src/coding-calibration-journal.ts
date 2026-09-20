import {
  calibrationAdmissionSchema,
  type CalibrationAdmission,
} from "./calibration-admission-record.js";
import { calibrationObservations } from "./calibration-observations.js";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  planCodingCalibration,
  type CodingCalibrationPlan,
} from "./coding-calibration-plan.js";
import { canonicalDigest } from "./verification-assessment.js";

export interface CalibrationState {
  plan: CodingCalibrationPlan;
  bindings: Record<string, string>;
  admission?: CalibrationAdmission;
}

const bindingSchema = z.record(z.string().regex(/^[0-9a-f]{64}$/), z.uuid());
const storedStateSchema = z.strictObject({
  plan: z.unknown(),
  bindings: bindingSchema,
  admission: calibrationAdmissionSchema.optional(),
});
const rowSchema = z.strictObject({
  id: z.string(),
  body: z.string(),
  hash: z.string(),
});

export class CodingCalibrationJournal {
  private readonly db: DatabaseSync;
  private readonly readOnly: boolean;

  constructor(path: string, options: { readOnly?: boolean } = {}) {
    this.readOnly = options.readOnly ?? false;
    if (!this.readOnly)
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: this.readOnly });
      if (!this.readOnly) {
        chmodSync(path, 0o600);
        db.exec("PRAGMA busy_timeout=5000");
        db.exec("PRAGMA journal_mode=WAL");
        db.exec("PRAGMA synchronous=FULL");
      }
      db.exec(this.readOnly ? "BEGIN" : "BEGIN IMMEDIATE");
      const application = db.prepare("PRAGMA application_id").get()?.[
        "application_id"
      ];
      const version = db.prepare("PRAGMA user_version").get()?.["user_version"];
      const objects = db
        .prepare(
          "SELECT name,type FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all();
      if (
        application === 0 &&
        version === 0 &&
        objects.length === 0 &&
        !this.readOnly
      ) {
        db.exec(
          "CREATE TABLE cohorts (id TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL)",
        );
        db.exec("PRAGMA application_id=1129071426");
        db.exec("PRAGMA user_version=1");
      } else if (
        application !== 1129071426 ||
        version !== 1 ||
        objects.length !== 1 ||
        objects[0]?.["name"] !== "cohorts" ||
        objects[0]["type"] !== "table"
      ) {
        throw new Error("Foreign or damaged calibration schema");
      }
      const columns = db
        .prepare("PRAGMA table_info(cohorts)")
        .all()
        .map((row) => [row["name"], row["type"], row["notnull"], row["pk"]]);
      if (
        JSON.stringify(columns) !==
        JSON.stringify([
          ["id", "TEXT", 0, 1],
          ["body", "TEXT", 1, 0],
          ["hash", "TEXT", 1, 0],
        ])
      )
        throw new Error("Invalid calibration table schema");
      if (db.prepare("PRAGMA quick_check").get()?.["quick_check"] !== "ok")
        throw new Error("Corrupt calibration database");
      db.exec("COMMIT");
      this.db = db;
    } catch (error) {
      if (db) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Ignore rollback failure while closing after constructor failure.
        }
        db.close();
      }
      throw error;
    }
  }

  register(input: unknown): CalibrationState {
    if (this.readOnly) throw new Error("Calibration inspection is read-only");
    const plan = planCodingCalibration(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT id, body, hash FROM cohorts WHERE id = ?")
        .get(plan.contract.id);
      if (existing !== undefined) {
        const state = this.read(plan.contract.id);
        if (state.plan.contractSha256 !== plan.contractSha256) {
          throw new Error("Calibration cohort policy mismatch");
        }
        this.db.exec("COMMIT");
        return state;
      }
      const state: CalibrationState = { plan, bindings: {} };
      this.db
        .prepare("INSERT INTO cohorts (id, body, hash) VALUES (?, ?, ?)")
        .run(plan.contract.id, JSON.stringify(state), canonicalDigest(state));
      this.db.exec("COMMIT");
      return { plan, bindings: {} };
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  }

  read(id: string): CalibrationState {
    const raw = this.db
      .prepare("SELECT id, body, hash FROM cohorts WHERE id = ?")
      .get(id);
    const row = rowSchema.parse(raw);
    let decoded: unknown;
    try {
      decoded = JSON.parse(row.body) as unknown;
    } catch {
      throw new Error("Corrupt calibration cohort JSON");
    }
    const stored = storedStateSchema.parse(decoded);
    const planInput = z.object({ contract: z.unknown() }).parse(stored.plan);
    const plan = planCodingCalibration(planInput.contract);
    if (row.id !== plan.contract.id) throw new Error("Corrupt cohort ID");
    if (canonicalDigest(stored.plan) !== canonicalDigest(plan)) {
      throw new Error("Corrupt calibration plan");
    }
    const trialIds = new Set(plan.trials.map((trial) => trial.id));
    if (Object.keys(stored.bindings).some((key) => !trialIds.has(key))) {
      throw new Error("Corrupt calibration binding");
    }
    const values = Object.values(stored.bindings);
    if (new Set(values).size !== values.length) {
      throw new Error("Duplicate calibration identity");
    }
    const state: CalibrationState = {
      plan,
      bindings: { ...stored.bindings },
      ...(stored.admission ? { admission: stored.admission } : {}),
    };
    this.validateAdmission(state);
    if (canonicalDigest(state) !== row.hash) {
      throw new Error("Corrupt calibration cohort hash");
    }
    return { ...state, bindings: { ...state.bindings } };
  }

  /** Stable intent only: not a worker lease, dispatch authorization or acceptance. */
  reserve(id: string, trialId: string): string {
    if (this.readOnly) throw new Error("Calibration inspection is read-only");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.read(id);
      const trial = state.plan.trials.find((item) => item.id === trialId);
      if (!trial) throw new Error("Unknown calibration trial");
      const existing = state.bindings[trialId];
      if (existing !== undefined) {
        this.db.exec("COMMIT");
        return existing;
      }
      const identity = randomUUID();
      const bindings = { ...state.bindings, [trialId]: identity };
      const updated: CalibrationState = { ...state, bindings };
      this.db
        .prepare("UPDATE cohorts SET body = ?, hash = ? WHERE id = ?")
        .run(JSON.stringify(updated), canonicalDigest(updated), id);
      this.db.exec("COMMIT");
      return identity;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  }

  private validateAdmission(state: CalibrationState): void {
    const record = state.admission;
    if (!record) return;
    const ids = state.plan.trials.map((trial) => trial.id);
    for (const keys of [
      Object.keys(state.bindings),
      Object.keys(record.codingCheckpoints),
      Object.keys(record.workflowCheckpoints),
    ])
      if (keys.length !== ids.length || ids.some((id) => !keys.includes(id)))
        throw new Error("Admission requires the complete cohort");
    const expected = calibrationObservations(
      state.plan,
      record.observations.map((row) => ({
        trialId: row.id,
        accepted: row.accepted,
        elapsedMs: row.elapsedMs,
        ...(row.activeMs === undefined ? {} : { activeMs: row.activeMs }),
        estimatedUsd: row.estimatedUsd,
        completedAt: row.completedAt,
      })),
    );
    if (canonicalDigest(expected) !== canonicalDigest(record.observations))
      throw new Error("Admission identities changed");
  }
  /** Host-only admission; this storage validation does not itself verify VM evidence. */
  admit(id: string, input: unknown): CalibrationState {
    if (this.readOnly) throw new Error("Calibration inspection is read-only");
    const admission = calibrationAdmissionSchema.parse(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.read(id);
      if (
        state.admission &&
        canonicalDigest(state.admission) !== canonicalDigest(admission)
      )
        throw new Error("Admission is immutable");
      const updated = { ...state, admission };
      this.validateAdmission(updated);
      this.db
        .prepare("UPDATE cohorts SET body=?,hash=? WHERE id=?")
        .run(JSON.stringify(updated), canonicalDigest(updated), id);
      this.db.exec("COMMIT");
      return updated;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
