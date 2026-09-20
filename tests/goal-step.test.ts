import { expect, test, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Ledger } from "../src/ledger.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { stepPiGoal } from "../src/pi-goal-step.js";
import {
  canonicalDigest,
  verificationManifestSchema,
} from "../src/verification-assessment.js";
import { Failure } from "../src/failures.js";
import { Supervisor } from "../src/supervisor.js";
const roots: string[] = [];
const handles: { close(): void }[] = [];
afterEach(async () => {
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

async function fixture(single = false, integrate = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "goal-step-")));
  roots.push(root);
  await mkdir(join(root, ".pi"));
  await writeFile(join(root, "x.ts"), "export const x = 1;");
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
  const execution = { package: spec, acceptance };
  await writeFile(join(root, "verification.json"), JSON.stringify(execution));
  const ledger = new Ledger(join(root, ".harness/ledger.sqlite"));
  handles.push(ledger);
  const task = {
    id: "first",
    prompt: "Fix x",
    minQuality: 1,
    effort: "low",
    acceptance: {
      kind: "workflow",
      specificationSha256: canonicalDigest(execution),
      reviewTask: { id: "r", prompt: "Review", minQuality: 1, effort: "low" },
      maxReviewPairs: 2,
      work: {
        ...(integrate ? { integration: "verified" } : {}),
        files: [{ path: "x.ts", writable: true }],
        verificationFile: "verification.json",
      },
    },
  };
  const goalId = ledger.create({
    objective: "Fix project",
    constraints: [],
    config: { candidates },
    maxAttempts: 2,
    tasks: single
      ? [task]
      : [
          task,
          { ...task, id: "second", dependsOn: ["first"] },
          { ...task, id: "independent" },
        ],
  });
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({ available: candidates, scoped: [] }),
  };
  const calls: string[] = [];
  const advance: NonNullable<
    Parameters<typeof stepPiGoal>[2]
  >["advance"] = async (id, options) => {
    const coding = new CodingJournal(join(root, ".harness/coding.sqlite")),
      workflows = new CodingWorkflows(join(root, ".harness/workflows.sqlite"));
    try {
      const result = await workflows.resume(
        id,
        coding,
        async (_t, r) => {
          await options.beforeDispatch?.(
            r.candidate.provider === "author" ? "coder" : "reviewer",
            r,
          );
          calls.push(r.candidate.provider);
          const output =
            r.candidate.provider === "author"
              ? '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}'
              : '{"verdict":"no_findings","findings":[]}';
          await options.afterDispatch?.();
          return output;
        },
        options.signal,
        options.commitFence,
      );
      roots.push(...result.artifactDirectories);
      return result;
    } finally {
      workflows.close();
      coding.close();
    }
  };
  return {
    root,
    goalId,
    ledger,
    context,
    calls,
    drivers: { advance, ...verificationDrivers() },
  };
}
test("goal steps create, review, verify and admit one eligible task without premature dependencies", async () => {
  const f = await fixture();
  const a = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(a).toMatchObject({
    taskId: "first",
    action: "workflow",
    phase: "verification_required",
  });
  expect(f.calls).toEqual(["author", "a", "b"]);
  const b = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(b).toMatchObject({
    taskId: "first",
    action: "verification",
    phase: "verified",
  });
  const c = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(c).toMatchObject({ taskId: "first", action: "admitted" });
  expect(f.ledger.goal(f.goalId).tasks[0]?.status).toBe("completed");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 1;",
  );
  const d = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(d.taskId).toBe("independent");
  expect(
    d.skipped.some(
      (s) => s.id === "second" && s.reason === "dependency_sources_not_applied",
    ),
  ).toBe(true);
});
test("a cooled task does not starve independent work or spend another attempt", async () => {
  const f = await fixture();
  const quota: NonNullable<
    Parameters<typeof stepPiGoal>[2]
  >["advance"] = async (id) => {
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
      workflows = new CodingWorkflows(
        join(f.root, ".harness/workflows.sqlite"),
      );
    try {
      return await workflows.resume(id, coding, () =>
        Promise.reject(new Failure("quota", 60000)),
      );
    } finally {
      workflows.close();
      coding.close();
    }
  };
  await stepPiGoal(f.goalId, f.context, { advance: quota });
  const result = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(result.taskId).toBe("independent");
  expect(
    result.skipped.some(
      (s) => s.id === "first" && s.reason === "waiting_retry",
    ),
  ).toBe(true);
});
test("shared supervisor lease blocks goal steps and stolen leases prevent late success", async () => {
  const f = await fixture();
  const supervisor = new Supervisor(f.ledger, () => {
    throw Error("No text dispatch");
  });
  try {
    await supervisor.tick();
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  } finally {
    supervisor.close();
  }
  const advance: NonNullable<
    Parameters<typeof stepPiGoal>[2]
  >["advance"] = async (_id, options) => {
    f.ledger.transaction("steal", Date.now(), (s) => {
      s.lease = { owner: "other", until: Date.now() + 60000 };
    });
    await options.beforeVerification?.();
    throw Error("Should not reach effect");
  };
  await expect(stepPiGoal(f.goalId, f.context, { advance })).rejects.toThrow();
  expect(f.ledger.read().lease?.owner).toBe("other");
});
test("invalid verification contracts fail before creation or inference", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "verification.json"),
    JSON.stringify({
      package: spec,
      acceptance: { kind: "test_process_exit", expected: 1 },
    }),
  );
  await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.ledger.read().lease).toBeNull();
});

