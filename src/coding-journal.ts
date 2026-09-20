import { codingOutputReasonSchema } from "./coding-output-reason.js";
import { assertGoalWork } from "./goal-work.js";
import { failureOriginSchema } from "./failure-origin.js";
import type { AttemptMeasurement } from "./attempt-measurement.js";
import {
  piCreationIntentSchema,
  type SavedPiCreation,
} from "./pi-creation-intent.js";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { codingContextSchema } from "./coding-context.js";
import { codingSchema } from "./coding-worker.js";
import { configSchema, efforts, type Config, type Route } from "./router.js";

import { mergeCodingHealth } from "./coding-health.js";
import { codingRoute, retryAt } from "./coding-recovery.js";
import { failureKind, retryable, Failure, mergeFailure } from "./failures.js";
const MAX = 131072;
const measurementSchema = z.strictObject({
  elapsedMs: z.number().nonnegative(),
  estimatedUsd: z.number().positive().nullable(),
});
const attemptMeasurementSchema = measurementSchema.extend({
  epoch: z.number().int().min(1).max(5),
  candidate: z.string().min(1),
  effort: z.enum(efforts),
  completedAt: z.number().int().nonnegative(),
  outcome: z.enum(["retry", "ready_for_review", "blocked", "failed"]),
});
const fileSchema = z.record(
  z.string(),
  z.strictObject({ original: z.string().nullable(), current: z.string() }),
);
const bodySchema = z.strictObject({
  request: codingSchema,
  revision: z.number().int().min(1).max(101).default(1),
  revisions: z
    .array(
      z.strictObject({
        revision: z.number().int().min(1).max(100),
        prompt: z.string().min(1),
        context: codingContextSchema.optional(),
        at: z.number().int().nonnegative(),
      }),
    )
    .max(100)
    .default([]),
  config: configSchema,
  files: fileSchema,
  attempts: z.number().int().nonnegative().max(5),
  epoch: z.number().int().nonnegative().max(5),
  status: z.enum([
    "ready",
    "running",
    "ambiguous",
    "waiting_retry",
    "ready_for_review",
    "blocked",
    "exhausted",
    "cancelled",
  ]),
  cancelledAt: z.number().int().nonnegative().nullable().default(null),
  measurements: z.array(attemptMeasurementSchema).max(5).optional(),
  dispatches: z
    .array(
      z.strictObject({
        epoch: z.number().int().min(1).max(5),
        owner: z.string().min(1).max(256),
        candidate: z.string().min(1),
        effort: z.enum(efforts).optional(),
      }),
    )
    .max(5)
    .default([]),
  health: z
    .record(
      z.string(),
      z.strictObject({ until: z.number().int().nonnegative() }),
    )
    .default({}),
  dueAt: z.number().int().nonnegative().default(0),
  failures: z
    .array(
      z
        .strictObject({
          epoch: z.number().int().min(1).max(5),
          candidate: z.string().min(1),
          kind: failureKind,
          origin: failureOriginSchema.optional(),
          outputReason: codingOutputReasonSchema.optional(),
          at: z.number().int().nonnegative(),
        })
        .refine(
          (f) =>
            f.outputReason === undefined ||
            (f.kind === "unknown" && f.origin === "coding_output"),
          "Output reason requires coding validation failure",
        ),
    )
    .max(5)
    .default([]),
  lease: z
    .strictObject({
      owner: z.string().min(1).max(256),
      epoch: z.number().int().nonnegative().max(5),
      until: z.number().int().nonnegative(),
      candidate: z.string().min(1).optional(),
      effort: z.enum(efforts).optional(),
    })
    .nullable(),
});
type Body = z.infer<typeof bodySchema>;
export type CodingRequest = z.infer<typeof codingSchema>;
export type CodingConfig = Config;
export type CodingSnapshot = Body;
export interface LeaseToken {
  owner: string;
  epoch: number;
}
export interface DispatchToken extends LeaseToken {
  selection: Route;
}
export type FinishStatus = "retry" | "ready_for_review" | "blocked";

const hash = (s: string): string =>
  createHash("sha256").update(s).digest("hex");
const bytes = (s: string): number => Buffer.byteLength(s, "utf8");
function clock(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid clock");
}
function owner(s: string): void {
  if (typeof s !== "string" || s.length < 1 || s.length > 256)
    throw new Error("Invalid owner");
}
function ttl(n: number): void {
  if (!Number.isSafeInteger(n) || n < 1 || n > 3600000)
    throw new Error("Invalid ttl");
}

