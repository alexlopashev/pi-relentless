import { Failure } from "../src/failures.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
const roots: string[] = [];
const handles: { close(): void }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const h of handles) h.close();
  for (const p of roots) rmSync(p, { recursive: true, force: true });
  handles.length = 0;
  roots.length = 0;
});
const c = (provider: string) => ({
  name: provider,
  provider,
  model: provider,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
});
function fixture(reviewProviders = ["a", "b"], maxReviewPairs = 2) {
  const root = mkdtempSync(join(tmpdir(), "clanker-workflow-"));
  roots.push(root);
  const coding = new CodingJournal(join(root, "coding.sqlite"));
  handles.push(coding);
  const task = {
    id: "fix",
    prompt: "Export x equal to 2",
    minQuality: 1,
    effort: "low",
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true, requiredExports: ["x"] }],
      maxAttempts: 3,
    },
    { candidates: [c("author")] },
    { "x.ts": "export const x = ;" },
  );
  const path = join(root, "workflows.sqlite");
  const workflows = new CodingWorkflows(path);
  handles.push(workflows);
  workflows.create(
    id,
    coding,
    {
      task: { ...task, id: "review" },
      config: { candidates: reviewProviders.map(c) },
    },
    maxReviewPairs,
  );
  return { root, coding, id, workflows, path };
}
test("one resume drives coding, two-provider review, bounded repair and exact verification handoff", async () => {
  const { coding, id, workflows, path } = fixture();
  let writes = 0;
  let reviews = 0;
  const result = await workflows.resume(id, coding, (_task, selection) => {
    if (selection.candidate.provider === "author") {
      writes++;
      return Promise.resolve(
        JSON.stringify({
          edits: [
            { path: "x.ts", content: `export const x = ${String(writes)};` },
          ],
        }),
      );
    }
    reviews++;
    return Promise.resolve(
      JSON.stringify(
        reviews <= 2
          ? {
              verdict: "changes_requested",
              findings: [{ path: "x.ts", line: 1, message: "x must equal 2" }],
            }
          : { verdict: "no_findings", findings: [] },
      ),
    );
  });
  roots.push(...result.artifactDirectories);
  expect(result.phase).toBe("verification_required");
  expect(writes).toBe(2);
  expect(reviews).toBe(4);
  expect(result.reviewPairsUsed).toBe(2);
  expect(coding.read(id).attempts).toBe(2);
  const recovered = new CodingWorkflows(path);
  handles.push(recovered);
  expect(
    (
      await recovered.resume(id, coding, () => {
        throw Error("Terminal workflow must not infer");
      })
    ).phase,
  ).toBe("verification_required");
});
test("external instruction changes block workflow rather than restoring old constraints", async () => {
  const { coding, id, workflows } = fixture();
  coding.revisePrompt(id, 1, "New user requirements", 100);
  let calls = 0;
  const state = await workflows.resume(id, coding, () => {
    calls++;
    return Promise.resolve("");
  });
  expect(state.phase).toBe("blocked");
  expect(calls).toBe(0);
  expect(coding.read(id).request.task.prompt).toBe("New user requirements");
});
test("review budget cannot reset on reopen or repeated create", async () => {
  const { coding, id, workflows } = fixture();
  await expect(
    workflows.resume(id, coding, () => Promise.resolve("invalid")),
  ).resolves.toMatchObject({ phase: "blocked" });
  expect(() => {
    workflows.create(
      id,
      coding,
      {
        task: { id: "x", prompt: "x", minQuality: 1, effort: "low" },
        config: { candidates: [c("a"), c("b")] },
      },
      2,
    );
  }).toThrow();
});

