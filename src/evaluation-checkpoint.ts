import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { observationsSchema } from "./model-evidence.js";
import {
  evaluationSchema,
  evaluationRoutes,
  type EvaluationReport,
} from "./evaluation.js";
import { configSchema } from "./router.js";
const contractSchema = z.strictObject({
  suite: evaluationSchema,
  config: configSchema,
});
const reportSchema = z.strictObject({
  suiteHash: z.string().regex(/^[a-f0-9]{64}$/),
  observations: observationsSchema.refine((rows) => rows.length <= 30),
  stopped: z.boolean(),
  reason: z.string().optional(),
});
const stateSchema = z.strictObject({
  contract: z.string(),
  report: reportSchema.nullable(),
  pending: z.string().nullable(),
  deadline: z.number().int().nonnegative().nullable(),
});
const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
/** One immutable evaluation contract; dispatch reservations prevent uncertain paid-call replay. */
export class EvaluationCheckpoint {
  private readonly db: DatabaseSync;
  private readonly contract: string;
  private readonly suiteHash: string;
  private readonly plan: {
    provider: string;
    model: string;
    billing: string;
    effort: string;
    caseId: string;
    workload: string;
  }[];
  private readonly readOnly: boolean;
  constructor(
    path: string,
    contract: unknown,
    options: { readOnly?: boolean } = {},
  ) {
    this.readOnly = options.readOnly ?? false;
    const normalized = contractSchema.parse(contract);
    this.contract = digest(JSON.stringify(normalized));
    this.suiteHash = digest(
      JSON.stringify({
        workload: normalized.suite.workload,
        cases: normalized.suite.cases,
      }),
    );
    const routes = evaluationRoutes(normalized.suite, normalized.config);
    this.plan = Array.from({ length: normalized.suite.repeats }, () =>
      normalized.suite.cases.flatMap((test) =>
        routes.map((r) => ({
          provider: r.candidate.provider,
          model: r.candidate.model,
          billing: r.candidate.billing,
          effort: r.effort,
          caseId: test.id,
          workload: normalized.suite.workload,
        })),
      ),
    ).flat();
    const existing = existsSync(path);
    if (!this.readOnly)
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { readOnly: this.readOnly });
    try {
      if (!this.readOnly) {
        chmodSync(path, 0o600);
        this.db.exec(
          "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        );
      } else {
        this.db.exec("BEGIN");
      }
      if (!existing && !this.readOnly) {
        this.db.exec(
          "CREATE TABLE checkpoint(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL,hash TEXT NOT NULL)",
        );
        const body = JSON.stringify({
          contract: this.contract,
          report: null,
          pending: null,
          deadline: null,
        });
        this.db
          .prepare("INSERT INTO checkpoint VALUES(1,?,?)")
          .run(body, digest(body));
      }
      if (this.db.prepare("PRAGMA quick_check").get()?.["quick_check"] !== "ok")
        throw new Error("Corrupt evaluation checkpoint");
      this.read();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  assertContract(suite: unknown, config: unknown): void {
    if (
      digest(JSON.stringify(contractSchema.parse({ suite, config }))) !==
      this.contract
    )
      throw new Error("Evaluation contract changed");
  }
  read(): z.infer<typeof stateSchema> {
    const row = this.db
      .prepare("SELECT body,hash FROM checkpoint WHERE id=1")
      .get();
    if (
      typeof row?.["body"] !== "string" ||
      digest(row["body"]) !== row["hash"]
    )
      throw new Error("Corrupt evaluation checkpoint");
    const state = stateSchema.parse(JSON.parse(row["body"]) as unknown);
    if (state.contract !== this.contract)
      throw new Error("Evaluation contract changed");
    this.validate(state);
    return state;
  }
  private validate(state: z.infer<typeof stateSchema>): void {
    if (state.report === null) {
      if (state.pending !== null || state.deadline !== null)
        throw new Error("Invalid empty evaluation");
      return;
    }
    if (
      state.deadline === null ||
      state.report.suiteHash !== this.suiteHash ||
      state.report.observations.length > this.plan.length
    )
      throw new Error("Evaluation plan mismatch");
    if (
      state.pending !== null &&
      (state.report.stopped ||
        state.report.observations.length >= this.plan.length)
    )
      throw new Error("Invalid evaluation reservation");
    state.report.observations.forEach((observation, index) => {
      const expected = this.plan[index];
      if (
        !expected ||
        observation.suiteHash !== this.suiteHash ||
        Object.entries(expected).some(
          ([key, value]) => Reflect.get(observation, key) !== value,
        )
      )
        throw new Error("Evaluation observation mismatch");
    });
  }
  private change(action: (state: z.infer<typeof stateSchema>) => void): void {
    if (this.readOnly) throw new Error("Evaluation inspection is read-only");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.read();
      action(state);
      this.validate(state);
      const body = JSON.stringify(stateSchema.parse(state));
      this.db
        .prepare("UPDATE checkpoint SET body=?,hash=? WHERE id=1")
        .run(body, digest(body));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  initialize(report: EvaluationReport, deadline: number): void {
    this.change((state) => {
      if (state.report === null) {
        if (report.observations.length || report.stopped)
          throw new Error("Invalid initial evaluation report");
        state.report = report;
        state.deadline = deadline;
      }
    });
  }
  reserve(index: number, id: string): void {
    this.change((state) => {
      if (
        !state.report ||
        state.report.stopped ||
        state.pending !== null ||
        state.report.observations.length !== index ||
        index >= this.plan.length
      )
        throw new Error("Evaluation dispatch conflict");
      state.pending = id;
    });
  }
  finish(id: string, report: EvaluationReport): void {
    this.change((state) => {
      if (
        state.pending !== id ||
        !state.report ||
        report.observations.length !== state.report.observations.length + 1 ||
        report.observations.at(-1)?.id !== id ||
        JSON.stringify(report.observations.slice(0, -1)) !==
          JSON.stringify(state.report.observations)
      )
        throw new Error("Evaluation reservation lost");
      state.report = report;
      state.pending = null;
    });
  }
  expire(id: string): void {
    this.change((state) => {
      if (state.pending !== id || !state.report)
        throw new Error("Evaluation reservation lost");
      state.pending = null;
      state.report.stopped = true;
      state.report.reason = "deadline";
    });
  }
  stop(report: EvaluationReport): void {
    this.change((state) => {
      if (
        state.pending !== null ||
        !report.stopped ||
        JSON.stringify(state.report?.observations) !==
          JSON.stringify(report.observations)
      )
        throw new Error("Evaluation dispatch conflict");
      state.report = report;
    });
  }
  close(): void {
    this.db.close();
  }
}
