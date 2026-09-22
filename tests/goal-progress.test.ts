import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, afterEach } from "vitest";
import { Ledger } from "../src/ledger.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { createPiGoalWork } from "../src/pi-goal-work.js";
import { syncPiGoalWork } from "../src/pi-goal-progress.js";
import { Failure } from "../src/failures.js";
import { Supervisor } from "../src/supervisor.js";
const roots: string[] = [];
const handles: { close(): void }[] = [];
afterEach(async () => {
  for (const h of handles.splice(0)) h.close();
  for (const r of roots.splice(0))
    await rm(r, { recursive: true, force: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "goal-progress-")));
  roots.push(root);
  const candidates = ["author", "a", "b"].map((name) => ({
    name,
    provider: name,
    model: name,
    billing: "subscription",
    enabled: true,
    quality: 1,
    preference: 1,
    efforts: ["low"],
  }));
  await mkdir(join(root, ".pi"));
  await writeFile(join(root, "x.ts"), "export const x = 1;");
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: { candidates },
        roles: { coder: ["author"], reviewer: ["a", "b"] },
      },
    }),
  );
  const ledger = new Ledger(join(root, ".harness/ledger.sqlite"));
  handles.push(ledger);
  const task = { id: "x", prompt: "Fix x", minQuality: 1, effort: "low" };
  const goalId = ledger.create({
    objective: "Fix x",
    constraints: [],
    config: { candidates },
    maxAttempts: 2,
    tasks: [
      {
        ...task,
        acceptance: {
          kind: "workflow",
          specificationSha256: "a".repeat(64),
          reviewTask: { ...task, id: "r" },
          maxReviewPairs: 2,
        },
      },
    ],
  });
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({ available: candidates, scoped: [] }),
  };
  const created = await createPiGoalWork(
    JSON.stringify({
      goalId,
      taskId: "x",
      expectedRevision: 1,
      files: [{ path: "x.ts", writable: true }],
    }),
    context,
  );
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite")),
    workflows = new CodingWorkflows(join(root, ".harness/workflows.sqlite"));
  handles.push(coding, workflows);
  return { root, goalId, ledger, context, id: created.id, coding, workflows };
}
test("records unfinished quota wait without accepting output, spending attempts or blocking resume", async () => {
  const f = await fixture();
  const first = await syncPiGoalWork(f.id, f.context);
  expect(first.authorAttempts).toBe(0);
  await f.workflows.resume(f.id, f.coding, () =>
    Promise.reject(new Failure("quota", 60000)),
  );
  const progress = await syncPiGoalWork(f.id, f.context);
  expect(progress).toMatchObject({
    codingId: f.id,
    authorAttempts: 1,
    authorMaxAttempts: 2,
    codingStatus: "waiting_retry",
    codingFailure: "quota",
    reviewPairsUsed: 0,
  });
  expect(progress.codingRetryAt).toBeGreaterThan(Date.now());
  expect(f.ledger.goal(f.goalId).tasks[0]?.status).not.toBe("completed");
  const events = f.ledger.events().length;
  expect(await syncPiGoalWork(f.id, f.context)).toEqual(progress);
  expect(f.ledger.events()).toHaveLength(events);
  let calls = 0;
  await f.workflows.resume(f.id, f.coding, () => {
    calls++;
    return Promise.resolve("");
  });
  expect(calls).toBe(0);
  const supervisor = new Supervisor(f.ledger, () => {
    throw Error("No text dispatch");
  });
  try {
    await supervisor.tick();
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toEqual(
      progress,
    );
  } finally {
    supervisor.close();
  }
});
test("records ambiguous in-flight work as an observation and does not redispatch it", async () => {
  const f = await fixture();
  const selected = {
    candidate: f.coding.read(f.id).config.candidates[0],
    effort: "low",
  };
  if (!selected.candidate) throw Error("fixture");
  const token = f.coding.start(f.id, "worker", Date.now(), 30000);
  expect(token).toBeDefined();
  const p = await syncPiGoalWork(f.id, f.context);
  expect(p.authorAttempts).toBe(1);
  expect(p.codingStatus).toBe("running");
  expect(f.ledger.goal(f.goalId).tasks[0]?.status).toBe("ready");
});
test("cancellation and revised context cannot use unchanged-progress fast paths; history remains", async () => {
  for (const revise of [false, true]) {
    const f = await fixture();
    const progress = await syncPiGoalWork(f.id, f.context);
    if (revise)
      f.ledger.revise(
        f.goalId,
        1,
        f.ledger.goal(f.goalId).contract,
        "user revision",
      );
    else f.ledger.cancel(f.goalId, 1, "user cancellation");
    await expect(syncPiGoalWork(f.id, f.context)).rejects.toThrow();
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toEqual(
      progress,
    );
  }
});
test("Pi exposes progress sync without starting an inference executor", async () => {
  const f = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: string[] = [];
  await relentlessCommand(
    `goal-sync ${f.id}`,
    {
      ...f.context,
      ui: { notify: (message, level) => messages.push(level + message) },
    },
    () => {
      throw Error("No dispatch");
    },
  );
  expect(messages[0]).toContain("info");
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress?.codingId).toBe(
    f.id,
  );
});