test("lease loss during a real workflow call discards the worker result", async () => {
  const f = await fixture();
  const { vi } = await import("vitest");
  const worker = await import("../src/process-worker.js");
  const spy = vi.spyOn(worker, "processWorker").mockImplementation(() => {
    f.ledger.transaction("steal", Date.now(), (s) => {
      s.lease = { owner: "other", until: Date.now() + 60000 };
    });
    return Promise.resolve(
      '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}',
    );
  });
  try {
    await expect(stepPiGoal(f.goalId, f.context)).rejects.toThrow();
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(f.root, ".harness/coding.sqlite"), {
      readOnly: true,
    });
    try {
      const row = db.prepare("SELECT id FROM runs").get();
      if (typeof row?.["id"] !== "string") throw Error("fixture");
      const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
      try {
        expect(coding.read(row["id"]).files["x.ts"]?.current).toBe(
          "export const x = 1;",
        );
      } finally {
        coding.close();
      }
    } finally {
      db.close();
    }
  } finally {
    spy.mockRestore();
  }
});
test("declared goal files cannot be replaced through manual goal creation", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "other.ts"), "export const y=1;");
  const { createPiGoalWork } = await import("../src/pi-goal-work.js");
  await expect(
    createPiGoalWork(
      JSON.stringify({
        goalId: f.goalId,
        taskId: "first",
        expectedRevision: 1,
        files: [{ path: "other.ts", writable: true }],
      }),
      f.context,
    ),
  ).rejects.toThrow();
});
test("Pi exposes a bounded goal step and inactive goals do not start its executor", async () => {
  const f = await fixture();
  f.ledger.cancel(f.goalId, 1, "user cancellation");
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: string[] = [];
  await relentlessCommand(
    `goal-step ${f.goalId}`,
    { ...f.context, ui: { notify: (m) => messages.push(m) } },
    () => {
      throw Error("No dispatch");
    },
  );
  expect(messages[0]).toContain('"phase": "cancelled"');
});

