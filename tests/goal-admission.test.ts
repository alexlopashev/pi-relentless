import { expect, test, afterEach, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Ledger } from "../src/ledger.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { createPiGoalWork } from "../src/pi-goal-work.js";
import { admitPiGoalWork } from "../src/pi-goal-admission.js";
import {
  verifyWorkflow,
  inspectVerification,
} from "../src/workflow-verification.js";
import { promoteWorkflow } from "../src/workflow-promotion.js";
import { assertGoalWork } from "../src/goal-work.js";
import {
  canonicalDigest,
  verificationManifestSchema,
} from "../src/verification-assessment.js";
const roots: string[] = [];
const handles: { close(): void }[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const h of handles.splice(0)) h.close();
  for (const r of roots.splice(0))
    await rm(r, { recursive: true, force: true });
});
const packageInput = z.object({
  sources: z.record(z.string(), z.object({ path: z.string() })),
});
const spec = {
  version: 1,
  emulator: { path: "/emulator", sha256: "a".repeat(64) },
  kernel: { path: "/kernel", sha256: "b".repeat(64) },
  baseImage: { path: "/base", sha256: "c".repeat(64) },
  tests: { "tests/check.mjs": { path: "/tests", sha256: "d".repeat(64) } },
  entrypoint: "tests/check.mjs",
  wallSeconds: 30,
  outputBytes: 65536,
};
const acceptance = { kind: "test_process_exit", expected: 0 };
function verificationDrivers(mutate?: () => void, fail = false) {
  return {
    pack: async (path: string, output: string) => {
      const parsed = packageInput.parse(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      const sources = [];
      for (const [name, artifact] of Object.entries(parsed.sources).sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        const content = await readFile(artifact.path, "utf8");
        sources.push({
          path: name,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      }
      const manifest = {
        version: 1,
        emulator: spec.emulator,
        kernel: spec.kernel,
        image: spec.baseImage,
        wallSeconds: spec.wallSeconds,
        outputBytes: spec.outputBytes,
        candidateSha256: canonicalDigest(sources),
        testSha256: canonicalDigest({
          entrypoint: spec.entrypoint,
          files: [
            {
              path: "tests/check.mjs",
              sha256: spec.tests["tests/check.mjs"].sha256,
            },
          ],
        }),
      };
      await mkdir(output);
      await writeFile(join(output, "manifest.json"), JSON.stringify(manifest));
      return 0;
    },
    run: async (path: string, output: string) => {
      const manifest = verificationManifestSchema.parse(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      await mkdir(output);
      const report = {
        version: 1,
        outcome: fail ? "test_process_failed" : "executed",
        acceptance: "not_assessed",
        inputs: manifest,
        manifestSha256: canonicalDigest(manifest),
        controller: {
          exitCode: fail ? 1 : 0,
          candidateSha256: manifest.candidateSha256,
          testSha256: manifest.testSha256,
        },
        emulatorExitCode: 0,
        reaped: true,
        elapsedSeconds: 1,
        outputBytes: 0,
        hostMemoryBound: false,
      };
      await writeFile(join(output, "report.json"), JSON.stringify(report));
      await writeFile(
        join(output, "output.log"),
        fail ? "Assertion failed" : "Passed",
      );
      mutate?.();
      return fail ? 1 : 0;
    },
  };
}

async function fixture(
  expiringMemory = false,
  beforeWork?: (
    id: string,
    context: { cwd: string; isProjectTrusted(): boolean },
  ) => Promise<void>,
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "goal-admit-")));
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
  const execution = { package: spec, acceptance };
  const goalId = ledger.create({
    objective: "Fix x",
    memories: expiringMemory
      ? [
          {
            id: "boundary",
            kind: "instruction",
            authority: "user",
            text: "Preserve API",
            source: "user",
            scope: "goal",
            expiresAt: Date.now() + 60000,
          },
        ]
      : [],
    constraints: [],
    config: { candidates },
    maxAttempts: 1,
    tasks: [
      {
        ...task,
        acceptance: {
          kind: "workflow",
          specificationSha256: canonicalDigest(execution),
          reviewTask: { ...task, id: "r" },
          maxReviewPairs: 1,
        },
      },
    ],
  });
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({
      available: candidates.map((c) => ({ ...c })),
      scoped: [],
    }),
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
  const id = created.id;
  await beforeWork?.(id, context);
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(root, ".harness/workflows.sqlite"),
  );
  handles.push(coding, workflows);
  const result = await workflows.resume(id, coding, (_t, r) =>
    Promise.resolve(
      r.candidate.provider === "author"
        ? '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}'
        : '{"verdict":"no_findings","findings":[]}',
    ),
  );
  roots.push(...result.artifactDirectories);
  const directory = join(root, "verification");
  await verifyWorkflow(
    workflows,
    coding,
    id,
    execution,
    directory,
    verificationDrivers(),
  );
  return { root, ledger, goalId, context, id, coding, workflows, directory };
}
test("admits independently reviewed verified artifacts, survives reopen, and leaves source promotion explicit", async () => {
  const f = await fixture();
  const admitted = await admitPiGoalWork(f.id, f.context);
  expect(admitted.codingId).toBe(f.id);
  expect(f.ledger.goal(f.goalId).status).toBe("completed");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 1;",
  );
  expect(await admitPiGoalWork(f.id, f.context)).toEqual(admitted);
  const reopened = new Ledger(f.ledger.path);
  try {
    expect(reopened.goal(f.goalId).tasks[0]?.attempts).toBe(1);
  } finally {
    reopened.close();
  }
  expect(() => assertGoalWork(f.coding.read(f.id).request)).toThrow();
  expect(
    (await inspectVerification(f.workflows, f.coding, f.id, f.directory))
      .accepted,
  ).toBe(true);
  await promoteWorkflow(f.workflows, f.coding, f.id, join(f.root, "promotion"));
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
});
test("rejects a tampered verification artifact rather than trusting the saved verified flag", async () => {
  const f = await fixture();
  await writeFile(join(f.directory, "run/report.json"), "{}");
  await expect(admitPiGoalWork(f.id, f.context)).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).tasks[0]?.attempts).toBe(0);
});
test("lost project trust during inspection cannot commit completion", async () => {
  const f = await fixture();
  let checks = 0;
  await expect(
    admitPiGoalWork(f.id, {
      ...f.context,
      isProjectTrusted: () => ++checks < 3,
    }),
  ).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).status).toBe("active");
});
test("cancellation at the final commit fence rejects inspected evidence", async () => {
  const f = await fixture();
  // Fault injection must retain the original prototype method and invoke it with the receiving ledger.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Ledger.prototype.transaction;
  vi.spyOn(Ledger.prototype, "transaction").mockImplementation(function (
    this: Ledger,
    kind,
    ...args
  ) {
    if (kind === "goal_work_admitted")
      f.ledger.cancel(f.goalId, 1, "user cancellation");
    return original.call(this, kind, ...args);
  });
  await expect(admitPiGoalWork(f.id, f.context)).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).status).toBe("cancelled");
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowAdmission).toBeUndefined();
});
test("revision removes admission and completed artifact access never bypasses cancellation", async () => {
  const f = await fixture();
  await admitPiGoalWork(f.id, f.context);
  f.ledger.revise(
    f.goalId,
    1,
    f.ledger.goal(f.goalId).contract,
    "user revision",
  );
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowAdmission).toBeUndefined();
  await expect(
    inspectVerification(f.workflows, f.coding, f.id, f.directory),
  ).rejects.toThrow();
});