test("coding quota waits survive reopen without extra attempts or review spending", async () => {
  const { Failure } = await import("../src/failures.js");
  const { coding, id, workflows, path } = fixture();
  let calls = 0;
  const waiting = await workflows.resume(id, coding, () => {
    calls++;
    return Promise.reject(new Failure("quota", 90000));
  });
  roots.push(...waiting.artifactDirectories);
  expect(waiting.phase).toBe("coding");
  expect(waiting.retryAt).toBeGreaterThan(Date.now());
  const reopened = new CodingWorkflows(path);
  handles.push(reopened);
  const again = await reopened.resume(id, coding, () => {
    calls++;
    return Promise.resolve("");
  });
  expect(calls).toBe(1);
  expect(again.reviewPairsUsed).toBe(0);
  expect(coding.read(id).attempts).toBe(1);
});
test("verification handoff becomes stale when user revises the candidate", async () => {
  const { coding, id, workflows } = fixture();
  const done = await workflows.resume(id, coding, (_task, selection) =>
    Promise.resolve(
      selection.candidate.provider === "author"
        ? JSON.stringify({
            edits: [{ path: "x.ts", content: "export const x = 2;" }],
          })
        : '{"verdict":"no_findings","findings":[]}',
    ),
  );
  roots.push(...done.artifactDirectories);
  expect(done.phase).toBe("verification_required");
  coding.revisePrompt(id, 1, "User changed goal", Date.now());
  const stale = await workflows.resume(id, coding, () => {
    throw Error("No inference");
  });
  expect(stale.phase).toBe("blocked");
  expect(stale.reason).toBe("stale");
});

test("existing missing workflow schema fails closed instead of resetting budgets", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const root = mkdtempSync(join(tmpdir(), "workflow-missing-schema-"));
  roots.push(root);
  const path = join(root, "workflows.sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE unrelated(id TEXT)");
  db.close();
  expect(() => new CodingWorkflows(path)).toThrow();
});
test("repair intent reconciles a crash after coding revision without replaying the update", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { coding, id, workflows, path } = fixture();
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TRIGGER fail_repair_commit BEFORE UPDATE OF body ON workflows WHEN json_extract(OLD.body,'$.phase')='repair' AND json_extract(NEW.body,'$.phase')='coding' BEGIN SELECT RAISE(ABORT,'fault fixture'); END;",
  );
  let writes = 0;
  let reviews = 0;
  const worker = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) => {
    if (selection.candidate.provider === "author") {
      writes++;
      return Promise.resolve(
        JSON.stringify({
          edits: [
            { path: "x.ts", content: `export const x = ${String(writes)};` },
          ],
        }),
      );
    }
    reviews++;
    return Promise.resolve(
      JSON.stringify(
        reviews <= 2
          ? {
              verdict: "changes_requested",
              findings: [{ path: "x.ts", line: 1, message: "Use 2" }],
            }
          : { verdict: "no_findings", findings: [] },
      ),
    );
  };
  await expect(workflows.resume(id, coding, worker)).rejects.toThrow(
    "fault fixture",
  );
  expect(coding.read(id).revision).toBe(2);
  expect(workflows.read(id).phase).toBe("repair");
  db.exec("DROP TRIGGER fail_repair_commit");
  db.close();
  const reopened = new CodingWorkflows(path);
  handles.push(reopened);
  const done = await reopened.resume(id, coding, worker);
  roots.push(...done.artifactDirectories);
  expect(done.phase).toBe("verification_required");
  expect(coding.read(id).revision).toBe(2);
  expect(coding.read(id).attempts).toBe(2);
  expect(done.reviewPairsUsed).toBe(2);
  expect(done.reports).toHaveLength(2);
});