test("lease theft during admission inspection cannot commit a goal receipt", async () => {
  const f = await fixture();
  await stepPiGoal(f.goalId, f.context, f.drivers);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  const { vi } = await import("vitest");
  const verification = await import("../src/workflow-verification.js");
  const original = verification.inspectVerification;
  const spy = vi
    .spyOn(verification, "inspectVerification")
    .mockImplementation(async (...args) => {
      const proof = await original(...args);
      f.ledger.transaction("steal", Date.now(), (s) => {
        s.lease = { owner: "other", until: Date.now() + 60000 };
      });
      return proof;
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowAdmission).toBeUndefined();
    expect(f.ledger.read().lease?.owner).toBe("other");
  } finally {
    spy.mockRestore();
  }
});

test("lease theft at verification receipt publication cannot mark the workflow verified", async () => {
  const f = await fixture();
  await stepPiGoal(f.goalId, f.context, f.drivers);
  const { vi } = await import("vitest");
  // Retain the concrete receipt method to inject lease theft immediately before its commit fence.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = CodingWorkflows.prototype.recordVerification;
  const spy = vi
    .spyOn(CodingWorkflows.prototype, "recordVerification")
    .mockImplementation(function (this: CodingWorkflows, ...args) {
      f.ledger.transaction("steal", Date.now(), (s) => {
        s.lease = { owner: "other", until: Date.now() + 60000 };
      });
      return original.apply(this, args);
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
    const p = f.ledger.goal(f.goalId).tasks[0]?.workflowProgress;
    if (!p) throw Error("missing progress");
    const workflows = new CodingWorkflows(
      join(f.root, ".harness/workflows.sqlite"),
    );
    try {
      expect(workflows.read(p.codingId).phase).toBe("verification_required");
    } finally {
      workflows.close();
    }
  } finally {
    spy.mockRestore();
  }
});

test("saved verification receipt recovery still checks lease ownership and never reruns VM", async () => {
  const f = await fixture();
  await stepPiGoal(f.goalId, f.context, f.drivers);
  const { vi } = await import("vitest");
  // Inject ownership loss at the public receipt boundary while preserving the real commit implementation.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = CodingWorkflows.prototype.recordVerification;
  const spy = vi
    .spyOn(CodingWorkflows.prototype, "recordVerification")
    .mockImplementation(function (this: CodingWorkflows, ...args) {
      f.ledger.transaction("steal", Date.now(), (s) => {
        s.lease = { owner: "other", until: Date.now() + 60000 };
      });
      return original.apply(this, args);
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
    f.ledger.transaction("test_release", Date.now(), (s) => {
      s.lease = null;
    });
    const noReplay = {
      pack: () => {
        throw Error("No replay");
      },
      run: () => {
        throw Error("No replay");
      },
    };
    await expect(stepPiGoal(f.goalId, f.context, noReplay)).rejects.toThrow();
    expect(f.ledger.goal(f.goalId).tasks[0]?.workflowAdmission).toBeUndefined();
    spy.mockRestore();
    f.ledger.transaction("test_release", Date.now(), (s) => {
      s.lease = null;
    });
    expect(await stepPiGoal(f.goalId, f.context, noReplay)).toMatchObject({
      action: "verification",
      phase: "verified",
    });
  } finally {
    spy.mockRestore();
  }
});

test("lease theft during coding validation cannot publish candidate source", async () => {
  const f = await fixture();
  const { vi } = await import("vitest");
  const worker = await import("../src/process-worker.js"),
    checks = await import("../src/coding-worker.js");
  const original = checks.checkFiles;
  const workerSpy = vi
    .spyOn(worker, "processWorker")
    .mockResolvedValue(
      '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}',
    );
  let validations = 0;
  const checkSpy = vi
    .spyOn(checks, "checkFiles")
    .mockImplementation(async (...args) => {
      const result = await original(...args);
      if (++validations === 2)
        f.ledger.transaction("steal", Date.now(), (s) => {
          s.lease = { owner: "other", until: Date.now() + 60000 };
        });
      return result;
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context)).rejects.toThrow();
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(f.root, ".harness/coding.sqlite"), {
      readOnly: true,
    });
    try {
      const row = db.prepare("SELECT id FROM runs").get();
      if (typeof row?.["id"] !== "string") throw Error("fixture");
      const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
      try {
        expect(coding.read(row["id"]).files["x.ts"]?.current).toBe(
          "export const x = 1;",
        );
      } finally {
        coding.close();
      }
    } finally {
      db.close();
    }
  } finally {
    workerSpy.mockRestore();
    checkSpy.mockRestore();
  }
});