test("Pi exposes explicit admission without invoking an inference executor", async () => {
  const f = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: { text: string; level: string }[] = [];
  await relentlessCommand(
    `goal-admit ${f.id}`,
    {
      ...f.context,
      ui: { notify: (text, level) => messages.push({ text, level }) },
    },
    () => {
      throw new Error("No dispatch");
    },
  );
  expect(messages[0]?.level).toBe("info");
  expect(f.ledger.goal(f.goalId).status).toBe("completed");
});

test("coding and workflow fences remain held at the actual goal checkpoint write", async () => {
  const f = await fixture();
  const { DatabaseSync } = await import("node:sqlite");
  const c = new DatabaseSync(f.coding.path),
    w = new DatabaseSync(join(f.root, ".harness/workflows.sqlite"));
  // Retain the native method while intercepting only the real checkpoint SQL boundary.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = DatabaseSync.prototype.prepare;
  let checked = false;
  vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (
    this: InstanceType<typeof DatabaseSync>,
    sql,
  ) {
    const statement = original.call(this, sql);
    if (sql === "UPDATE checkpoint SET body=?,hash=? WHERE id=1") {
      const run = statement.run.bind(statement);
      vi.spyOn(statement, "run").mockImplementation((...args) => {
        checked = true;
        for (const db of [c, w]) {
          let locked = false;
          try {
            db.exec("BEGIN IMMEDIATE");
            db.exec("ROLLBACK");
          } catch {
            locked = true;
          }
          expect(locked).toBe(true);
        }
        return run(...args);
      });
    }
    return statement;
  });
  try {
    await admitPiGoalWork(f.id, f.context);
    expect(checked).toBe(true);
  } finally {
    c.close();
    w.close();
  }
});
test("failure writing the completion event rolls back receipt and attempt accounting", async () => {
  const f = await fixture();
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(f.ledger.path);
  try {
    db.exec(
      "CREATE TRIGGER admission_fault BEFORE INSERT ON events WHEN NEW.kind='goal_work_admitted' BEGIN SELECT RAISE(ABORT,'fault'); END",
    );
    await expect(admitPiGoalWork(f.id, f.context)).rejects.toThrow("fault");
    expect(f.ledger.goal(f.goalId).tasks[0]).toMatchObject({
      status: "ready",
      attempts: 0,
    });
    db.exec("DROP TRIGGER admission_fault");
    await admitPiGoalWork(f.id, f.context);
    expect(f.ledger.goal(f.goalId).tasks[0]?.attempts).toBe(1);
  } finally {
    db.close();
  }
});