test("counter rollback and conflicting coding identities cannot overwrite progress", async () => {
  const f = await fixture();
  const p = await syncPiGoalWork(f.id, f.context);
  const { recordGoalWorkProgress } =
    await import("../src/goal-work-progress-record.js");
  const g = f.ledger.goal(f.goalId);
  const higher = recordGoalWorkProgress(g, {
    ...p,
    authorAttempts: 1,
    reviewPairsUsed: 1,
  });
  expect(() => recordGoalWorkProgress(higher, p)).toThrow();
  expect(() =>
    recordGoalWorkProgress(g, { ...p, codingId: "other" }),
  ).toThrow();
  expect(() =>
    recordGoalWorkProgress(g, { ...p, authorMaxAttempts: 3 }),
  ).toThrow();
});
test("lost project trust and a failed event write cannot commit observations", async () => {
  const f = await fixture();
  let checks = 0;
  await expect(
    syncPiGoalWork(f.id, {
      ...f.context,
      isProjectTrusted: () => ++checks < 3,
    }),
  ).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toBeUndefined();
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(f.ledger.path);
  try {
    db.exec(
      "CREATE TRIGGER progress_fault BEFORE INSERT ON events WHEN NEW.kind='goal_work_progress' BEGIN SELECT RAISE(ABORT,'fault'); END",
    );
    await expect(syncPiGoalWork(f.id, f.context)).rejects.toThrow("fault");
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toBeUndefined();
    db.exec("DROP TRIGGER progress_fault");
    await syncPiGoalWork(f.id, f.context);
  } finally {
    db.close();
  }
});
test("concurrent syncs converge to one observation event without dispatch", async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    syncPiGoalWork(f.id, f.context),
    syncPiGoalWork(f.id, f.context),
  ]);
  expect(a).toEqual(b);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(f.ledger.path, { readOnly: true });
  try {
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM events WHERE kind='goal_work_progress'",
        )
        .get()?.["n"],
    ).toBe(1);
  } finally {
    db.close();
  }
});

test.each(["resume", "run-verified"])(
  "Pi %s automatically records settled quota progress",
  async (command) => {
    const f = await fixture();
    const { relentlessCommand } = await import("../src/pi-extension.js");
    const messages: string[] = [];
    await relentlessCommand(
      `${command} ${f.id}${command === "run-verified" ? " execution.json" : ""}`,
      {
        ...f.context,
        ui: { notify: (message, level) => messages.push(level + message) },
      },
      () =>
        f.workflows.resume(f.id, f.coding, () =>
          Promise.reject(new Failure("quota", 60000)),
        ),
    );
    expect(messages[0]).toContain("info");
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toMatchObject({
      authorAttempts: 1,
      codingFailure: "quota",
      codingStatus: "waiting_retry",
    });
  },
);
test("automatic collection runs after a thrown workflow action without hiding its failure", async () => {
  const f = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: string[] = [];
  await relentlessCommand(
    `resume ${f.id}`,
    {
      ...f.context,
      ui: { notify: (message, level) => messages.push(level + message) },
    },
    () => {
      f.coding.start(f.id, "worker", Date.now(), 30000);
      return Promise.reject(new Error("workflow failed"));
    },
  );
  expect(messages[0]).toContain("errorRelentless command failed");
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toMatchObject({
    authorAttempts: 1,
    codingStatus: "running",
  });
});
test("status remains read-only and shutdown prevents automatic goal writes", async () => {
  for (const command of ["status", "resume"]) {
    const f = await fixture();
    const { relentlessCommand } = await import("../src/pi-extension.js");
    const controller = new AbortController();
    await relentlessCommand(
      `${command} ${f.id}`,
      {
        ...f.context,
        signal: controller.signal,
        ui: { notify: () => undefined },
      },
      () => {
        if (command === "resume") controller.abort();
        return Promise.resolve({ status: "test" });
      },
    );
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toBeUndefined();
  }
});
test("collection failure reports pending without replacing a successful workflow result", async () => {
  const f = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: string[] = [];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(f.ledger.path);
  try {
    db.exec(
      "CREATE TRIGGER progress_fault BEFORE INSERT ON events WHEN NEW.kind='goal_work_progress' BEGIN SELECT RAISE(ABORT,'fault'); END",
    );
    await relentlessCommand(
      `resume ${f.id}`,
      {
        ...f.context,
        ui: { notify: (message, level) => messages.push(level + message) },
      },
      () => Promise.resolve({ preserved: "workflow-result" }),
    );
    expect(messages[0]).toContain("workflow-result");
    expect(messages.some((m) => m.includes("progress is pending"))).toBe(true);
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toBeUndefined();
  } finally {
    db.close();
  }
});

test("collector contains corrupt journals and throwing trust checks without side effects", async () => {
  const { collectPiGoalProgress } =
    await import("../src/pi-goal-collection.js");
  const f = await fixture();
  expect(
    await collectPiGoalProgress(f.id, {
      ...f.context,
      isProjectTrusted: () => {
        throw Error("trust unavailable");
      },
    }),
  ).toBe("inactive");
  expect(await collectPiGoalProgress("missing-id", f.context)).toBe("pending");
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowProgress).toBeUndefined();
});
test("unbound workflows return a distinct collection outcome without creating a goal ledger", async () => {
  const { collectPiGoalProgress } =
    await import("../src/pi-goal-collection.js");
  const { existsSync } = await import("node:fs");
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "unbound-collect-")),
  );
  roots.push(root);
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  handles.push(coding);
  const id = coding.create(
    {
      sourceRoot: root,
      task: { id: "plain", prompt: "Fix x", minQuality: 1, effort: "low" },
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    {
      candidates: [
        {
          name: "a",
          provider: "a",
          model: "a",
          billing: "subscription",
          enabled: true,
          quality: 1,
          preference: 1,
          efforts: ["low"],
        },
      ],
    },
    { "x.ts": "export const x=1;" },
  );
  expect(
    await collectPiGoalProgress(id, {
      cwd: root,
      isProjectTrusted: () => true,
    }),
  ).toBe("not_goal_bound");
  expect(existsSync(join(root, ".harness/ledger.sqlite"))).toBe(false);
});