test("lease loss after completed reviews leaves an ambiguous reserved pair, not accepted review", async () => {
  const f = await fixture();
  const { vi } = await import("vitest");
  const review = await import("../src/coding-review.js");
  const original = review.reviewCoding;
  const spy = vi
    .spyOn(review, "reviewCoding")
    .mockImplementation(async (...args) => {
      const report = await original(...args);
      f.ledger.transaction("steal", Date.now(), (s) => {
        s.lease = { owner: "other", until: Date.now() + 60000 };
      });
      return report;
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(f.root, ".harness/coding.sqlite"), {
      readOnly: true,
    });
    try {
      const row = db.prepare("SELECT id FROM runs").get();
      if (typeof row?.["id"] !== "string") throw Error("fixture");
      const workflows = new CodingWorkflows(
        join(f.root, ".harness/workflows.sqlite"),
      );
      try {
        expect(workflows.read(row["id"])).toMatchObject({
          phase: "reviewing",
          reviewPairsUsed: 1,
          reports: [],
        });
      } finally {
        workflows.close();
      }
    } finally {
      db.close();
    }
  } finally {
    spy.mockRestore();
  }
});

test("goal run completes a declared workflow without manually stepping each phase", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const f = await fixture(true);
  const result = await runPiGoal(f.goalId, f.context, {
    step: (id, context) => stepPiGoal(id, context, f.drivers),
    wait: () => {
      throw Error("No wait needed");
    },
  });
  expect(result.reason).toBe("completed");
  expect(result.actions).toBe(3);
  expect(f.calls).toEqual(["author", "a", "b"]);
  expect(f.ledger.goal(f.goalId).status).toBe("completed");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 1;",
  );
});

test("goal run waits without inference and resumes the existing quota-bound workflow", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const { vi } = await import("vitest");
  const f = await fixture(true);
  let now = Date.now(),
    fail = true;
  const waits: number[] = [];
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const quota: NonNullable<
    Parameters<typeof stepPiGoal>[2]
  >["advance"] = async (id) => {
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite")),
      workflows = new CodingWorkflows(
        join(f.root, ".harness/workflows.sqlite"),
      );
    try {
      return await workflows.resume(id, coding, () =>
        Promise.reject(new Failure("quota", 4000)),
      );
    } finally {
      coding.close();
      workflows.close();
    }
  };
  try {
    const result = await runPiGoal(f.goalId, f.context, {
      step: (id, context) => {
        const drivers = fail ? { advance: quota } : f.drivers;
        fail = false;
        return stepPiGoal(id, context, drivers);
      },
      wait: (ms) => {
        waits.push(ms);
        now += ms;
        return Promise.resolve();
      },
    });
    expect(result.reason).toBe("completed");
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((ms) => ms > 0 && ms <= 1000)).toBe(true);
    expect(f.ledger.goal(f.goalId).tasks[0]?.attempts).toBe(2);
    expect(f.calls).toEqual(["author", "a", "b"]);
  } finally {
    clock.mockRestore();
  }
});

test("goal run stops at unapplied dependencies and never polls policy blocks", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const f = await fixture();
  const result = await runPiGoal(f.goalId, f.context, {
    step: (id, context) => stepPiGoal(id, context, f.drivers),
    wait: () => {
      throw Error("No timed wait");
    },
  });
  expect(result.reason).toBe("needs_attention");
  expect(
    result.last?.skipped.some(
      (s) => s.reason === "dependency_sources_not_applied",
    ),
  ).toBe(true);
  expect(f.ledger.goal(f.goalId).status).toBe("active");
});