test("resume after admission preserves verified evidence without dispatch", async () => {
  const f = await fixture();
  const admitted = await admitPiGoalWork(f.id, f.context);
  const before = f.workflows.read(f.id);
  const resumed = await f.workflows.resume(f.id, f.coding, () => {
    throw new Error("No dispatch");
  });
  expect(resumed).toEqual(before);
  expect(await admitPiGoalWork(f.id, f.context)).toEqual(admitted);
});

test("coding cancellation after inspection is rejected before the goal commit", async () => {
  const f = await fixture();
  let checks = 0;
  await expect(
    admitPiGoalWork(f.id, {
      ...f.context,
      isProjectTrusted: () => {
        if (++checks === 3) f.coding.cancel(f.id);
        return true;
      },
    }),
  ).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).tasks[0]?.workflowAdmission).toBeUndefined();
});
test("admitted artifacts still respect cancellation and expired memory context", async () => {
  for (const expired of [false, true]) {
    const f = await fixture(expired);
    await admitPiGoalWork(f.id, f.context);
    if (expired) {
      const later = Date.now() + 60001;
      vi.spyOn(Date, "now").mockReturnValue(later);
    } else f.ledger.cancel(f.goalId, 1, "user cancellation");
    await expect(admitPiGoalWork(f.id, f.context)).rejects.toThrow();
    await expect(
      inspectVerification(f.workflows, f.coding, f.id, f.directory),
    ).rejects.toThrow();
    await expect(
      promoteWorkflow(
        f.workflows,
        f.coding,
        f.id,
        join(f.root, "blocked-promotion"),
      ),
    ).rejects.toThrow();
    expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
      "export const x = 1;",
    );
    vi.restoreAllMocks();
  }
});

test("admission replaces unfinished progress with final counters without double counting", async () => {
  const { syncPiGoalWork } = await import("../src/pi-goal-progress.js");
  const f = await fixture(false, async (id, context) => {
    const p = await syncPiGoalWork(id, context);
    expect(p.authorAttempts).toBe(0);
  });
  const admitted = await admitPiGoalWork(f.id, f.context);
  const task = f.ledger.goal(f.goalId).tasks[0];
  expect(task?.workflowProgress).toMatchObject({
    authorAttempts: 1,
    reviewPairsUsed: 1,
    workflowPhase: "verified",
  });
  expect(task?.attempts).toBe(admitted.attempts);
  const again = await syncPiGoalWork(f.id, f.context);
  expect(again).toEqual(task?.workflowProgress);
});

test("source installer rejects a stolen scheduler lease and can recover with fresh authority", async () => {
  const f = await fixture();
  const lease = { owner: "first", until: Date.now() + 20000 };
  f.ledger.transaction("test_lease", Date.now(), (state) => {
    state.lease = lease;
  });
  const output = join(f.root, "guarded-promotion");
  await expect(
    promoteWorkflow(f.workflows, f.coding, f.id, output, {
      lease,
      beforeEffect: () => {
        f.ledger.transaction("steal", Date.now(), (state) => {
          state.lease = { ...lease, owner: "second" };
        });
        return Promise.resolve();
      },
    }),
  ).rejects.toThrow();
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 1;",
  );
  await promoteWorkflow(f.workflows, f.coding, f.id, output, {
    lease: { ...lease, owner: "second" },
  });
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
  const request = JSON.parse(
    await readFile(join(output, "request.json"), "utf8"),
  ) as unknown;
  expect(JSON.stringify(request)).not.toContain('"owner"');
});