test("full artifact history retains the latest projection without blocking progress", async () => {
  const { coding, id, workflows, path } = fixture();
  const state = workflows.read(id);
  state.artifactDirectories = Array.from(
    { length: 20 },
    (_, index) => `old-${String(index)}`,
  );
  const body = JSON.stringify(state);
  const db = new DatabaseSync(path);
  db.prepare("UPDATE workflows SET body=?,hash=? WHERE id=?").run(
    body,
    createHash("sha256").update(body).digest("hex"),
    id,
  );
  db.close();
  const result = await workflows.resume(id, coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "author"
          ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  if (result.artifactDirectory) roots.push(result.artifactDirectory);
  expect(result.phase).toBe("verification_required");
  expect(result.artifactDirectories).toHaveLength(20);
  expect(result.artifactDirectories.at(-1)).toBe(result.artifactDirectory);
  expect(result.artifactDirectories).not.toContain("old-0");
});

test("shutdown preserves a resumable coding workflow instead of blocking ready state", async () => {
  const { coding, id, workflows } = fixture();
  const original = coding.read(id);
  const next = coding.create(
    original.request,
    { ...original.config, candidates: [c("author"), c("fallback")] },
    { "x.ts": "export const x = ;" },
  );
  workflows.create(next, coding, workflows.read(id).review, 2);
  const controller = new AbortController();
  let calls = 0;
  const state = await workflows.resume(
    next,
    coding,
    () => {
      calls++;
      controller.abort();
      return Promise.reject(new Failure("interrupted"));
    },
    controller.signal,
  );
  roots.push(...state.artifactDirectories);
  expect(calls).toBe(1);
  expect(coding.read(next).attempts).toBe(1);
  expect(coding.read(next).status).toBe("ready");
  expect(state.phase).toBe("coding");
  expect(state.reason).toBeNull();
});

test("verified outcomes persist and stop the foreground scheduler", async () => {
  const f = fixture();
  const state = await f.workflows.resume(f.id, f.coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "author"
          ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  roots.push(...state.artifactDirectories);
  const proof = {
    checkpointSha256: state.reviewedCheckpointSha256,
    specificationSha256: "a".repeat(64),
    reportSha256: "b".repeat(64),
    accepted: true,
    outcome: "executed",
    directory: f.root,
    feedback: "",
  };
  expect(f.workflows.recordVerification(f.id, f.coding, proof).phase).toBe(
    "verified",
  );
  const reopened = new CodingWorkflows(f.path);
  handles.push(reopened);
  expect(
    (
      await reopened.resume(f.id, f.coding, () => {
        throw Error("must not dispatch");
      })
    ).phase,
  ).toBe("verified");
  expect(reopened.recordVerification(f.id, f.coding, proof).phase).toBe(
    "verified",
  );
  f.coding.revisePrompt(f.id, 1, "Changed task", Date.now());
  expect(() => reopened.recordVerification(f.id, f.coding, proof)).toThrow(
    /stale/,
  );
  expect(
    (
      await reopened.resume(f.id, f.coding, () => {
        throw Error("must not dispatch");
      })
    ).reason,
  ).toBe("stale");
});
test("failed verification enters the existing repair path and preserves cumulative budgets", async () => {
  const f = fixture();
  const worker = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "author"
          ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    );
  const state = await f.workflows.resume(f.id, f.coding, worker);
  roots.push(...state.artifactDirectories);
  const proof = {
    checkpointSha256: state.reviewedCheckpointSha256,
    specificationSha256: "a".repeat(64),
    reportSha256: "b".repeat(64),
    accepted: false,
    outcome: "test_process_failed",
    directory: f.root,
    feedback: "assertion failed: preserve original requirements",
  };
  expect(f.workflows.recordVerification(f.id, f.coding, proof).phase).toBe(
    "repair",
  );
  const next = await f.workflows.resume(f.id, f.coding, worker);
  roots.push(...next.artifactDirectories);
  expect(next.phase).toBe("verification_required");
  expect(f.coding.read(f.id).attempts).toBe(2);
  expect(f.coding.read(f.id).revision).toBe(2);
  expect(next.reviewPairsUsed).toBe(2);
  expect(f.workflows.recordVerification(f.id, f.coding, proof).phase).toBe(
    "verification_required",
  );
  const exhausted = {
    ...proof,
    directory: join(f.root, "second-verification"),
    checkpointSha256: next.reviewedCheckpointSha256,
    reportSha256: "c".repeat(64),
  };
  expect(f.workflows.recordVerification(f.id, f.coding, exhausted).reason).toBe(
    "review_budget",
  );
});
test("interrupted verification cannot start a coding repair", async () => {
  const f = fixture();
  const state = await f.workflows.resume(f.id, f.coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "author"
          ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  roots.push(...state.artifactDirectories);
  const proof = {
    checkpointSha256: state.reviewedCheckpointSha256,
    specificationSha256: "a".repeat(64),
    reportSha256: "b".repeat(64),
    accepted: false,
    outcome: "interrupted",
    directory: f.root,
    feedback: "",
  };
  expect(f.workflows.recordVerification(f.id, f.coding, proof).phase).toBe(
    "verification_required",
  );
  expect(f.coding.read(f.id).attempts).toBe(1);
});

test("checkpoint guard excludes concurrent coding writes during workflow commit", () => {
  const f = fixture();
  const competing = new DatabaseSync(f.coding.path);
  handles.push(competing);
  competing.exec("PRAGMA busy_timeout=0");
  const expected = createHash("sha256")
    .update(JSON.stringify(f.coding.read(f.id)))
    .digest("hex");
  f.coding.withCheckpoint(f.id, expected, () => {
    expect(() =>
      competing.prepare("UPDATE runs SET body=body WHERE id=?").run(f.id),
    ).toThrow(/locked/);
  });
  expect(() =>
    competing.prepare("UPDATE runs SET body=body WHERE id=?").run(f.id),
  ).not.toThrow();
});

test("expired coding dispatch blocks workflow as ambiguous without replay", async () => {
  const { coding, id, workflows } = fixture();
  expect(coding.start(id, "crashed", 0, 1)).not.toBeNull();
  let calls = 0;
  const worker = () => {
    calls++;
    return Promise.reject(new Error("Must not replay"));
  };
  const first = await workflows.resume(id, coding, worker);
  expect(first.phase).toBe("blocked");
  expect(first.reason).toBe("ambiguous");
  expect(coding.read(id).status).toBe("ambiguous");
  expect(coding.read(id).attempts).toBe(1);
  expect(await workflows.resume(id, coding, worker)).toEqual(first);
  expect(calls).toBe(0);
});

test("review validation diagnostics survive reopening and do not authorize another dispatch", async () => {
  const { coding, id, workflows, path } = fixture();
  let calls = 0;
  const result = await workflows.resume(id, coding, (_task, selection) => {
    calls++;
    return Promise.resolve(
      selection.candidate.provider === "author"
        ? JSON.stringify({
            edits: [{ path: "x.ts", content: "export const x = 2;" }],
          })
        : "private-token-marker",
    );
  });
  expect(result.phase).toBe("blocked");
  expect(result.reason).toBe("invalid_output");
  expect(result.lastReport).not.toContain("private-token-marker");
  const report: unknown = JSON.parse(result.lastReport ?? "null");
  expect(report).toHaveProperty("validationFailure", "invalid_json");
  workflows.close();
  const reopened = new CodingWorkflows(path);
  handles.push(reopened);
  expect(reopened.read(id).lastReport).toBe(result.lastReport);
  await reopened.resume(id, coding, () => {
    calls++;
    return Promise.resolve("unexpected");
  });
  expect(calls).toBe(2);
});

test("review quota persists a bounded wait across restart without redoing coding", async () => {
  const f = fixture();
  let calls = 0;
  const first = await f.workflows.resume(f.id, f.coding, (_task, selection) => {
    calls++;
    if (selection.candidate.provider !== "author")
      throw new Failure("quota", 90000);
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 2;" }],
      }),
    );
  });
  roots.push(...first.artifactDirectories);
  expect(first.phase).toBe("review");
  expect(first.reason).toBe("quota");
  expect(first.retryAt).toBeGreaterThan(Date.now() + 80000);
  expect(first.reviewPairsUsed).toBe(1);
  expect(first.reports).toHaveLength(1);
  f.workflows.close();
  const reopened = new CodingWorkflows(f.path);
  handles.push(reopened);
  const waiting = await reopened.resume(f.id, f.coding, () => {
    calls++;
    throw Error("premature retry");
  });
  expect(calls).toBe(2);
  expect(waiting.retryAt).toBe(first.retryAt);
  expect(waiting.reviewPairsUsed).toBe(1);
  if (first.retryAt === null) throw Error("Missing retry");
  const clock = vi.spyOn(Date, "now").mockReturnValue(first.retryAt);
  try {
    const finished = await reopened.resume(f.id, f.coding, () => {
      calls++;
      return Promise.resolve('{"verdict":"no_findings","findings":[]}');
    });
    expect(finished.phase).toBe("verification_required");
    expect(finished.reviewPairsUsed).toBe(2);
    expect(finished.reports).toHaveLength(2);
    expect(finished.retryAt).toBeNull();
    expect(finished.reason).toBeNull();
    expect(f.coding.read(f.id).attempts).toBe(1);
    expect(calls).toBe(4);
  } finally {
    clock.mockRestore();
  }
});