test("goal run rejects unattended Personal use before creation or model dispatch", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const f = await fixture();
  const { loadPiProjectConfig } = await import("../src/pi-project-config.js");
  const project = await loadPiProjectConfig(f.root, true);
  if (!project) throw Error("fixture");
  const settings = { relentless: project };
  settings.relentless.routing.candidates.push({
    name: "personal",
    provider: "qwen-token-plan-individual",
    model: "qwen",
    billing: "subscription",
    enabled: true,
    quality: 1,
    preference: 1,
    efforts: ["low"],
  });
  await writeFile(join(f.root, ".pi/settings.json"), JSON.stringify(settings));
  await expect(
    runPiGoal(f.goalId, f.context, {
      step: () => {
        throw Error("Unexpected step");
      },
    }),
  ).rejects.toThrow("Personal");
  expect(f.calls).toHaveLength(0);
});

test("goal run observes cancellation and revisions while waiting without another step", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  for (const mode of ["cancel", "revise"]) {
    const f = await fixture();
    let steps = 0;
    const result = await runPiGoal(f.goalId, f.context, {
      step: () => {
        steps++;
        return Promise.resolve({
          goalId: f.goalId,
          taskId: null,
          codingId: null,
          action: "idle",
          phase: "waiting",
          skipped: [
            {
              id: "first",
              reason: "waiting_retry",
              retryAt: Date.now() + 60000,
            },
          ],
        });
      },
      wait: () => {
        const goal = f.ledger.goal(f.goalId);
        if (mode === "cancel") f.ledger.cancel(f.goalId, goal.revision, "test");
        else
          f.ledger.revise(
            f.goalId,
            goal.revision,
            { ...goal.contract, objective: "Updated" },
            "test",
          );
        return Promise.resolve();
      },
    });
    expect(result.reason).toBe(
      mode === "cancel" ? "cancelled" : "goal_changed",
    );
    expect(steps).toBe(1);
  }
});

test("Pi goal-run reports a cancelled goal without dispatch", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const { vi } = await import("vitest");
  const f = await fixture();
  f.ledger.cancel(f.goalId, 1, "test");
  const notify = vi.fn();
  await relentlessCommand("goal-run " + f.goalId, {
    ...f.context,
    ui: { notify },
  });
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('"reason": "cancelled"'),
    "info",
  );
  expect(f.calls).toHaveLength(0);
});

test("goal run stops if an action repeats without authoritative journal progress", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const f = await fixture();
  const first = await stepPiGoal(f.goalId, f.context, f.drivers);
  let steps = 0;
  const result = await runPiGoal(f.goalId, f.context, {
    step: () => {
      steps++;
      return Promise.resolve(first);
    },
  });
  expect(result.reason).toBe("no_progress");
  expect(steps).toBe(2);
  expect(f.calls).toEqual(["author", "a", "b"]);
});

test("a retry becoming due while the step returns resumes immediately instead of requesting input", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const { vi } = await import("vitest");
  const f = await fixture();
  let now = Date.now(),
    steps = 0;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const result = await runPiGoal(f.goalId, f.context, {
      step: () => {
        steps++;
        const retryAt = now + 10;
        now += 1000;
        return Promise.resolve({
          goalId: f.goalId,
          taskId: null,
          codingId: null,
          action: "idle",
          phase: steps === 1 ? "waiting" : "completed",
          skipped:
            steps === 1
              ? [{ id: "first", reason: "waiting_retry", retryAt }]
              : [],
        });
      },
      wait: () => {
        throw Error("Already due");
      },
    });
    expect(result.reason).toBe("completed");
    expect(steps).toBe(2);
  } finally {
    clock.mockRestore();
  }
});

test("opted-in goal installs reviewed source before completing and unlocks dependent coding", async () => {
  const f = await fixture(false, true);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  expect((await stepPiGoal(f.goalId, f.context, f.drivers)).action).toBe(
    "admitted",
  );
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
  const task = f.ledger.goal(f.goalId).tasks[0];
  expect(task?.workflowAdmission?.installation).toBeDefined();
  expect(task?.output).toContain('"sourceApplied":true');
  const next = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(next.taskId).toBe("second");
});

