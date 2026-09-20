import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { Ledger } from "../src/ledger.js";
import { Supervisor } from "../src/supervisor.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { createPiGoalWork } from "../src/pi-goal-work.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
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
const task = {
  id: "fix",
  prompt: "Make x equal 2",
  minQuality: 1,
  effort: "low",
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-goal-work-"));
  roots.push(root);
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
  const id = ledger.create({
    objective: "Fix parsing",
    constraints: ["Preserve public API"],
    config: { candidates },
    tasks: [
      {
        ...task,
        acceptance: {
          kind: "workflow",
          specificationSha256: "a".repeat(64),
          reviewTask: { ...task, id: "review" },
          maxReviewPairs: 1,
        },
      },
    ],
    maxAttempts: 1,
  });
  ledger.close();
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({
      available: candidates.map((c) => ({
        provider: c.provider,
        model: c.model,
        efforts: c.efforts,
      })),
      scoped: [],
    }),
  };
  const request = {
    goalId: id,
    taskId: "fix",
    expectedRevision: 1,
    files: [{ path: "x.ts", writable: true }],
  };
  const input = JSON.stringify(request);
  return { root, id, context, input, request };
}
test("creates one Pi workflow bound to a goal and verification contract without dispatch", async () => {
  const f = await fixture();
  const first = await createPiGoalWork(f.input, f.context);
  const second = await createPiGoalWork(f.input, f.context);
  expect(first.id).toBe(second.id);
  expect(first.dispatched).toBe(false);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  try {
    expect(coding.read(first.id).request.context?.requirements).toContain(
      "Preserve public API",
    );
    expect(coding.read(first.id).request.goalOrigin?.goalId).toBe(f.id);
    expect(workflows.read(first.id).verificationContractSha256).toBe(
      "a".repeat(64),
    );
    const calls: string[] = [];
    const result = await workflows.resume(
      first.id,
      coding,
      (prompt, selection) => {
        expect(prompt.prompt).toContain("Preserve public API");
        calls.push(selection.candidate.provider);
        return Promise.resolve(
          selection.candidate.provider === "author"
            ? '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}'
            : '{"verdict":"no_findings","findings":[]}',
        );
      },
    );
    expect(result.phase).toBe("verification_required");
    expect(calls).toEqual(["author", "a", "b"]);
    const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
    try {
      expect(ledger.goal(f.id).status).toBe("active");
    } finally {
      ledger.close();
    }
  } finally {
    coding.close();
    workflows.close();
  }
});
test("text supervision cannot dispatch or complete a workflow task", async () => {
  const f = await fixture();
  const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
  const supervisor = new Supervisor(ledger, () => {
    throw new Error("No text dispatch");
  });
  try {
    expect(await supervisor.tick()).toBe(false);
    expect(ledger.goal(f.id).tasks[0]?.attempts).toBe(0);
  } finally {
    supervisor.close();
    ledger.close();
  }
});
test("goal revision revokes existing work and cannot allocate a new attempt budget", async () => {
  const f = await fixture();
  const created = await createPiGoalWork(f.input, f.context);
  const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
  try {
    const g = ledger.goal(f.id);
    ledger.revise(
      f.id,
      1,
      { ...g.contract, constraints: ["New boundary"] },
      "test user",
    );
  } finally {
    ledger.close();
  }
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  try {
    const worker = () => {
      throw new Error("No stale dispatch");
    };
    const state = await workflows.resume(created.id, coding, worker);
    expect(state.phase).toBe("blocked");
    expect(coding.read(created.id).attempts).toBe(0);
  } finally {
    coding.close();
    workflows.close();
  }
  await expect(
    createPiGoalWork(
      JSON.stringify({ ...f.request, expectedRevision: 2 }),
      f.context,
    ),
  ).rejects.toThrow();
});

test("goal authentication restrictions survive Pi policy intersection for both roles", async () => {
  const f = await fixture();
  const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
  try {
    const g = ledger.goal(f.id);
    ledger.revise(
      f.id,
      1,
      { ...g.contract, config: { ...g.contract.config, readOnlyAuth: true } },
      "test user",
    );
  } finally {
    ledger.close();
  }
  const result = await createPiGoalWork(
    JSON.stringify({ ...f.request, expectedRevision: 2 }),
    f.context,
  );
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  try {
    expect(coding.read(result.id).config.readOnlyAuth).toBe(true);
    expect(workflows.read(result.id).review.config.readOnlyAuth).toBe(true);
  } finally {
    coding.close();
    workflows.close();
  }
});
test("rejects insufficient goal-permitted independent reviewers before creating work", async () => {
  const f = await fixture();
  const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
  try {
    const g = ledger.goal(f.id);
    ledger.revise(
      f.id,
      1,
      {
        ...g.contract,
        config: {
          ...g.contract.config,
          candidates: g.contract.config.candidates.filter(
            (c) => c.provider !== "b",
          ),
        },
      },
      "test user",
    );
  } finally {
    ledger.close();
  }
  await expect(
    createPiGoalWork(
      JSON.stringify({ ...f.request, expectedRevision: 2 }),
      f.context,
    ),
  ).rejects.toThrow();
  const { existsSync } = await import("node:fs");
  expect(existsSync(join(f.root, ".harness/coding.sqlite"))).toBe(false);
});