test("review denials and uncertain failures remain blocked without automatic retry", async () => {
  for (const failure of [
    "policy",
    "permission",
    "approval",
    "auth",
    "unknown",
    "timeout",
  ] as const) {
    const f = fixture();
    let calls = 0;
    const worker = (
      _task: unknown,
      selection: { candidate: { provider: string } },
    ) => {
      calls++;
      if (selection.candidate.provider !== "author") throw new Failure(failure);
      return Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x = 2;" }],
        }),
      );
    };
    const state = await f.workflows.resume(f.id, f.coding, worker);
    roots.push(...state.artifactDirectories);
    expect(state.phase).toBe("blocked");
    expect(state.reason).toBe(failure);
    expect(state.retryAt).toBeNull();
    await f.workflows.resume(f.id, f.coding, worker);
    expect(calls).toBe(2);
  }
});

test("repeated reviewer outages exhaust original pair budget without another author attempt", async () => {
  const f = fixture();
  let calls = 0;
  const worker = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) => {
    calls++;
    if (selection.candidate.provider !== "author") throw new Failure("outage");
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 2;" }],
      }),
    );
  };
  const first = await f.workflows.resume(f.id, f.coding, worker);
  roots.push(...first.artifactDirectories);
  if (first.retryAt === null) throw Error("Missing retry");
  const clock = vi.spyOn(Date, "now").mockReturnValue(first.retryAt);
  try {
    const last = await f.workflows.resume(f.id, f.coding, worker);
    expect(last.phase).toBe("blocked");
    expect(last.retryAt).toBeNull();
    expect(last.reviewPairsUsed).toBe(2);
    expect(last.reports).toHaveLength(2);
    await f.workflows.resume(f.id, f.coding, worker);
    expect(calls).toBe(3);
    expect(f.coding.read(f.id).attempts).toBe(1);
  } finally {
    clock.mockRestore();
  }
});