test("installed-source contracts cannot be admitted as artifact-only completion", async () => {
  const { admitPiGoalWork } = await import("../src/pi-goal-admission.js");
  const f = await fixture(true, true);
  const a = await stepPiGoal(f.goalId, f.context, f.drivers);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  if (!a.codingId) throw Error("fixture");
  await expect(admitPiGoalWork(a.codingId, f.context)).rejects.toThrow();
  expect(f.ledger.goal(f.goalId).status).toBe("active");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 1;",
  );
});

test("a developer edit after installation prevents goal acceptance and is retained", async () => {
  const { vi } = await import("vitest");
  const promotion = await import("../src/workflow-promotion.js");
  const original = promotion.promoteWorkflow;
  const f = await fixture(true, true);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  const spy = vi
    .spyOn(promotion, "promoteWorkflow")
    .mockImplementation(async (...args) => {
      const result = await original(...args);
      await writeFile(join(f.root, "x.ts"), "developer edit");
      return result;
    });
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  expect(f.ledger.goal(f.goalId).status).toBe("active");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe("developer edit");
});

test("opted-in foreground run installs source and repeated admission is idempotent", async () => {
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const { admitPiGoalWork } = await import("../src/pi-goal-admission.js");
  const f = await fixture(true, true);
  const result = await runPiGoal(f.goalId, f.context, {
    step: (id, context) => stepPiGoal(id, context, f.drivers),
  });
  expect(result.reason).toBe("completed");
  expect(f.calls).toEqual(["author", "a", "b"]);
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
  const before = f.ledger.goal(f.goalId);
  const receipt = before.tasks[0]?.workflowAdmission;
  if (!receipt) throw Error("Missing admission");
  expect(receipt.installation).toBeDefined();
  await admitPiGoalWork(receipt.codingId, f.context);
  expect(f.ledger.goal(f.goalId)).toEqual(before);
});

test("retry after installation before admission reuses source transaction without model work", async () => {
  const { vi } = await import("vitest");
  const admission = await import("../src/pi-goal-admission.js");
  const f = await fixture(true, true);
  const first = await stepPiGoal(f.goalId, f.context, f.drivers);
  await stepPiGoal(f.goalId, f.context, f.drivers);
  const spy = vi
    .spyOn(admission, "admitPiGoalWork")
    .mockRejectedValueOnce(Error("interrupted admission"));
  try {
    await expect(stepPiGoal(f.goalId, f.context, f.drivers)).rejects.toThrow(
      "interrupted admission",
    );
  } finally {
    spy.mockRestore();
  }
  expect(f.ledger.goal(f.goalId).status).toBe("active");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
  const calls = [...f.calls];
  const recovered = await stepPiGoal(f.goalId, f.context, f.drivers);
  expect(recovered.action).toBe("admitted");
  expect(recovered.codingId).toBe(first.codingId);
  expect(f.calls).toEqual(calls);
  expect(f.ledger.goal(f.goalId).status).toBe("completed");
});

test("session resume uses exact opt-in and loses authority when settings change", async () => {
  const { resumePiGoal } = await import("../src/pi-goal-resume.js");
  const f = await fixture(true);
  const path = join(f.root, ".pi/settings.json");
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  const settings = z
    .object({ relentless: z.record(z.string(), z.unknown()) })
    .parse(raw);
  settings.relentless["resumeGoal"] = { id: f.goalId, revision: 1 };
  await writeFile(path, JSON.stringify(settings));
  let called = 0;
  await resumePiGoal(f.context, async (id, context) => {
    called++;
    expect(id).toBe(f.goalId);
    expect(context.isProjectTrusted()).toBe(true);
    delete settings.relentless["resumeGoal"];
    await writeFile(path, JSON.stringify(settings));
    expect(context.isProjectTrusted()).toBe(false);
    return { goalId: id, reason: "trust_lost", actions: 0, last: null };
  });
  expect(called).toBe(1);
  expect(
    await resumePiGoal(f.context, () => {
      throw Error("No opt-in");
    }),
  ).toBeNull();
});