export class CodingJournal {
  private readonly db: DatabaseSync;
  private closed = false;
  readonly readOnly: boolean;
  constructor(
    readonly path: string,
    options: { readOnly?: boolean } = {},
  ) {
    this.readOnly = options.readOnly ?? false;
    const existing = existsSync(path);
    if (!options.readOnly)
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { readOnly: options.readOnly ?? false });
    try {
      if (!options.readOnly) {
        chmodSync(path, 0o600);
        this.db.exec(
          "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        );
        if (!existing)
          this.db.exec(
            "CREATE TABLE runs(id TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL);",
          );
      }
      // Keep every read in a read-only inspection on one SQLite snapshot.
      if (options.readOnly) this.db.exec("BEGIN");
      if (this.db.prepare("PRAGMA quick_check").get()?.["quick_check"] !== "ok")
        throw new Error("Corrupt journal");
      this.validateDatabase();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private validateDatabase(): void {
    const rows = this.db.prepare("SELECT id,body,hash FROM runs").all();
    for (const row of rows) {
      const id = row["id"],
        body = row["body"],
        sum = row["hash"];
      if (
        typeof id !== "string" ||
        typeof body !== "string" ||
        typeof sum !== "string" ||
        hash(body) !== sum
      )
        throw new Error("Corrupt journal");
      this.validateBody(bodySchema.parse(JSON.parse(body) as unknown));
    }
  }
  private validateBody(b: Body): void {
    if (
      b.revision !== b.revisions.length + 1 ||
      b.revisions.some((r, index) => r.revision !== index + 1)
    )
      throw new Error("Invalid revision history");
    if ((b.status === "cancelled") !== (b.cancelledAt !== null))
      throw new Error("Invalid cancellation state");
    const paths = b.request.files.map((f) => f.path);
    if (Object.keys(b.files).sort().join("\0") !== [...paths].sort().join("\0"))
      throw new Error("Manifest mismatch");
    let total = 0;
    let originalTotal = 0;
    for (const p of paths) {
      const f = b.files[p];
      if (!f) throw new Error("Missing file");
      if (
        (f.original === null) !==
        (b.request.files.find((file) => file.path === p)?.create === true)
      )
        throw new Error("Original presence does not match declaration");
      if (
        (f.original?.includes("\0") ?? false) ||
        f.current.includes("\0") ||
        bytes(f.original ?? "") > 32768 ||
        bytes(f.current) > 32768
      )
        throw new Error("Invalid file");
      total += bytes(f.current);
      originalTotal += bytes(f.original ?? "");
      if (
        !b.request.files.find((file) => file.path === p)?.writable &&
        f.original !== f.current
      )
        throw new Error("Read-only file changed");
    }
    if (
      total > MAX ||
      originalTotal > MAX ||
      b.epoch !== b.attempts ||
      (b.status === "ready" && b.attempts >= b.request.maxAttempts) ||
      (b.status === "exhausted" && b.attempts !== b.request.maxAttempts) ||
      (b.status !== "ready" &&
        b.status !== "waiting_retry" &&
        b.status !== "blocked" &&
        b.status !== "cancelled" &&
        b.attempts === 0) ||
      (b.status === "ready_for_review" &&
        Object.values(b.files).every((f) => f.original === f.current)) ||
      b.attempts > b.request.maxAttempts ||
      (b.status === "running") !== (b.lease !== null)
    )
      throw new Error("Invalid checkpoint");
    if (b.lease && b.lease.epoch !== b.epoch) throw new Error("Invalid lease");
    if (
      (b.status === "waiting_retry" &&
        (b.dueAt === 0 || b.attempts >= b.request.maxAttempts)) ||
      (b.status !== "waiting_retry" && b.dueAt !== 0)
    )
      throw new Error("Invalid retry boundary");
    if (
      new Set(b.dispatches.map((d) => d.epoch)).size !== b.dispatches.length ||
      b.dispatches.some(
        (d) =>
          d.epoch > b.attempts ||
          !b.config.candidates.some((c) => c.name === d.candidate),
      )
    )
      throw new Error("Invalid dispatch provenance");
    const measurements = b.measurements ?? [];
    if (
      new Set(measurements.map((m) => m.epoch)).size !== measurements.length ||
      measurements.some(
        (m) =>
          !b.dispatches.some(
            (d) =>
              d.epoch === m.epoch &&
              d.candidate === m.candidate &&
              d.effort === m.effort,
          ) ||
          (m.estimatedUsd !== null &&
            b.config.candidates.find((c) => c.name === m.candidate)?.billing !==
              "metered"),
      )
    )
      throw new Error("Invalid measurement provenance");
    if (
      new Set(b.failures.map((f) => f.epoch)).size !== b.failures.length ||
      b.failures.some(
        (f) =>
          !b.dispatches.some(
            (d) => d.epoch === f.epoch && d.candidate === f.candidate,
          ),
      )
    )
      throw new Error("Invalid failure provenance");
    if (
      b.lease?.candidate &&
      !b.dispatches.some(
        (d) =>
          d.epoch === b.lease?.epoch &&
          d.owner === b.lease.owner &&
          d.candidate === b.lease.candidate,
      )
    )
      throw new Error("Invalid lease provenance");
  }
  private row(id: string): Body {
    const r = this.db.prepare("SELECT body,hash FROM runs WHERE id=?").get(id);
    if (typeof r?.["body"] !== "string" || r["hash"] !== hash(r["body"]))
      throw new Error("Unknown or corrupt run");
    const b = bodySchema.parse(JSON.parse(r["body"]) as unknown);
    this.validateBody(b);
    return b;
  }
  private save(id: string, b: Body): void {
    const checked = bodySchema.parse(b);
    this.validateBody(checked);
    const text = JSON.stringify(checked);
    this.db
      .prepare("UPDATE runs SET body=?,hash=? WHERE id=?")
      .run(text, hash(text), id);
  }
  create(
    request: unknown,
    config: unknown,
    snapshot: Record<string, string | null>,
  ): string {
    if (codingSchema.parse(request).goalOrigin)
      throw new Error("Goal work requires its unique Pi creation intent");
    return this.insertRun(request, config, snapshot);
  }
  private insertRun(
    request: unknown,
    config: unknown,
    snapshot: Record<string, string | null>,
  ): string {
    const req = codingSchema.parse(request),
      cfg = configSchema.parse(config),
      paths = req.files.map((f) => f.path);
    if (
      Object.keys(snapshot).sort().join("\0") !== [...paths].sort().join("\0")
    )
      throw new Error("Snapshot manifest mismatch");
    const files: Record<string, { original: string | null; current: string }> =
      {};
    let total = 0;
    for (const p of paths) {
      const s = snapshot[p];
      if (s !== null && typeof s !== "string")
        throw new Error("Missing snapshot file");
      if (
        (s === null) !==
        (req.files.find((file) => file.path === p)?.create === true)
      )
        throw new Error("Snapshot presence does not match declaration");
      if ((s?.includes("\0") ?? false) || bytes(s ?? "") > 32768)
        throw new Error("Invalid snapshot");
      total += bytes(s ?? "");
      files[p] = { original: s, current: s ?? "" };
    }
    if (total > MAX) throw new Error("Snapshot too large");
    const b: Body = {
        request: req,
        revision: 1,
        revisions: [],
        config: cfg,
        files,
        attempts: 0,
        epoch: 0,
        status: "ready",
        cancelledAt: null,
        lease: null,
        dispatches: [],
        health: {},
        dueAt: 0,
        failures: [],
      },
      id = randomUUID(),
      text = JSON.stringify(bodySchema.parse(b));
    this.validateBody(bodySchema.parse(b));
    this.db.prepare("INSERT INTO runs VALUES(?,?,?)").run(id, text, hash(text));
    return id;
  }
  /** The intent and source run share one commit, making interrupted Pi creation recoverable. */
  createPiWork(
    request: unknown,
    config: unknown,
    snapshot: Record<string, string | null>,
    input: unknown,
  ): SavedPiCreation {
    if (this.readOnly) throw new Error("Creation requires a mutable journal");
    const intent = piCreationIntentSchema.parse(input);
    const req = codingSchema.parse(request);
    assertGoalWork(
      req,
      undefined,
      "coder",
      Date.now(),
      configSchema.parse(config),
    );
    if (req.sourceRoot !== intent.root || req.task.id !== intent.key)
      throw new Error("Creation identity mismatch");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS pi_creations(key TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL, hash TEXT NOT NULL)",
      );
      const existing = this.findPiCreation(
        intent.key,
        intent.inputSha256,
        intent.root,
      );
      if (existing) {
        this.db.exec("COMMIT");
        return existing;
      }
      const id = this.insertRun(req, config, snapshot);
      const checkpointSha256 = hash(JSON.stringify(this.read(id)));
      const body = JSON.stringify({ intent, checkpointSha256 });
      this.db
        .prepare("INSERT INTO pi_creations(key,id,body,hash) VALUES(?,?,?,?)")
        .run(intent.key, id, body, hash(body));
      this.db.exec("COMMIT");
      return { id, intent, checkpointSha256 };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  findPiCreation(
    key: string,
    inputSha256: string,
    root: string,
  ): SavedPiCreation | null {
    const hasTable =
      this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pi_creations'",
        )
        .get() !== undefined;
    const row = hasTable
      ? this.db
          .prepare("SELECT id,body,hash FROM pi_creations WHERE key=?")
          .get(key)
      : undefined;
    if (!row) {
      // A legacy task or missing intent must not become permission to duplicate work.
      for (const run of this.db.prepare("SELECT id FROM runs").all()) {
        if (typeof run["id"] !== "string") throw new Error("Corrupt journal");
        const saved = this.read(run["id"]);
        if (saved.request.task.id === key && saved.request.sourceRoot === root)
          throw new Error(
            "Existing coding task has no matching creation intent",
          );
      }
      return null;
    }
    if (
      typeof row["id"] !== "string" ||
      typeof row["body"] !== "string" ||
      hash(row["body"]) !== row["hash"]
    )
      throw new Error("Corrupt Pi creation intent");
    const saved = z
      .strictObject({
        intent: piCreationIntentSchema,
        checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .parse(JSON.parse(row["body"]) as unknown);
    if (
      saved.intent.key !== key ||
      saved.intent.inputSha256 !== inputSha256 ||
      saved.intent.root !== root
    )
      throw new Error("Creation key already binds a different request");
    const snapshot = this.read(row["id"]);
    if (
      snapshot.request.sourceRoot !== root ||
      snapshot.request.task.id !== key
    )
      throw new Error("Creation source binding mismatch");
    return { id: row["id"], ...saved };
  }
  /** Shared within this project journal; dispatch calls this inside its write transaction. */
  health(): Record<string, { until: number }> {
    const rows = this.db.prepare("SELECT id FROM runs").all();
    return mergeCodingHealth(
      rows.map((row) => {
        const id = row["id"];
        if (typeof id !== "string") throw new Error("Corrupt journal");
        return this.row(id).health;
      }),
    );
  }
  read(id: string): Body {
    return this.row(id);
  }
  storageDigest(id: string): string {
    const row = this.db
      .prepare("SELECT body,hash FROM runs WHERE id=?")
      .get(id);
    if (
      typeof row?.["body"] !== "string" ||
      typeof row["hash"] !== "string" ||
      hash(row["body"]) !== row["hash"]
    )
      throw new Error("Corrupt coding record");
    return row["hash"];
  }
  /** Hold the coding write fence while a synchronous consumer commits related evidence. */
  withCheckpoint<T>(
    id: string,
    expectedSha256: string,
    action: (snapshot: CodingSnapshot) => T,
  ): T {
    if (this.readOnly)
      throw new Error("Checkpoint guard needs a mutable journal");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const snapshot = this.read(id);
      if (hash(JSON.stringify(snapshot)) !== expectedSha256)
        throw new Error("Verification checkpoint is stale");
      const result = action(snapshot);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** A local user cancellation revokes the lease without resetting history or budgets. */
  cancel(id: string, now = Date.now()): void {
    clock(now);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      if (b.status !== "cancelled") {
        b.status = "cancelled";
        b.cancelledAt = now;
        b.dueAt = 0;
        b.lease = null;
        this.save(id, b);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Explicit local-user prompt update; never clears blockers or replenishes budget. */
  revisePrompt(
    id: string,
    expectedRevision: number,
    prompt: string,
    now: number,
    context?: unknown,
  ): void {
    clock(now);
    const nextContext =
      context === undefined ? undefined : codingContextSchema.parse(context);
    z.number().int().min(1).max(101).parse(expectedRevision);
    z.string().min(1).max(100000).parse(prompt);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      if (b.revision !== expectedRevision) throw new Error("Stale revision");
      if (b.status === "running" || b.status === "cancelled")
        throw new Error("Cannot revise running or cancelled run");
      if (b.revisions.length >= 100) throw new Error("Revision limit reached");
      b.revisions.push({
        revision: b.revision,
        prompt: b.request.task.prompt,
        ...(b.request.context ? { context: b.request.context } : {}),
        at: now,
      });
      b.revision++;
      b.request.task.prompt = prompt;
      if (nextContext !== undefined) b.request.context = nextContext;
      if (b.status === "ready_for_review")
        b.status = b.attempts >= b.request.maxAttempts ? "exhausted" : "ready";
      this.save(id, b);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  start(
    id: string,
    who: string,
    now: number,
    duration: number,
  ): DispatchToken | null {
    clock(now);
    ttl(duration);
    owner(who);
    if (now > Number.MAX_SAFE_INTEGER - duration)
      throw new Error("Clock overflow");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      if (
        b.status !== "ready" &&
        b.status !== "running" &&
        b.status !== "waiting_retry"
      ) {
        this.db.exec("COMMIT");
        return null;
      }
      if (b.lease && b.lease.until > now) {
        this.db.exec("COMMIT");
        return null;
      }
      // An expired lease fences publication; it does not prove inference stopped.
      if (b.status === "running") {
        b.status = "ambiguous";
        b.lease = null;
        b.dueAt = 0;
        this.save(id, b);
        this.db.exec("COMMIT");
        return null;
      }
      if (b.attempts >= b.request.maxAttempts) {
        b.status = "exhausted";
        b.lease = null;
        this.save(id, b);
        this.db.exec("COMMIT");
        return null;
      }
      if (b.status === "waiting_retry" && b.dueAt > now) {
        this.db.exec("COMMIT");
        return null;
      }
      const decision = codingRoute(
        b.request.task,
        b.config,
        this.health(),
        now,
      );
      if (decision.status !== "available") {
        b.lease = null;
        b.status = decision.status;
        b.dueAt = decision.status === "waiting_retry" ? decision.dueAt : 0;
        this.save(id, b);
        this.db.exec("COMMIT");
        return null;
      }
      b.dueAt = 0;
      b.attempts++;
      b.epoch++;
      b.status = "running";
      b.lease = {
        owner: who,
        epoch: b.epoch,
        until: now + duration,
        candidate: decision.selection.candidate.name,
        effort: decision.selection.effort,
      };
      b.dispatches.push({
        epoch: b.epoch,
        owner: who,
        candidate: decision.selection.candidate.name,
        effort: decision.selection.effort,
      });
      this.save(id, b);
      this.db.exec("COMMIT");
      return { owner: who, epoch: b.epoch, selection: decision.selection };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private recordMeasurement(
    b: Body,
    token: LeaseToken,
    input: AttemptMeasurement | undefined,
    outcome: z.infer<typeof attemptMeasurementSchema>["outcome"],
    now: number,
  ): void {
    const parsed = measurementSchema.safeParse(input);
    const issued = b.dispatches.find(
      (d) => d.epoch === token.epoch && d.owner === token.owner,
    );
    if (
      !parsed.success ||
      !issued?.effort ||
      b.measurements?.some((m) => m.epoch === token.epoch)
    )
      return;
    const candidate = b.config.candidates.find(
      (c) => c.name === issued.candidate,
    );
    b.measurements ??= [];
    b.measurements.push({
      ...parsed.data,
      estimatedUsd:
        candidate?.billing === "metered" ? parsed.data.estimatedUsd : null,
      epoch: token.epoch,
      candidate: issued.candidate,
      effort: issued.effort,
      completedAt: now,
      outcome,
    });
  }
  finish(
    id: string,
    token: LeaseToken,
    edits: Record<string, string>,
    status: FinishStatus,
    now: number,
    measurement?: AttemptMeasurement,
  ): boolean {
    clock(now);
    owner(token.owner);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      if (
        !b.lease ||
        b.status !== "running" ||
        b.lease.owner !== token.owner ||
        b.lease.epoch !== token.epoch ||
        b.lease.until <= now
      ) {
        this.db.exec("COMMIT");
        return false;
      }
      const writable = new Set(
        b.request.files.filter((f) => f.writable).map((f) => f.path),
      );
      const next = { ...b.files };
      for (const [p, s] of Object.entries(edits)) {
        if (!writable.has(p) || s.includes("\0") || bytes(s) > 32768)
          throw new Error("Invalid edits");
        const previous = next[p];
        if (!previous) throw new Error("Missing original");
        next[p] = { original: previous.original, current: s };
      }
      let total = 0;
      for (const f of Object.values(next)) total += bytes(f.current);
      if (total > MAX) throw new Error("Snapshot too large");
      if (
        status === "ready_for_review" &&
        Object.values(next).every((f) => f.current === f.original)
      )
        throw new Error("No changes");
      b.files = next;
      this.recordMeasurement(b, token, measurement, status, now);
      b.lease = null;
      b.status =
        status === "retry"
          ? b.attempts >= b.request.maxAttempts
            ? "exhausted"
            : "ready"
          : status;
      this.save(id, b);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  fail(
    id: string,
    token: LeaseToken,
    failure: Failure,
    now: number,
    measurement?: AttemptMeasurement,
  ): boolean {
    clock(now);
    const kind = failureKind.parse(failure.kind);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      const issued = b.dispatches.find(
        (d) => d.epoch === token.epoch && d.owner === token.owner,
      );
      const current =
        b.lease &&
        b.status === "running" &&
        b.lease.owner === token.owner &&
        b.lease.epoch === token.epoch &&
        b.lease.until > now;
      if (!issued || (!current && retryable(kind))) {
        this.db.exec("COMMIT");
        return false;
      }
      const candidate = b.config.candidates.find(
        (c) => c.name === issued.candidate,
      );
      if (!candidate) throw new Error("Missing committed attempt route");
      const previous = b.failures.find((f) => f.epoch === token.epoch);
      if (previous) {
        const merged = mergeFailure(
          new Failure(
            previous.kind,
            undefined,
            previous.origin,
            previous.outputReason,
          ),
          failure,
        );
        previous.kind = merged.kind;
        if (merged.origin === undefined) delete previous.origin;
        else previous.origin = merged.origin;
        if (merged.outputReason === undefined) delete previous.outputReason;
        else previous.outputReason = merged.outputReason;
      } else
        b.failures.push({
          epoch: token.epoch,
          candidate: candidate.name,
          kind,
          ...(failure.origin !== undefined ? { origin: failure.origin } : {}),
          ...(failure.outputReason !== undefined
            ? { outputReason: failure.outputReason }
            : {}),
          at: now,
        });
      if (current) this.recordMeasurement(b, token, measurement, "failed", now);
      // Late authenticated blocking failures remain evidence after user cancellation.
      if (b.status === "cancelled") {
        this.save(id, b);
        this.db.exec("COMMIT");
        return true;
      }
      b.lease = null;
      b.dueAt = 0;
      if (!retryable(kind)) b.status = "blocked";
      else {
        const key = `provider:${candidate.provider}`;
        b.health[key] = {
          until: Math.max(
            b.health[key]?.until ?? 0,
            retryAt(b.attempts, failure.retryAfterMs, now),
          ),
        };
        if (b.attempts >= b.request.maxAttempts) b.status = "exhausted";
        else {
          const decision = codingRoute(
            b.request.task,
            b.config,
            mergeCodingHealth([this.health(), b.health]),
            now,
          );
          b.status =
            decision.status === "available" ? "ready" : decision.status;
          b.dueAt = decision.status === "waiting_retry" ? decision.dueAt : 0;
        }
      }
      this.save(id, b);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  renew(id: string, token: LeaseToken, now: number, duration: number): boolean {
    clock(now);
    ttl(duration);
    if (now > Number.MAX_SAFE_INTEGER - duration)
      throw new Error("Clock overflow");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const b = this.row(id);
      if (
        !b.lease ||
        b.status !== "running" ||
        b.lease.owner !== token.owner ||
        b.lease.epoch !== token.epoch ||
        b.lease.until <= now
      ) {
        this.db.exec("COMMIT");
        return false;
      }
      b.lease.until = Math.max(b.lease.until, now + duration);
      this.save(id, b);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  /** Synchronous admission checks only; callback must not dispatch or start a nested transaction. */
  withWriteFence<T>(action: () => T): T {
    if (this.readOnly) throw new Error("Cannot fence a read-only snapshot");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }
}