test("a reviewer cooldown from another workflow waits without consuming a review pair", async () => {
  const f = fixture();
  const author = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) => {
    if (selection.candidate.provider !== "author")
      throw new Failure("quota", 90000);
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 2;" }],
      }),
    );
  };
  const first = await f.workflows.resume(f.id, f.coding, author);
  roots.push(...first.artifactDirectories);
  const source = f.coding.read(f.id);
  const secondId = f.coding.create(
    { ...source.request, task: { ...source.request.task, id: "second" } },
    source.config,
    { "x.ts": "export const x = ;" },
  );
  f.workflows.create(secondId, f.coding, first.review, 2);
  let reviewerCalls = 0;
  const second = await f.workflows.resume(
    secondId,
    f.coding,
    (task, selection) => {
      if (selection.candidate.provider !== "author") reviewerCalls++;
      return author(task, selection);
    },
  );
  roots.push(...second.artifactDirectories);
  expect(second.phase).toBe("review");
  expect(second.retryAt).toBe(first.retryAt);
  expect(second.reviewPairsUsed).toBe(0);
  expect(second.reports).toHaveLength(0);
  expect(reviewerCalls).toBe(0);
});

test("a cooled reviewer is replaced only by permitted independent providers", async () => {
  const f = fixture(["a", "b", "c"]);
  const providers: string[] = [];
  const worker = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) => {
    const provider = selection.candidate.provider;
    providers.push(provider);
    if (provider === "author")
      return Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x = 2;" }],
        }),
      );
    if (provider === "a") throw new Failure("quota", 90000);
    return Promise.resolve('{"verdict":"no_findings","findings":[]}');
  };
  const first = await f.workflows.resume(f.id, f.coding, worker);
  roots.push(...first.artifactDirectories);
  expect(first.retryAt).toBeLessThanOrEqual(Date.now());
  const last = await f.workflows.resume(f.id, f.coding, worker);
  expect(last.phase).toBe("verification_required");
  expect(providers).toEqual(["author", "a", "b", "c"]);
  const { readInventoryHealth } = await import("../src/inventory-runtime.js");
  const inventory = readInventoryHealth(
    join(f.root, "absent-ledger.sqlite"),
    f.coding.path,
  );
  expect(inventory.source).toContain("workflow_journal");
  expect(inventory.health["provider:a"]?.until).toBeGreaterThan(Date.now());
});

