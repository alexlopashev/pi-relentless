import { assertGoalWork } from "./goal-work.js";
import { validateReviewContinuation } from "./review-continuation.js";
import { reviewRoutes } from "./review-routing.js";
import { mergeCodingHealth } from "./coding-health.js";
import { reviewCooldownAt } from "./review-retry.js";
import { DatabaseSync } from "./sqlite.js";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { verificationTimingSchema } from "./verification-timing.js";
import type { CodingJournal, CodingSnapshot } from "./coding-journal.js";
import { resumeCoding } from "./durable-coding.js";
import {
  reviewCoding,
  reviewAuthors,
  reviewRequestSchema,
  type CodingReviewReport,
} from "./coding-review.js";
import { Failure } from "./failures.js";
import { repairPrompt } from "./workflow-prompt.js";
import {
  configSchema,
  efforts,
  type Config,
  type Task,
  type Route,
} from "./router.js";
import type { Worker } from "./swarm.js";

const verificationSchema = z
  .strictObject({
    checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
    specificationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reportSha256: z.string().regex(/^[a-f0-9]{64}$/),
    accepted: z.boolean(),
    outcome: z.enum([
      "executed",
      "test_process_failed",
      "invalid_evidence",
      "wall_limit",
      "output_limit",
      "interrupted",
    ]),
    directory: z.string().min(1).max(4096),
    feedback: z.string().max(8000),
    timing: verificationTimingSchema.optional(),
    packageSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (v) => !v.accepted || v.outcome === "executed",
    "Invalid verification decision",
  );
const stateSchema = z
  .strictObject({
    authenticationRecoveries: z
      .array(
        z.strictObject({
          at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          reportSha256: z.string().regex(/^[a-f0-9]{64}$/),
          checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .max(5)
      .optional(),
    verification: verificationSchema.nullable().default(null),
    verificationContractSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    verificationAttempts: z
      .array(
        z
          .strictObject({
            directory: z.string().min(1).max(4096),
            checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
            packageSha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable(),
            startedAt: z.number().int().nonnegative().nullable(),
            completedAt: z.number().int().nonnegative().nullable(),
            proof: verificationSchema.nullable(),
          })
          .refine(
            (a) =>
              a.proof === null
                ? a.completedAt === null
                : (a.completedAt !== null || a.startedAt === null) &&
                  a.proof.directory === a.directory &&
                  a.proof.checkpointSha256 === a.checkpointSha256,
            "Verification attempt binding mismatch",
          ),
      )
      .max(20)
      .refine(
        (a) => new Set(a.map((x) => x.directory)).size === a.length,
        "Duplicate verification directory",
      )
      .optional(),
    verificationHistoryComplete: z.boolean().optional(),
    reviewCooldowns: z
      .record(
        z.string(),
        z.strictObject({ until: z.number().int().nonnegative() }),
      )
      .optional(),
    expectedRevision: z.number().int().positive(),
    basePrompt: z.string().min(1).max(100000),
    contractSha256: z.string().regex(/^[a-f0-9]{64}$/),
    review: reviewRequestSchema,
    maxReviewPairs: z.number().int().min(1).max(5),
    reviewPairsUsed: z.number().int().min(0).max(5),
    phase: z.enum([
      "coding",
      "review",
      "reviewing",
      "repair",
      "verification_required",
      "verified",
      "blocked",
    ]),
    repairPrompt: z.string().min(1).max(100000).nullable(),
    pendingReview: z.string().max(524288).optional(),
    lastReport: z.string().max(524288).nullable(),
    reports: z.array(z.string().max(524288)).max(5),
    artifactDirectories: z.array(z.string().max(4096)).max(20),
    reviewedCheckpointSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    reason: z.string().max(100).nullable(),
    retryAt: z.number().int().nonnegative().nullable(),
    artifactDirectory: z.string().max(4096).optional(),
  })
  .refine(
    (s) =>
      s.phase !== "verified" ||
      (s.verification?.accepted === true &&
        s.verification.checkpointSha256 === s.reviewedCheckpointSha256),
    "Missing verified evidence",
  )
  .refine(
    (s) => s.reviewPairsUsed <= s.maxReviewPairs,
    "Review budget exceeded",
  )
  .refine(
    (s) =>
      s.pendingReview === undefined ||
      (s.reviewPairsUsed > 0 &&
        s.reports.length === s.reviewPairsUsed &&
        s.reports.at(-1) === s.pendingReview &&
        s.lastReport === s.pendingReview &&
        ["review", "reviewing", "blocked"].includes(s.phase)),
    "Invalid pending review slot",
  );
export type WorkflowState = z.infer<typeof stateSchema>;
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const contractHash = (snapshot: CodingSnapshot): string =>
  hash({
    request: {
      ...snapshot.request,
      task: { ...snapshot.request.task, prompt: "" },
    },
    config: snapshot.config,
  });
const TTL = 30000;

/** Persistent orchestration metadata; coding snapshots remain authoritative in CodingJournal. */
export class CodingWorkflows {
  private readonly db: DatabaseSync;
  private closed = false;
  readonly readOnly: boolean;
  constructor(
    readonly path: string,
    options: { readOnly?: boolean } = {},
  ) {
    this.readOnly = options.readOnly ?? false;
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
        if (!existing)
          this.db.exec(
            "CREATE TABLE workflows(id TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL, owner TEXT, until INTEGER NOT NULL DEFAULT 0)",
          );
      } else {
        this.db.exec("BEGIN");
      }
      const integrity = this.db.prepare("PRAGMA quick_check").get();
      if (integrity?.["quick_check"] !== "ok")
        throw new Error("Corrupt workflow database");
      // Preparing every persisted column also rejects incomplete existing schemas.
      this.db.prepare("SELECT id,body,hash,owner,until FROM workflows").all();
      for (const row of this.db.prepare("SELECT id FROM workflows").all()) {
        if (typeof row["id"] !== "string") throw new Error("Corrupt workflow");
        this.read(row["id"]);
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  storageDigest(id: string): string {
    this.read(id);
    const row = this.db
      .prepare("SELECT hash FROM workflows WHERE id=?")
      .get(id);
    if (typeof row?.["hash"] !== "string")
      throw new Error("Missing workflow digest");
    return row["hash"];
  }
  reviewHealth(): Record<string, { until: number }> {
    return mergeCodingHealth(
      this.db
        .prepare("SELECT id FROM workflows")
        .all()
        .map((row) => {
          if (typeof row["id"] !== "string")
            throw new Error("Corrupt workflow identity");
          return this.read(row["id"]).reviewCooldowns ?? {};
        }),
    );
  }
  create(
    id: string,
    coding: CodingJournal,
    request: unknown,
    maxReviewPairs: number,
  ): void {
    if (this.readOnly) throw new Error("Workflow inspection is read-only");
    const snapshot = coding.read(id);
    const goal = assertGoalWork(
      snapshot.request,
      undefined,
      "coder",
      Date.now(),
      snapshot.config,
    );
    const review = reviewRequestSchema.parse(request);
    if (
      goal &&
      (JSON.stringify(review.task) !== JSON.stringify(goal.reviewTask) ||
        maxReviewPairs !== goal.maxReviewPairs)
    )
      throw new Error("Goal review contract changed");
    assertGoalWork(
      snapshot.request,
      undefined,
      "reviewer",
      Date.now(),
      review.config,
    );
    const state = stateSchema.parse({
      ...(goal ? { verificationContractSha256: goal.specificationSha256 } : {}),
      expectedRevision: snapshot.revision,
      basePrompt: snapshot.request.task.prompt,
      contractSha256: contractHash(snapshot),
      review,
      maxReviewPairs,
      reviewPairsUsed: 0,
      verificationAttempts: [],
      verificationHistoryComplete: true,
      phase: "coding",
      repairPrompt: null,
      lastReport: null,
      reports: [],
      artifactDirectories: [],
      reviewedCheckpointSha256: null,
      reason: null,
      retryAt: null,
    });
    const body = JSON.stringify(state);
    this.db
      .prepare("INSERT INTO workflows(id,body,hash) VALUES(?,?,?)")
      .run(id, body, hash(state));
  }
  has(id: string): boolean {
    return (
      this.db.prepare("SELECT id FROM workflows WHERE id=?").get(id) !==
      undefined
    );
  }
  read(id: string): WorkflowState {
    const row = this.db
      .prepare("SELECT body,hash FROM workflows WHERE id=?")
      .get(id);
    if (typeof row?.["body"] !== "string") throw new Error("Unknown workflow");
    const value: unknown = JSON.parse(row["body"]);
    if (hash(value) !== row["hash"]) throw new Error("Corrupt workflow");
    return stateSchema.parse(value);
  }
  /** Explicit operator action after login repair; reopens review without dispatch or budget reset. */
  retryReviewAuthentication(
    id: string,
    coding: CodingJournal,
    expectedDigest: string,
    commitFence?: <T>(commit: () => T) => T,
  ): WorkflowState {
    if (
      this.readOnly ||
      coding.readOnly ||
      !/^[a-f0-9]{64}$/.test(expectedDigest)
    )
      throw new Error("Invalid authentication recovery");
    const commit = <T>(action: () => T): T =>
      commitFence ? commitFence(action) : action();
    const owner = randomUUID();
    if (!commit(() => this.claim(id, owner)))
      throw new Error("Workflow is leased");
    try {
      if (this.storageDigest(id) !== expectedDigest)
        throw new Error("Workflow changed");
      const state = this.read(id),
        snapshot = coding.read(id);
      if (
        state.phase !== "blocked" ||
        state.reason !== "auth" ||
        state.pendingReview !== undefined ||
        state.verification ||
        state.reviewPairsUsed >= state.maxReviewPairs ||
        !state.lastReport ||
        state.lastReport !== state.reports.at(-1) ||
        snapshot.status !== "ready_for_review" ||
        snapshot.revision !== state.expectedRevision
      )
        throw new Error("Workflow is not eligible for authentication recovery");
      const routeSchema = z.strictObject({
        candidate: configSchema.shape.candidates.element,
        effort: z.enum(efforts),
      });
      const report = z
        .object({
          id: z.string(),
          revision: z.number(),
          checkpointSha256: z.string(),
          requestSha256: z.string(),
          status: z.literal("failed"),
          failure: z.literal("auth"),
          failureStage: z.literal("inference"),
          failureRoute: routeSchema,
          attempts: z
            .array(
              z.object({
                route: routeSchema,
                failure: z.string().optional(),
                failureOrigin: z.string().optional(),
              }),
            )
            .min(1),
        })
        .parse(JSON.parse(state.lastReport) as unknown);
      const last = report.attempts.at(-1);
      const checkpointSha256 = hash(snapshot);
      if (
        report.id !== id ||
        report.revision !== snapshot.revision ||
        report.checkpointSha256 !== checkpointSha256 ||
        report.requestSha256 !== hash(state.review) ||
        last?.failure !== "auth" ||
        last.failureOrigin !== "worker_setup" ||
        hash(last.route) !== hash(report.failureRoute)
      )
        throw new Error("Authentication report binding mismatch");
      for (const text of state.reports) {
        const previous = z
          .object({
            failure: z.string().optional(),
            attempts: z.array(z.object({ failure: z.string().optional() })),
          })
          .parse(JSON.parse(text) as unknown);
        if (
          [previous.failure, ...previous.attempts.map((a) => a.failure)].some(
            (f) =>
              f !== undefined &&
              ["policy", "permission", "approval", "unknown"].includes(f),
          )
        )
          throw new Error("Blocking review history");
      }
      const candidate = state.review.config.candidates.find(
        (c) => hash(c) === hash(report.failureRoute.candidate),
      );
      if (!candidate) throw new Error("Reviewer configuration changed");
      assertGoalWork(
        snapshot.request,
        report.failureRoute,
        "reviewer",
        Date.now(),
        state.review.config,
      );
      state.authenticationRecoveries = [
        ...(state.authenticationRecoveries ?? []),
        {
          at: Date.now(),
          reportSha256: createHash("sha256")
            .update(state.lastReport)
            .digest("hex"),
          checkpointSha256,
        },
      ];
      state.phase = "review";
      state.reason = null;
      state.retryAt = null;
      commit(() => {
        coding.withCheckpoint(id, checkpointSha256, (current) => {
          assertGoalWork(
            current.request,
            report.failureRoute,
            "reviewer",
            Date.now(),
            state.review.config,
          );
          this.save(id, owner, state);
        });
      });
      return state;
    } finally {
      this.db
        .prepare(
          "UPDATE workflows SET owner=NULL,until=0 WHERE id=? AND owner=?",
        )
        .run(id, owner);
    }
  }
  private claim(id: string, owner: string): boolean {
    const now = Date.now();
    return (
      this.db
        .prepare(
          "UPDATE workflows SET owner=?,until=? WHERE id=? AND (owner IS NULL OR until<=?)",
        )
        .run(owner, now + TTL, id, now).changes === 1
    );
  }
  private save(id: string, owner: string, state: WorkflowState): void {
    const checked = stateSchema.parse(state);
    const body = JSON.stringify(checked);
    if (
      this.db
        .prepare(
          "UPDATE workflows SET body=?,hash=? WHERE id=? AND owner=? AND until>?",
        )
        .run(body, hash(checked), id, owner, Date.now()).changes !== 1
    )
      throw new Error("Workflow lease lost");
  }
  /** Called by the host verifier after checking the full evidence chain. */
  private initializeVerificationHistory(state: WorkflowState): void {
    if (state.verificationAttempts !== undefined) return;
    state.verificationHistoryComplete = false;
    const prior = state.verification;
    state.verificationAttempts = prior
      ? [
          {
            directory: prior.directory,
            checkpointSha256: prior.checkpointSha256,
            packageSha256: null,
            startedAt: null,
            completedAt: null,
            proof: prior,
          },
        ]
      : [];
  }
  bindVerificationContract(id: string, specificationSha256: string): void {
    if (this.readOnly)
      throw new Error("Verification contract requires mutable journal");
    if (!/^[a-f0-9]{64}$/.test(specificationSha256))
      throw new Error("Invalid verification contract");
    const owner = randomUUID();
    if (!this.claim(id, owner)) throw new Error("Workflow is leased");
    try {
      const state = this.read(id);
      if (state.verificationContractSha256 !== undefined) {
        if (state.verificationContractSha256 !== specificationSha256)
          throw new Error("Verification contract changed");
        return;
      }
      if (state.verification || state.verificationAttempts?.length)
        throw new Error("Cannot bind contract after verification starts");
      state.verificationContractSha256 = specificationSha256;
      this.save(id, owner, state);
    } finally {
      this.db
        .prepare(
          "UPDATE workflows SET owner=NULL,until=0 WHERE id=? AND owner=?",
        )
        .run(id, owner);
    }
  }
  beginVerification(
    id: string,
    coding: CodingJournal,
    directory: string,
    packageSha256: string,
  ): void {
    if (this.readOnly || coding.readOnly)
      throw new Error("Verification needs mutable journals");
    if (!isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(packageSha256))
      throw new Error("Invalid verification intent");
    const owner = randomUUID();
    if (!this.claim(id, owner)) throw new Error("Workflow is leased");
    try {
      const state = this.read(id);
      if (
        state.phase !== "verification_required" ||
        !state.reviewedCheckpointSha256
      )
        throw new Error("Verification requires reviewed checkpoint");
      this.initializeVerificationHistory(state);
      const attempts = state.verificationAttempts;
      if (!attempts) throw new Error("Missing verification history");
      if (attempts.length >= 20)
        throw new Error("Verification attempt limit reached");
      if (attempts.some((a) => a.directory === directory))
        throw new Error(
          "Verification already reserved; reconcile existing artifacts",
        );
      const checkpointSha256 = state.reviewedCheckpointSha256;
      coding.withCheckpoint(id, checkpointSha256, () => {
        attempts.push({
          directory,
          checkpointSha256,
          packageSha256,
          startedAt: Date.now(),
          completedAt: null,
          proof: null,
        });
        this.save(id, owner, state);
      });
    } finally {
      this.db
        .prepare(
          "UPDATE workflows SET owner=NULL,until=0 WHERE id=? AND owner=?",
        )
        .run(id, owner);
    }
  }
  /** Called by the host verifier after checking the full evidence chain. */
  recordVerification(
    id: string,
    coding: CodingJournal,
    input: unknown,
    commitFence?: <T>(commit: () => T) => T,
  ): WorkflowState {
    const commit = () => this.recordVerificationState(id, coding, input);
    return commitFence ? commitFence(commit) : commit();
  }
  private recordVerificationState(
    id: string,
    coding: CodingJournal,
    input: unknown,
  ): WorkflowState {
    if (this.readOnly || coding.readOnly)
      throw new Error("Verification needs fresh mutable journals");
    const proof = verificationSchema.parse(input);
    const owner = randomUUID();
    if (!this.claim(id, owner)) throw new Error("Workflow is leased");
    try {
      const state = this.read(id);
      const goal = assertGoalWork(
        coding.read(id).request,
        undefined,
        "coder",
        Date.now(),
        undefined,
        { codingId: id, checkpointSha256: proof.checkpointSha256 },
      );
      if (goal && goal.specificationSha256 !== proof.specificationSha256)
        throw new Error("Goal verification contract changed");
      if (
        state.verificationContractSha256 &&
        state.verificationContractSha256 !== proof.specificationSha256
      )
        throw new Error("Verification contract changed");
      if (state.verification && hash(state.verification) === hash(proof)) {
        if (state.phase === "verified")
          coding.withCheckpoint(id, proof.checkpointSha256, () => undefined);
        return state;
      }
      return coding.withCheckpoint(id, proof.checkpointSha256, (snapshot) => {
        assertGoalWork(snapshot.request);
        if (
          state.phase !== "verification_required" ||
          state.reviewedCheckpointSha256 !== proof.checkpointSha256 ||
          hash(snapshot) !== proof.checkpointSha256
        )
          throw new Error("Verification checkpoint is stale");
        this.initializeVerificationHistory(state);
        const attempts = state.verificationAttempts;
        if (!attempts) throw new Error("Missing verification history");
        const attempt = attempts.find((a) => a.directory === proof.directory);
        if (attempt) {
          if (
            attempt.checkpointSha256 !== proof.checkpointSha256 ||
            attempt.proof !== null ||
            (attempt.packageSha256 !== null &&
              attempt.packageSha256 !== proof.packageSha256)
          )
            throw new Error("Verification attempt changed");
          attempt.proof = proof;
          attempt.completedAt = Date.now();
        } else {
          if (attempts.length >= 20)
            throw new Error("Verification attempt limit reached");
          state.verificationHistoryComplete = false;
          attempts.push({
            directory: proof.directory,
            checkpointSha256: proof.checkpointSha256,
            packageSha256: null,
            startedAt: null,
            completedAt: Date.now(),
            proof,
          });
        }
        state.verification = proof;
        state.retryAt = null;
        if (proof.accepted) {
          state.phase = "verified";
          state.reason = null;
        } else if (proof.outcome === "test_process_failed") {
          if (snapshot.attempts >= snapshot.request.maxAttempts) {
            state.phase = "blocked";
            state.reason = "coding_budget";
          } else if (state.reviewPairsUsed >= state.maxReviewPairs) {
            state.phase = "blocked";
            state.reason = "review_budget";
          } else {
            const path = snapshot.request.files.find((f) => f.writable)?.path;
            if (!path) throw new Error("No writable candidate");
            try {
              state.repairPrompt = repairPrompt(state.basePrompt, [
                {
                  path,
                  line: 1,
                  message:
                    "Declared verification tests failed. Untrusted test output follows:\n" +
                    proof.feedback,
                },
              ]);
              state.phase = "repair";
              state.reason = null;
            } catch {
              state.phase = "blocked";
              state.reason = "repair_prompt_limit";
            }
          }
        } else {
          state.reason = "verification_" + proof.outcome;
        }
        this.save(id, owner, state);
        return state;
      });
    } finally {
      this.db
        .prepare(
          "UPDATE workflows SET owner=NULL,until=0 WHERE id=? AND owner=?",
        )
        .run(id, owner);
    }
  }
  async resume(
    id: string,
    coding: CodingJournal,
    worker: (
      task: Task,
      selection: Route,
      signal: AbortSignal,
      config: Config,
      onCostEstimate?: (estimatedUsd: number) => void,
    ) => Promise<string>,
    shutdown?: AbortSignal,
    commitFence?: <T>(commit: () => T) => T,
  ): Promise<WorkflowState> {
    const commit = <T>(action: () => T): T =>
      commitFence ? commitFence(action) : action();
    if (this.readOnly || coding.readOnly)
      throw new Error("Workflow needs fresh mutable journals");
    if (shutdown?.aborted) return this.read(id);
    this.read(id);
    const owner = randomUUID();
    if (!commit(() => this.claim(id, owner))) return this.read(id);
    const abort = new AbortController();
    const lost = (): boolean => abort.signal.aborted;
    const heartbeat = setInterval(() => {
      try {
        if (
          this.db
            .prepare(
              "UPDATE workflows SET until=? WHERE id=? AND owner=? AND until>?",
            )
            .run(Date.now() + TTL, id, owner, Date.now()).changes === 1
        )
          return;
      } catch {
        /* Lost checkpoint access revokes local dispatch. */
      }
      abort.abort();
    }, 1000);
    const guarded =
      (config: Config): Worker =>
      async (task, selection, signal, onCostEstimate) => {
        if (lost()) throw new Failure("unknown");
        try {
          const value = await worker(
            task,
            selection,
            AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]),
            config,
            onCostEstimate,
          );
          if (lost()) throw new Failure("unknown");
          return value;
        } catch (error) {
          if (lost()) throw new Failure("unknown");
          throw error;
        }
      };
    try {
      const state = this.read(id);
      for (let step = 0; step < 20; step++) {
        if (shutdown?.aborted) return state;
        if (lost()) throw new Error("Workflow lease lost");
        if (state.phase === "blocked") return state;
        const snapshot = coding.read(id);
        const block = (reason: string): WorkflowState => {
          state.phase = "blocked";
          state.reason = reason;
          state.retryAt = null;
          commit(() => {
            this.save(id, owner, state);
          });
          return state;
        };
        try {
          assertGoalWork(
            snapshot.request,
            undefined,
            "coder",
            Date.now(),
            snapshot.config,
            state.phase === "verified" && state.verification
              ? {
                  codingId: id,
                  checkpointSha256: state.verification.checkpointSha256,
                }
              : undefined,
          );
        } catch {
          return block("goal_changed");
        }
        if (
          state.phase === "verification_required" ||
          state.phase === "verified"
        ) {
          if (hash(snapshot) !== state.reviewedCheckpointSha256)
            return block("stale");
          return state;
        }
        if (contractHash(snapshot) !== state.contractSha256)
          return block("contract_changed");
        if (state.phase === "reviewing") return block("ambiguous_review");
        if (state.phase === "repair") {
          const prompt = state.repairPrompt;
          if (!prompt) return block("missing_repair_intent");
          if (snapshot.revision === state.expectedRevision) {
            if (snapshot.status !== "ready_for_review")
              return block("candidate_changed");
            commit(() => {
              coding.revisePrompt(
                id,
                state.expectedRevision,
                prompt,
                Date.now(),
              );
            });
          } else if (
            snapshot.revision !== state.expectedRevision + 1 ||
            snapshot.request.task.prompt !== prompt
          ) {
            return block("revision_changed");
          }
          state.expectedRevision++;
          state.phase = "coding";
          state.repairPrompt = null;
          state.retryAt = null;
          commit(() => {
            this.save(id, owner, state);
          });
          continue;
        }
        if (snapshot.revision !== state.expectedRevision)
          return block("revision_changed");
        if (["cancelled", "blocked", "exhausted"].includes(snapshot.status))
          return block(snapshot.status);
        if (state.phase === "coding") {
          const due =
            snapshot.status === "waiting_retry"
              ? snapshot.dueAt
              : snapshot.status === "running"
                ? (snapshot.lease?.until ?? 0)
                : 0;
          if (due > Date.now()) {
            state.retryAt = due;
            commit(() => {
              this.save(id, owner, state);
            });
            return state;
          }
          if (snapshot.status !== "ready_for_review") {
            const result = await resumeCoding(
              id,
              coding,
              guarded(snapshot.config),
              Date.now,
              shutdown,
              commitFence,
            );
            if (result.directory) {
              state.artifactDirectory = result.directory;
              state.artifactDirectories = [
                ...state.artifactDirectories,
                result.directory,
              ].slice(-20);
            }
            const next = coding.read(id);
            if (next.revision !== state.expectedRevision)
              return block("revision_changed");
            if (
              shutdown?.aborted &&
              (next.status === "ready" ||
                next.status === "waiting_retry" ||
                next.status === "running" ||
                next.status === "ready_for_review")
            ) {
              state.retryAt =
                next.status === "waiting_retry"
                  ? next.dueAt
                  : next.status === "running"
                    ? (next.lease?.until ?? null)
                    : null;
              commit(() => {
                this.save(id, owner, state);
              });
              return state;
            }
            if (next.status === "waiting_retry" || next.status === "running") {
              state.retryAt =
                next.status === "waiting_retry"
                  ? next.dueAt
                  : (next.lease?.until ?? null);
              commit(() => {
                this.save(id, owner, state);
              });
              return state;
            }
            if (next.status !== "ready_for_review") return block(next.status);
          }
          state.phase = "review";
          state.retryAt = null;
          commit(() => {
            this.save(id, owner, state);
          });
          continue;
        }
        let continuation: CodingReviewReport | undefined;
        if (state.pendingReview !== undefined) {
          try {
            continuation = validateReviewContinuation(
              JSON.parse(state.pendingReview) as unknown,
              {
                id,
                revision: snapshot.revision,
                checkpointSha256: hash(snapshot),
                requestSha256: hash(state.review),
                config: state.review.config,
                task: state.review.task,
                authors: reviewAuthors(snapshot),
                files: Object.fromEntries(
                  Object.entries(snapshot.files).map(([path, file]) => [
                    path,
                    file.current,
                  ]),
                ),
              },
            );
          } catch {
            return block("invalid_review_continuation");
          }
          // Preserve the observed deadline even if the originating health source is absent after restart.
          if (state.retryAt !== null && state.retryAt > Date.now())
            return state;
        } else if (state.reviewPairsUsed >= state.maxReviewPairs)
          return block("review_budget");
        // Older checkpoints contain only a workflow-wide retry deadline.
        if (
          continuation === undefined &&
          state.reviewCooldowns === undefined &&
          state.retryAt !== null &&
          state.retryAt > Date.now()
        )
          return state;
        const reviewHealth = () =>
          mergeCodingHealth([
            coding.health(),
            this.reviewHealth(),
            state.reviewCooldowns ?? {},
          ]);
        const plan = reviewRoutes(
          state.review.task,
          state.review.config,
          reviewAuthors(snapshot),
          reviewHealth(),
          Date.now(),
          continuation?.reviews.map(
            (review) => review.route.candidate.provider,
          ),
        );
        if (plan.status === "blocked") return block("review_unavailable");
        if (plan.status === "waiting_retry") {
          state.retryAt = plan.dueAt;
          state.reason ??= "review_cooldown";
          commit(() => {
            this.save(id, owner, state);
          });
          return state;
        }
        state.retryAt = null;
        state.reason = null;
        if (continuation === undefined) state.reviewPairsUsed++;
        state.phase = "reviewing";
        commit(() => {
          this.save(id, owner, state);
        }); // Reserve the entire pair before inference.
        let report: CodingReviewReport;
        try {
          report = await reviewCoding(
            id,
            coding,
            state.review,
            guarded(state.review.config),
            () => performance.now(),
            shutdown,
            () => this.reviewHealth(),
            continuation,
          );
        } catch {
          return block("review_error");
        }
        state.lastReport = JSON.stringify(report);
        if (continuation === undefined) state.reports.push(state.lastReport);
        else state.reports[state.reports.length - 1] = state.lastReport;
        delete state.pendingReview;
        if (report.status === "waiting_retry") {
          if (
            report.retryAt === undefined ||
            !Number.isSafeInteger(report.retryAt) ||
            report.retryAt < 0
          )
            return block("invalid_review_retry");
          state.pendingReview = state.lastReport;
          state.phase = "review";
          state.reason = "review_cooldown";
          state.retryAt = report.retryAt;
          commit(() => {
            this.save(id, owner, state);
          });
          return state;
        }
        if (report.status === "reviewed") {
          state.phase = "verification_required";
          state.reviewedCheckpointSha256 = report.checkpointSha256;
          commit(() => {
            this.save(id, owner, state);
          });
          return state;
        }
        if (report.status !== "findings") {
          let due: number | null;
          try {
            due = reviewCooldownAt(report, state.reviewPairsUsed, Date.now());
          } catch {
            return block("invalid_review_retry");
          }
          if (due !== null && report.failureRoute) {
            const key = `provider:${report.failureRoute.candidate.provider}`;
            state.reviewCooldowns ??= {};
            state.reviewCooldowns[key] = {
              until: Math.max(state.reviewCooldowns[key]?.until ?? 0, due),
            };
            if (state.reviewPairsUsed < state.maxReviewPairs) {
              const next = reviewRoutes(
                state.review.task,
                state.review.config,
                reviewAuthors(coding.read(id)),
                reviewHealth(),
                Date.now(),
              );
              if (next.status !== "blocked") {
                state.phase = "review";
                state.reason = report.failure ?? null;
                state.retryAt =
                  next.status === "waiting_retry" ? next.dueAt : Date.now();
                commit(() => {
                  this.save(id, owner, state);
                });
                return state;
              }
            }
          }
          return block(report.failure ?? report.status);
        }
        const current = coding.read(id);
        if (hash(current) !== report.checkpointSha256) return block("stale");
        if (current.attempts >= current.request.maxAttempts)
          return block("coding_budget");
        try {
          state.repairPrompt = repairPrompt(
            state.basePrompt,
            report.reviews.flatMap((r) => r.assessment.findings),
          );
        } catch {
          return block("repair_prompt_limit");
        }
        state.phase = "repair";
        commit(() => {
          this.save(id, owner, state);
        });
      }
      throw new Error("Workflow transition bound exceeded");
    } finally {
      clearInterval(heartbeat);
      abort.abort();
      this.db
        .prepare(
          "UPDATE workflows SET owner=NULL,until=0 WHERE id=? AND owner=?",
        )
        .run(id, owner);
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
