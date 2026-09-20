import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { Ledger } from "../src/ledger.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { CodingJournal } from "../src/coding-journal.js";
import { Failure } from "../src/failures.js";
import { createPiGoalWork } from "../src/pi-goal-work.js";
import { readPiGoalStatus } from "../src/pi-goal-status.js";
const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0))
    await rm(r, { recursive: true, force: true });
});
const candidates = ["author", "r1", "r2"].map((name) => ({
  name,
  provider: name,
  model: name,
  billing: "subscription",
  quality: 1,
  preference: 1,
  enabled: true,
  efforts: ["low"],
}));
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "pi-goal-status-"));
  roots.push(cwd);
  await mkdir(join(cwd, ".pi"));
  await writeFile(join(cwd, "x.ts"), "export const x = 1;");
  await writeFile(
    join(cwd, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: { candidates },
        roles: { coder: ["author"], reviewer: ["r1", "r2"] },
      },
    }),
  );
  const l = new Ledger(join(cwd, ".harness/ledger.sqlite"));
  const goalId = l.create({
    objective: "Fix x",
    constraints: [],
    config: { candidates },
    maxAttempts: 2,
    tasks: [
      {
        id: "fix",
        prompt: "Fix x",
        minQuality: 1,
        effort: "low",
        acceptance: {
          kind: "workflow",
          specificationSha256: "a".repeat(64),
          reviewTask: {
            id: "r",
            prompt: "Review",
            minQuality: 1,
            effort: "low",
          },
          maxReviewPairs: 1,
        },
      },
    ],
  });
  l.close();
  return {
    goalId,
    context: {
      cwd,
      isProjectTrusted: () => true,
      models: () => ({ available: candidates, scoped: [] }),
    },
  };
}
test("status reads live consumed attempts even before goal progress admission", async () => {
  const { goalId, context } = await fixture();
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "fix",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const c = new CodingJournal(join(context.cwd, ".harness/coding.sqlite"));
  const token = c.start(created.id, "test", 100, 100);
  if (!token) throw Error("missing token");
  c.fail(
    created.id,
    token,
    new Failure("unknown", undefined, "coding_output", "invalid_json"),
    101,
  );
  c.close();
  const result = await readPiGoalStatus(goalId, context);
  expect(result.tasks[0]?.goalRecordedAttempts).toBe(0);
  expect(result.tasks[0]?.work).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        codingId: created.id,
        authorAttempts: 1,
        codingStatus: "blocked",
        failure: expect.objectContaining({
          outputReason: "invalid_json",
        }) as unknown,
      }),
    ]),
  );
});
test("missing or untrusted status never initializes a journal", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-goal-status-empty-"));
  roots.push(cwd);
  await expect(
    readPiGoalStatus("missing", { cwd, isProjectTrusted: () => true }),
  ).rejects.toThrow();
  await expect(
    readPiGoalStatus("missing", { cwd, isProjectTrusted: () => false }),
  ).rejects.toThrow();
  expect(existsSync(join(cwd, ".harness"))).toBe(false);
});

test("Pi status command reports an existing goal without dispatch", async () => {
  const { goalId, context } = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: string[] = [];
  await relentlessCommand(
    `goal-status ${goalId}`,
    {
      ...context,
      ui: {
        notify: (message, type) => {
          expect(type).toBe("info");
          messages.push(message);
        },
      },
    },
    () => Promise.reject(new Error("Must not dispatch")),
  );
  expect(messages[0]).toContain(goalId);
  expect(messages[0]).toContain('"goalRecordedAttempts"');
});

test("status distinguishes a review auth block from a ready coding snapshot without writes", async () => {
  const { goalId, context } = await fixture();
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "fix",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const coding = new CodingJournal(join(context.cwd, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(context.cwd, ".harness/workflows.sqlite"),
  );
  try {
    const state = await workflows.resume(
      created.id,
      coding,
      (_task, selection) => {
        if (selection.candidate.provider === "author")
          return Promise.resolve(
            JSON.stringify({
              edits: [{ path: "x.ts", content: "export const x = 2;" }],
            }),
          );
        return Promise.reject(new Failure("auth", undefined, "worker_setup"));
      },
    );
    roots.push(...state.artifactDirectories);
    expect(state.phase).toBe("blocked");
    expect(coding.read(created.id).status).toBe("ready_for_review");
    const before = workflows.storageDigest(created.id);
    const result = await readPiGoalStatus(goalId, context);
    expect(result.tasks[0]?.work[0]).toMatchObject({
      codingStatus: "ready_for_review",
      workflow: {
        phase: "blocked",
        reason: "auth",
        reviewPairsUsed: 1,
        maxReviewPairs: 1,
        currentCodingRevision: true,
      },
    });
    expect(workflows.storageDigest(created.id)).toBe(before);
    expect(coding.read(created.id).attempts).toBe(1);
  } finally {
    workflows.close();
    coding.close();
  }
});

test("missing workflow journal is reported as unknown without creating it", async () => {
  const { goalId, context } = await fixture();
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "fix",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const path = join(context.cwd, ".harness/workflows.sqlite");
  await rm(path);
  const result = await readPiGoalStatus(goalId, context);
  expect(result.tasks[0]?.work[0]).toMatchObject({
    codingId: created.id,
    workflow: null,
  });
  expect(existsSync(path)).toBe(false);
});

test("status reports missing rows but refuses corrupt workflow records", async () => {
  const { goalId, context } = await fixture();
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "fix",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const db = new DatabaseSync(join(context.cwd, ".harness/workflows.sqlite"));
  try {
    db.prepare("UPDATE workflows SET hash=? WHERE id=?").run(
      "0".repeat(64),
      created.id,
    );
    await expect(readPiGoalStatus(goalId, context)).rejects.toThrow(
      "Corrupt workflow",
    );
    db.prepare("DELETE FROM workflows WHERE id=?").run(created.id);
    expect(
      (await readPiGoalStatus(goalId, context)).tasks[0]?.work[0],
    ).toMatchObject({ workflow: null });
  } finally {
    db.close();
  }
});

test("status labels a workflow whose coding revision has changed", async () => {
  const { goalId, context } = await fixture();
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "fix",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const coding = new CodingJournal(join(context.cwd, ".harness/coding.sqlite"));
  try {
    coding.revisePrompt(created.id, 1, "Updated task boundary", Date.now());
  } finally {
    coding.close();
  }
  expect(
    (await readPiGoalStatus(goalId, context)).tasks[0]?.work[0],
  ).toMatchObject({
    workflow: { phase: "coding", currentCodingRevision: false },
  });
});