test("legacy reviewer waits without provider metadata remain authoritative after reopening", async () => {
  const f = fixture();
  const first = await f.workflows.resume(f.id, f.coding, (_task, selection) => {
    if (selection.candidate.provider !== "author")
      throw new Failure("quota", 90000);
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 2;" }],
      }),
    );
  });
  roots.push(...first.artifactDirectories);
  delete first.reviewCooldowns;
  const body = JSON.stringify(first);
  const db = new DatabaseSync(f.path);
  db.prepare("UPDATE workflows SET body=?,hash=? WHERE id=?").run(
    body,
    createHash("sha256").update(body).digest("hex"),
    f.id,
  );
  db.close();
  f.workflows.close();
  const reopened = new CodingWorkflows(f.path);
  handles.push(reopened);
  let calls = 0;
  const waiting = await reopened.resume(f.id, f.coding, () => {
    calls++;
    throw Error("premature legacy retry");
  });
  expect(waiting.phase).toBe("review");
  expect(waiting.retryAt).toBe(first.retryAt);
  expect(waiting.reviewPairsUsed).toBe(1);
  expect(calls).toBe(0);
});

test("mid-pair cooldown uses an alternative without repeating author or first review", async () => {
  const { coding, id, workflows, path } = fixture(["a", "b", "c"]);
  const health: Record<string, { until: number }> = {};
  vi.spyOn(workflows, "reviewHealth").mockImplementation(() => health);
  const calls: string[] = [];
  const result = await workflows.resume(id, coding, (_task, selection) => {
    calls.push(selection.candidate.provider);
    if (selection.candidate.provider === "author")
      return Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x = 2;" }],
        }),
      );
    health["provider:b"] = { until: Date.now() + 60_000 };
    return Promise.resolve(
      JSON.stringify({ verdict: "no_findings", findings: [] }),
    );
  });
  roots.push(...result.artifactDirectories);
  expect(result.phase).toBe("verification_required");
  expect(result.reviewPairsUsed).toBe(1);
  expect(calls).toEqual(["author", "a", "c"]);
  const reopened = new CodingWorkflows(path);
  handles.push(reopened);
  expect(reopened.read(id).reports).toEqual(result.reports);
  const report = JSON.parse(result.reports[0] ?? "null") as {
    attempts: unknown[];
  };
  expect(report.attempts).toHaveLength(2);
});