test("generic creation cannot duplicate a goal budget and workflow creation cannot weaken its contract", async () => {
  const f = await fixture();
  const created = await createPiGoalWork(f.input, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const other = new CodingWorkflows(join(f.root, ".harness/other.sqlite"));
  try {
    const snapshot = coding.read(created.id);
    expect(() =>
      coding.create(snapshot.request, snapshot.config, {
        "x.ts": "export const x = 1;",
      }),
    ).toThrow();
    expect(() => {
      other.create(
        created.id,
        coding,
        { task: { ...task, id: "different-review" }, config: { candidates } },
        2,
      );
    }).toThrow();
  } finally {
    coding.close();
    other.close();
  }
});
test("identical verification receipts cannot bypass goal cancellation", async () => {
  const f = await fixture();
  const created = await createPiGoalWork(f.input, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(f.root, ".harness/workflows.sqlite"),
  );
  try {
    const reviewed = await workflows.resume(
      created.id,
      coding,
      (_task, selection) =>
        Promise.resolve(
          selection.candidate.provider === "author"
            ? '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}'
            : '{"verdict":"no_findings","findings":[]}',
        ),
    );
    const proof = {
      checkpointSha256: reviewed.reviewedCheckpointSha256,
      specificationSha256: "a".repeat(64),
      reportSha256: "b".repeat(64),
      accepted: true,
      outcome: "executed",
      directory: join(f.root, "controlled-proof"),
      feedback: "",
    };
    workflows.recordVerification(created.id, coding, proof);
    const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
    try {
      ledger.cancel(f.id, 1, "test user");
    } finally {
      ledger.close();
    }
    expect(() =>
      workflows.recordVerification(created.id, coding, proof),
    ).toThrow();
  } finally {
    coding.close();
    workflows.close();
  }
});

test("promotion references reject changed goal context and preserve stable retry identity", async () => {
  const f = await fixture();
  const created = await createPiGoalWork(f.input, f.context);
  const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
  const { goalPromotionReference } = await import("../src/goal-work.js");
  try {
    const request = coding.read(created.id).request;
    const reference = goalPromotionReference(request);
    expect(reference?.expected.id).toBe(f.id);
    expect(reference).toEqual(goalPromotionReference(request));
    const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
    try {
      ledger.cancel(f.id, 1, "test user");
    } finally {
      ledger.close();
    }
    expect(() => goalPromotionReference(request)).toThrow();
  } finally {
    coding.close();
  }
});

test.each(["author", "a"])(
  "cancellation during %s discards stale output and stops further dispatch",
  async (cancelAt) => {
    const f = await fixture();
    const created = await createPiGoalWork(f.input, f.context);
    const coding = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
    const workflows = new CodingWorkflows(
      join(f.root, ".harness/workflows.sqlite"),
    );
    const calls: string[] = [];
    try {
      const last = await workflows.resume(
        created.id,
        coding,
        (_task, selection) => {
          const provider = selection.candidate.provider;
          calls.push(provider);
          if (provider === cancelAt) {
            const ledger = new Ledger(join(f.root, ".harness/ledger.sqlite"));
            try {
              ledger.cancel(f.id, 1, "test user");
            } finally {
              ledger.close();
            }
          }
          return Promise.resolve(
            provider === "author"
              ? '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}'
              : '{"verdict":"no_findings","findings":[]}',
          );
        },
      );
      expect(last.phase).toBe("blocked");
      expect(calls).toEqual(
        cancelAt === "author" ? ["author"] : ["author", "a"],
      );
      if (cancelAt === "author")
        expect(coding.read(created.id).files["x.ts"]?.current).toBe(
          "export const x = 1;",
        );
    } finally {
      coding.close();
      workflows.close();
    }
  },
);
test("Pi command exposes the goal handoff without starting its executor", async () => {
  const f = await fixture();
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const messages: { message: string; level: string | undefined }[] = [];
  await relentlessCommand(
    `goal-work ${f.input}`,
    {
      ...f.context,
      ui: {
        notify: (message, level) => {
          messages.push({ message, level });
        },
      },
    },
    () => {
      throw new Error("Creation cannot dispatch");
    },
  );
  expect(messages[0]?.level).toBe("info");
  expect(messages[0]?.message).toContain('"dispatched": false');
});