test("session resume rejects changed goal revision without dispatch", async () => {
  const { resumePiGoal } = await import("../src/pi-goal-resume.js");
  const f = await fixture(true);
  const path = join(f.root, ".pi/settings.json");
  const settings = z
    .object({ relentless: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(await readFile(path, "utf8")) as unknown);
  settings.relentless["resumeGoal"] = { id: f.goalId, revision: 2 };
  await writeFile(path, JSON.stringify(settings));
  expect(
    await resumePiGoal(f.context, () => {
      throw Error("Wrong revision");
    }),
  ).toEqual({
    goalId: f.goalId,
    reason: "goal_changed",
    actions: 0,
    last: null,
  });
});

test("revoking restart during model validation prevents candidate publication", async () => {
  const { resumePiGoal } = await import("../src/pi-goal-resume.js");
  const { vi } = await import("vitest");
  const f = await fixture(true);
  const path = join(f.root, ".pi/settings.json");
  const originalSettings = await readFile(path, "utf8");
  const settings = z
    .object({ relentless: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(originalSettings) as unknown);
  settings.relentless["resumeGoal"] = { id: f.goalId, revision: 1 };
  await writeFile(path, JSON.stringify(settings));
  const worker = await import("../src/process-worker.js");
  const checks = await import("../src/coding-worker.js");
  const original = checks.checkFiles;
  const workerSpy = vi
    .spyOn(worker, "processWorker")
    .mockResolvedValue(
      '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}',
    );
  let validations = 0;
  const checkSpy = vi
    .spyOn(checks, "checkFiles")
    .mockImplementation(async (...args) => {
      const result = await original(...args);
      if (++validations === 2) await writeFile(path, originalSettings);
      return result;
    });
  try {
    await expect(resumePiGoal(f.context)).rejects.toThrow();
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(f.root, ".harness/coding.sqlite"), {
      readOnly: true,
    });
    try {
      const row = db.prepare("SELECT id FROM runs").get();
      if (typeof row?.["id"] !== "string") throw Error("fixture");
      const journal = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
      try {
        expect(journal.read(row["id"]).files["x.ts"]?.current).toBe(
          "export const x = 1;",
        );
      } finally {
        journal.close();
      }
    } finally {
      db.close();
    }
    expect(f.ledger.goal(f.goalId).status).toBe("active");
  } finally {
    workerSpy.mockRestore();
    checkSpy.mockRestore();
  }
});

test("removing resume opt-in during a retry wait stops without a second step", async () => {
  const { resumePiGoal } = await import("../src/pi-goal-resume.js");
  const { runPiGoal } = await import("../src/pi-goal-run.js");
  const f = await fixture(true);
  const path = join(f.root, ".pi/settings.json");
  const source = await readFile(path, "utf8");
  const settings = z
    .object({ relentless: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(source) as unknown);
  settings.relentless["resumeGoal"] = { id: f.goalId, revision: 1 };
  await writeFile(path, JSON.stringify(settings));
  let steps = 0;
  const result = await resumePiGoal(f.context, (id, context) =>
    runPiGoal(id, context, {
      step: () => {
        steps++;
        return Promise.resolve({
          goalId: id,
          action: "idle",
          phase: "waiting",
          taskId: null,
          codingId: null,
          skipped: [
            {
              id: "first",
              reason: "waiting_retry",
              retryAt: Date.now() + 60000,
            },
          ],
        });
      },
      wait: async () => {
        await writeFile(path, source);
      },
    }),
  );
  expect(result?.reason).toBe("trust_lost");
  expect(steps).toBe(1);
  expect(f.calls).toEqual([]);
});