test("partial review survives restart and finishes its final reserved pair after cooldown", async () => {
  const f = fixture(["a", "b"], 1);
  const clock = vi.spyOn(Date, "now");
  const now = Date.now();
  clock.mockReturnValue(now);
  const health: Record<string, { until: number }> = {};
  vi.spyOn(f.workflows, "reviewHealth").mockImplementation(() => health);
  const calls: string[] = [];
  const first = await f.workflows.resume(f.id, f.coding, (_task, selection) => {
    const provider = selection.candidate.provider;
    calls.push(provider);
    if (provider === "author")
      return Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x = 2;" }],
        }),
      );
    health["provider:b"] = { until: now + 60_000 };
    return Promise.resolve('{"verdict":"no_findings","findings":[]}');
  });
  roots.push(...first.artifactDirectories);
  expect(first.phase).toBe("review");
  expect(first.retryAt).toBe(now + 60_000);
  expect(first.reviewPairsUsed).toBe(1);
  expect(first.reports).toHaveLength(1);
  expect(calls).toEqual(["author", "a"]);
  const reopened = new CodingWorkflows(f.path);
  handles.push(reopened);
  const resumedWorker = (
    _task: unknown,
    selection: { candidate: { provider: string } },
  ) => {
    calls.push(selection.candidate.provider);
    return Promise.resolve('{"verdict":"no_findings","findings":[]}');
  };
  expect((await reopened.resume(f.id, f.coding, resumedWorker)).retryAt).toBe(
    now + 60_000,
  );
  expect(calls).toEqual(["author", "a"]);
  clock.mockReturnValue(now + 60_000);
  // A completed reviewer need not be available again to finish its saved pair.
  vi.spyOn(reopened, "reviewHealth").mockReturnValue({
    "provider:a": { until: now + 120_000 },
  });
  const last = await reopened.resume(f.id, f.coding, resumedWorker);
  expect(last.phase).toBe("verification_required");
  expect(last.reviewPairsUsed).toBe(1);
  expect(last.reports).toHaveLength(1);
  expect(last.pendingReview).toBeUndefined();
  expect(calls).toEqual(["author", "a", "b"]);
  const { reviewAccounting } = await import("../src/review-accounting.js");
  expect(reviewAccounting(last.reports, last.reviewPairsUsed).attempts).toBe(2);
  clock.mockRestore();
});

test.each(["stale", "ambiguous", "policy", "quota"] as const)(
  "partial review boundary %s preserves budget and does not replay completed calls",
  async (boundary) => {
    const f = fixture(["a", "b"], 1);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const health: Record<string, { until: number }> = {};
    vi.spyOn(f.workflows, "reviewHealth").mockImplementation(() => health);
    const first = await f.workflows.resume(
      f.id,
      f.coding,
      (_task, selection) => {
        if (selection.candidate.provider === "author")
          return Promise.resolve(
            JSON.stringify({
              edits: [{ path: "x.ts", content: "export const x = 2;" }],
            }),
          );
        health["provider:b"] = { until: now + 60_000 };
        return Promise.resolve('{"verdict":"no_findings","findings":[]}');
      },
    );
    roots.push(...first.artifactDirectories);
    expect(first.phase).toBe("review");
    if (boundary === "stale")
      f.coding.revisePrompt(f.id, 1, "New task boundary", now + 1);
    if (boundary === "ambiguous") {
      const changed = { ...first, phase: "reviewing" };
      const body = JSON.stringify(changed);
      const db = new DatabaseSync(f.path);
      db.prepare("UPDATE workflows SET body=?,hash=? WHERE id=?").run(
        body,
        createHash("sha256").update(body).digest("hex"),
        f.id,
      );
      db.close();
    }
    const reopened = new CodingWorkflows(f.path);
    handles.push(reopened);
    clock.mockReturnValue(now + 60_000);
    const calls: string[] = [];
    const last = await reopened.resume(f.id, f.coding, (_task, selection) => {
      calls.push(selection.candidate.provider);
      throw new Failure(boundary === "quota" ? "quota" : "policy", 1000);
    });
    expect(last.phase).toBe("blocked");
    expect(last.reason).toBe(
      boundary === "stale"
        ? "revision_changed"
        : boundary === "ambiguous"
          ? "ambiguous_review"
          : boundary,
    );
    expect(last.reviewPairsUsed).toBe(1);
    expect(last.reports).toHaveLength(1);
    expect(calls).toEqual(
      boundary === "stale" || boundary === "ambiguous" ? [] : ["b"],
    );
    await reopened.resume(f.id, f.coding, () => {
      throw new Error("No blocked replay");
    });
    if (boundary === "quota")
      expect(last.reviewCooldowns?.["provider:b"]?.until).toBeGreaterThan(
        now + 60_000,
      );
  },
);

async function authBlocked(
  kind: "auth" | "policy" | "permission" | "approval" = "auth",
  maxPairs = 2,
) {
  const f = fixture(["a", "b"], maxPairs);
  const result = await f.workflows.resume(f.id, f.coding, (_task, selection) =>
    selection.candidate.provider === "author"
      ? Promise.resolve(
          '{"edits":[{"path":"x.ts","content":"export const x = 2;"}]}',
        )
      : Promise.reject(new Failure(kind, undefined, "worker_setup")),
  );
  roots.push(...result.artifactDirectories);
  return f;
}
test("explicit auth recovery preserves candidate, reports and budgets then resumes review", async () => {
  const f = await authBlocked();
  const before = f.workflows.read(f.id);
  const code = f.coding.read(f.id);
  const digest = f.workflows.storageDigest(f.id);
  const next = f.workflows.retryReviewAuthentication(f.id, f.coding, digest);
  expect(next.phase).toBe("review");
  expect(next.reviewPairsUsed).toBe(1);
  expect(next.reports).toEqual(before.reports);
  expect(f.coding.read(f.id)).toEqual(code);
  expect(next.authenticationRecoveries).toHaveLength(1);
  const calls: string[] = [];
  const result = await f.workflows.resume(
    f.id,
    f.coding,
    (_task, selection) => {
      calls.push(selection.candidate.provider);
      return Promise.resolve('{"verdict":"no_findings","findings":[]}');
    },
  );
  expect(calls).toEqual(["a", "b"]);
  expect(result.phase).toBe("verification_required");
  expect(result.reviewPairsUsed).toBe(2);
  expect(f.coding.read(f.id).attempts).toBe(1);
});
test.each(["policy", "permission", "approval"] as const)(
  "auth recovery cannot release %s",
  async (kind) => {
    const f = await authBlocked(kind);
    const before = f.workflows.storageDigest(f.id);
    expect(() =>
      f.workflows.retryReviewAuthentication(f.id, f.coding, before),
    ).toThrow();
    expect(f.workflows.storageDigest(f.id)).toBe(before);
  },
);
test("auth recovery rejects stale digest, changed candidate and exhausted review budget", async () => {
  const f = await authBlocked();
  const digest = f.workflows.storageDigest(f.id);
  expect(() =>
    f.workflows.retryReviewAuthentication(f.id, f.coding, "0".repeat(64)),
  ).toThrow();
  f.coding.revisePrompt(f.id, 1, "New constraints", 200);
  expect(() =>
    f.workflows.retryReviewAuthentication(f.id, f.coding, digest),
  ).toThrow();
  expect(f.workflows.storageDigest(f.id)).toBe(digest);
  const exhausted = await authBlocked("auth", 1);
  expect(() =>
    exhausted.workflows.retryReviewAuthentication(
      exhausted.id,
      exhausted.coding,
      exhausted.workflows.storageDigest(exhausted.id),
    ),
  ).toThrow();
});

test("auth recovery cannot publish after cancellation at final commit", async () => {
  const f = await authBlocked();
  const digest = f.workflows.storageDigest(f.id);
  let commits = 0;
  expect(() =>
    f.workflows.retryReviewAuthentication(f.id, f.coding, digest, (action) => {
      commits++;
      if (commits === 2) f.coding.cancel(f.id);
      return action();
    }),
  ).toThrow();
  expect(f.workflows.storageDigest(f.id)).toBe(digest);
  expect(f.coding.read(f.id).status).toBe("cancelled");
});
