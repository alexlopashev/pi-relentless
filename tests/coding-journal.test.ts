import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { configSchema } from "../src/router.js";
import { Failure } from "../src/failures.js";
const roots: string[] = [];
const handles: CodingJournal[] = [];
afterEach(() => {
  for (const handle of handles) handle.close();
  handles.length = 0;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
const config = configSchema.parse({
  candidates: [
    {
      name: "test",
      provider: "fixture",
      model: "offline",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const request = {
  sourceRoot: "/unused",
  task: { id: "repair", prompt: "Repair syntax", minQuality: 1, effort: "low" },
  files: [
    { path: "x.ts", writable: true },
    { path: "context.txt", writable: false },
  ],
  maxAttempts: 2,
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "coding-journal-test-"));
  roots.push(root);
  const path = join(root, "coding.sqlite");
  const journal = connect(path);
  const id = journal.create(request, config, {
    "x.ts": "export const x = ;",
    "context.txt": "fixed",
  });
  return { journal, id, path };
}
function connect(path: string) {
  const journal = new CodingJournal(path);
  handles.push(journal);
  return journal;
}
test("failure origin survives reopen and follows the winning late denial", () => {
  const { journal, id, path } = fixture();
  const token = journal.start(id, "worker", 100, 100);
  if (!token) throw new Error("Missing lease");
  journal.fail(
    id,
    token,
    new Failure("unknown", undefined, "worker_inference"),
    101,
  );
  expect(connect(path).read(id).failures[0]).toMatchObject({
    kind: "unknown",
    origin: "worker_inference",
  });
  journal.fail(
    id,
    token,
    new Failure("policy", undefined, "provider_response"),
    102,
  );
  journal.fail(
    id,
    token,
    new Failure("unknown", undefined, "worker_protocol"),
    103,
  );
  expect(connect(path).read(id).failures[0]).toMatchObject({
    kind: "policy",
    origin: "provider_response",
  });
});
test("output reasons survive reopen only while their failure is authoritative", () => {
  const { journal, id, path } = fixture();
  const token = journal.start(id, "worker", 100, 100);
  if (!token) throw new Error("Missing lease");
  journal.fail(
    id,
    token,
    new Failure("unknown", undefined, "coding_output", "invalid_json"),
    101,
  );
  expect(connect(path).read(id).failures[0]).toMatchObject({
    outputReason: "invalid_json",
  });
  journal.fail(
    id,
    token,
    new Failure("policy", undefined, "provider_response"),
    102,
  );
  journal.fail(
    id,
    token,
    new Failure("unknown", undefined, "coding_output", "invalid_path"),
    103,
  );
  const failure = connect(path).read(id).failures[0];
  expect(failure).toMatchObject({
    kind: "policy",
    origin: "provider_response",
  });
  expect(failure).not.toHaveProperty("outputReason");
});
test("retains snapshot, contract and consumed budget across connection loss", () => {
  const { journal, id, path } = fixture();
  const first = journal.start(id, "worker-a", 100, 10);
  expect(first).not.toBeNull();
  const recovered = connect(path);
  expect(recovered.read(id).attempts).toBe(1);
  expect(recovered.start(id, "worker-b", 109, 10)).toBeNull();
  const second = recovered.start(id, "worker-b", 110, 10);
  expect(second).toBeNull();
  expect(recovered.read(id).attempts).toBe(1);
  expect(recovered.read(id).request.task.prompt).toBe("Repair syntax");
  expect(recovered.read(id).files["x.ts"]?.original).toBe("export const x = ;");
  expect(recovered.start(id, "worker-c", 120, 10)).toBeNull();
  expect(recovered.read(id).status).toBe("ambiguous");
});
test("fences results from a completed attempt after a known retry", () => {
  const { journal, id } = fixture();
  const first = journal.start(id, "same-owner", 100, 10);
  if (!first) throw Error("No lease");
  expect(journal.finish(id, first, {}, "retry", 109)).toBe(true);
  const second = journal.start(id, "same-owner", 110, 10);
  if (!second) throw Error("No lease");
  expect(
    journal.finish(id, first, { "x.ts": "stale" }, "ready_for_review", 111),
  ).toBe(false);
  expect(
    journal.finish(
      id,
      second,
      { "x.ts": "export const x = 2;" },
      "ready_for_review",
      111,
    ),
  ).toBe(true);
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = 2;");
  expect(journal.start(id, "third", 1000, 10)).toBeNull();
});
test("rejects an entire invalid edit transaction without consuming the active lease", () => {
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  for (const edits of [
    { "x.ts": "changed", "context.txt": "bad" },
    { "outside.ts": "bad" },
    { "x.ts": "\0" },
    { "x.ts": "a".repeat(32769) },
  ]) {
    expect(() =>
      journal.finish(id, token, edits, "ready_for_review", 101),
    ).toThrow();
    expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
    expect(journal.read(id).status).toBe("running");
  }
});
test("retains checked intermediate edits and never replenishes attempts", () => {
  const { journal, id, path } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  expect(
    journal.finish(id, token, { "x.ts": "export const x = (" }, "retry", 101),
  ).toBe(true);
  const reopened = connect(path);
  expect(reopened.read(id).files["x.ts"]?.current).toBe("export const x = (");
  const next = reopened.start(id, "worker", 102, 10);
  if (!next) throw new Error("No lease");
  expect(reopened.finish(id, next, {}, "retry", 103)).toBe(true);
  expect(reopened.read(id).status).toBe("exhausted");
});
test("blocking is terminal; a retry cannot clear it", () => {
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  expect(journal.finish(id, token, {}, "blocked", 101)).toBe(true);
  expect(journal.start(id, "another", 1000, 10)).toBeNull();
  expect(journal.finish(id, token, {}, "retry", 102)).toBe(false);
});
test("renewal requires current unexpired lease and never consumes another attempt", () => {
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  expect(journal.renew(id, token, 105, 10)).toBe(true);
  expect(journal.start(id, "other", 110, 10)).toBeNull();
  expect(journal.read(id).attempts).toBe(1);
  expect(journal.renew(id, token, 115, 10)).toBe(false);
});
test("validates exact input manifest and bounded UTF-8 snapshot before persistence", () => {
  const { journal } = fixture();
  for (const snapshot of [
    { "x.ts": "x" },
    { "x.ts": "x", "context.txt": "fixed", extra: "bad" },
    { "x.ts": "💥".repeat(10000), "context.txt": "fixed" },
  ]) {
    expect(() => journal.create(request, config, snapshot)).toThrow();
  }
});
test("rejects invalid clocks and lease durations before mutation", () => {
  const { journal, id } = fixture();
  for (const [at, ttl] of [
    [NaN, 10],
    [-1, 10],
    [100, 0],
    [100, Infinity],
    [Number.MAX_SAFE_INTEGER, 10],
  ]) {
    expect(() => journal.start(id, "worker", at ?? NaN, ttl ?? NaN)).toThrow();
  }
  expect(journal.read(id).attempts).toBe(0);
});
test("does not accept an unchanged snapshot as a review candidate", () => {
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  expect(() =>
    journal.finish(id, token, {}, "ready_for_review", 101),
  ).toThrow();
  expect(journal.read(id).status).toBe("running");
});
test("checksum corruption fails closed across reconnection", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { journal, id, path } = fixture();
  journal.close();
  const db = new DatabaseSync(path);
  db.prepare("UPDATE runs SET body=? WHERE id=?").run("{}", id);
  db.close();
  expect(() => connect(path)).toThrow();
});
test("rejects structurally impossible checkpoints even with a matching checksum", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { journal, id, path } = fixture();
  const baseline = journal.read(id);
  const db = new DatabaseSync(path);
  for (const altered of [
    { ...baseline, epoch: 4 },
    { ...baseline, status: "exhausted" },
    { ...baseline, status: "ready_for_review" },
    {
      ...baseline,
      files: {
        ...baseline.files,
        "context.txt": { original: "fixed", current: "altered" },
      },
    },
  ]) {
    const body = JSON.stringify(altered);
    db.prepare("UPDATE runs SET body=?,hash=? WHERE id=?").run(
      body,
      createHash("sha256").update(body).digest("hex"),
      id,
    );
    expect(() => journal.read(id)).toThrow();
  }
  db.close();
});
test("a prototype-shaped context filename cannot poison the journal", () => {
  const { journal, id, path } = fixture();
  const input = {
    ...request,
    files: [
      { path: "x.ts", writable: true },
      { path: "__proto__", writable: false },
    ],
  };
  expect(() =>
    journal.create(
      input,
      config,
      Object.fromEntries([
        ["x.ts", "x"],
        ["__proto__", "context"],
      ]),
    ),
  ).toThrow();
  expect(connect(path).read(id).status).toBe("ready");
});

test("closes the SQLite handle when opening malformed existing data", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const root = mkdtempSync(join(tmpdir(), "malformed-coding-journal-"));
  roots.push(root);
  const path = join(root, "coding.sqlite");
  writeFileSync(path, "not a sqlite database");
  const close = vi.spyOn(DatabaseSync.prototype, "close");
  try {
    expect(() => connect(path)).toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    close.mockRestore();
  }
});
test("provider quota cooldown and attempt route survive reopening without spending while waiting", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id, path } = fixture();
  const token = journal.start(id, "one", 100, 10);
  if (!token) throw new Error("No lease");
  expect(journal.fail(id, token, new Failure("quota", 90000), 101)).toBe(true);
  const reopened = connect(path);
  expect(reopened.read(id).status).toBe("waiting_retry");
  expect(reopened.read(id).dueAt).toBe(90101);
  expect(reopened.start(id, "too-soon", 90100, 10)).toBeNull();
  expect(reopened.read(id).attempts).toBe(1);
  expect(reopened.start(id, "recovered", 90101, 10)).not.toBeNull();
  expect(reopened.read(id).failures[0]?.kind).toBe("quota");
  expect(reopened.read(id).attempts).toBe(2);
});
test("stale failure cannot cool a provider or unblock a terminal run", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const token = journal.start(id, "one", 100, 10);
  if (!token) throw new Error("No lease");
  journal.finish(id, token, {}, "blocked", 101);
  expect(journal.fail(id, token, new Failure("outage"), 102)).toBe(false);
  expect(journal.read(id).failures).toEqual([]);
  expect(journal.read(id).status).toBe("blocked");
});
test("an issued stale attempt's denial blocks replacement publication; fabricated tokens cannot", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const old = journal.start(id, "old", 100, 10);
  if (!old) throw new Error("No lease");
  expect(journal.finish(id, old, {}, "retry", 109)).toBe(true);
  const next = journal.start(id, "new", 110, 100);
  if (!next) throw new Error("No lease");
  expect(
    journal.fail(
      id,
      { owner: "invented", epoch: 1 },
      new Failure("policy"),
      111,
    ),
  ).toBe(false);
  expect(journal.fail(id, old, new Failure("policy"), 111)).toBe(true);
  expect(
    journal.finish(
      id,
      next,
      { "x.ts": "export const x = 9;" },
      "ready_for_review",
      112,
    ),
  ).toBe(false);
  expect(journal.read(id).status).toBe("blocked");
  expect(journal.read(id).failures[0]?.kind).toBe("policy");
});
test("pre-recovery checkpoints remain readable without resetting their attempts", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { journal, id, path } = fixture();
  journal.start(id, "legacy", 100, 10);
  const legacy = journal.read(id);
  for (const key of ["dispatches", "failures", "health", "dueAt"])
    Reflect.deleteProperty(legacy, key);
  if (legacy.lease) {
    Reflect.deleteProperty(legacy.lease, "candidate");
    Reflect.deleteProperty(legacy.lease, "effort");
  }
  const body = JSON.stringify(legacy);
  const db = new DatabaseSync(path);
  db.prepare("UPDATE runs SET body=?,hash=? WHERE id=?").run(
    body,
    createHash("sha256").update(body).digest("hex"),
    id,
  );
  db.close();
  const reopened = connect(path);
  expect(reopened.read(id).attempts).toBe(1);
  expect(reopened.read(id).health).toEqual({});
  expect(reopened.start(id, "new", 110, 10)).toBeNull();
  expect(reopened.read(id).status).toBe("ambiguous");
  expect(reopened.read(id).attempts).toBe(1);
});
test("cancellation is durable, idempotent and consumes no attempts", () => {
  const { journal, id, path } = fixture();
  journal.cancel(id, 100);
  journal.cancel(id, 200);
  const reopened = connect(path);
  expect(reopened.read(id).status).toBe("cancelled");
  expect(reopened.read(id).cancelledAt).toBe(100);
  expect(reopened.read(id).attempts).toBe(0);
  expect(reopened.start(id, "ignored", 1000, 10)).toBeNull();
});
test("cancellation revokes a running lease without discarding committed source", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 100);
  if (!token) throw new Error("No lease");
  journal.cancel(id, 101);
  expect(journal.renew(id, token, 102, 100)).toBe(false);
  expect(
    journal.finish(
      id,
      token,
      { "x.ts": "export const x = 1;" },
      "ready_for_review",
      102,
    ),
  ).toBe(false);
  expect(journal.fail(id, token, new Failure("policy"), 102)).toBe(true);
  expect(journal.read(id).status).toBe("cancelled");
  expect(journal.read(id).failures[0]?.kind).toBe("policy");
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
  expect(journal.read(id).attempts).toBe(1);
});
test("cancellation removes retry scheduling but preserves quota evidence", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const token = journal.start(id, "worker", 100, 10);
  if (!token) throw new Error("No lease");
  journal.fail(id, token, new Failure("quota"), 101);
  journal.cancel(id, 102);
  expect(journal.read(id).dueAt).toBe(0);
  expect(journal.read(id).health["provider:fixture"]?.until).toBe(30101);
  expect(journal.read(id).failures[0]?.kind).toBe("quota");
});
test("invalid cancellation clocks cannot mutate the run", () => {
  const { journal, id } = fixture();
  for (const now of [NaN, -1, Infinity])
    expect(() => {
      journal.cancel(id, now);
    }).toThrow();
  expect(journal.read(id).status).toBe("ready");
});

test("prompt revisions persist without replenishing attempts or changing authority", () => {
  const { journal, id, path } = fixture();
  const token = journal.start(id, "first", 100, 10);
  if (!token) throw new Error("Missing lease");
  journal.finish(
    id,
    token,
    { "x.ts": "export const x = 1;" },
    "ready_for_review",
    101,
  );
  const before = journal.read(id);
  journal.revisePrompt(
    id,
    1,
    "Keep the interface; improve the implementation.",
    102,
  );
  const after = connect(path).read(id);
  expect(after.revision).toBe(2);
  expect(after.request.task.prompt).toBe(
    "Keep the interface; improve the implementation.",
  );
  expect(after.revisions).toEqual([
    { revision: 1, prompt: request.task.prompt, at: 102 },
  ]);
  expect(after.attempts).toBe(before.attempts);
  expect(after.files).toEqual(before.files);
  expect(after.config).toEqual(before.config);
  expect(after.request.maxAttempts).toBe(before.request.maxAttempts);
  expect(after.status).toBe("ready");
  expect(journal.finish(id, token, {}, "blocked", 103)).toBe(false);
  expect(() => {
    journal.revisePrompt(id, 1, "Stale update", 104);
  }).toThrow();
  expect(journal.read(id)).toEqual(after);
});

test("prompt revision rejects live or expired running attempts and cannot clear blockers", () => {
  const { journal, id } = fixture();
  const token = journal.start(id, "first", 100, 10);
  if (!token) throw new Error("Missing lease");
  for (const now of [101, 111]) {
    expect(() => {
      journal.revisePrompt(id, 1, "New instruction", now);
    }).toThrow();
  }
  journal.finish(id, token, {}, "blocked", 102);
  journal.revisePrompt(id, 1, "New instruction", 103);
  expect(journal.read(id).status).toBe("blocked");
  expect(journal.start(id, "next", 104, 10)).toBeNull();
  journal.cancel(id, 105);
  expect(() => {
    journal.revisePrompt(id, 2, "Undo cancel", 106);
  }).toThrow();
});

test("prompt revisions preserve waits, exhausted budgets, and reject invalid updates", () => {
  const { journal, id } = fixture();
  for (const prompt of ["", "x".repeat(100001)]) {
    expect(() => {
      journal.revisePrompt(id, 1, prompt, 100);
    }).toThrow();
  }
  expect(() => {
    journal.revisePrompt(id, 1, "valid", -1);
  }).toThrow();
  const first = journal.start(id, "first", 100, 10);
  if (!first) throw new Error("Missing lease");
  journal.finish(id, first, {}, "retry", 101);
  const second = journal.start(id, "second", 102, 10);
  if (!second) throw new Error("Missing lease");
  journal.finish(
    id,
    second,
    { "x.ts": "export const x = 2;" },
    "ready_for_review",
    103,
  );
  journal.revisePrompt(id, 1, "Revise again", 104);
  expect(journal.read(id).status).toBe("exhausted");
  expect(journal.read(id).attempts).toBe(2);
  expect(journal.start(id, "third", 105, 10)).toBeNull();
});

test("separate runs share committed cooldowns without consuming waiting attempts", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id, path } = fixture();
  const other = journal.create(request, config, {
    "x.ts": "export const x = ;",
    "context.txt": "fixed",
  });
  const token = journal.start(id, "quota", 100, 100);
  if (!token) throw new Error("No lease");
  journal.fail(id, token, new Failure("quota", 90000), 101);
  const reopened = connect(path);
  expect(reopened.start(other, "waiting", 102, 10)).toBeNull();
  expect(reopened.read(other)).toMatchObject({
    status: "waiting_retry",
    attempts: 0,
    dueAt: 90101,
  });
  expect(reopened.health()).toEqual({ "provider:fixture": { until: 90101 } });
  expect(reopened.start(other, "still-waiting", 90100, 10)).toBeNull();
  expect(reopened.start(other, "available", 90101, 10)?.epoch).toBe(1);
  expect(reopened.read(other).attempts).toBe(1);
});

test("shared cooldown permits only eligible fallback and preserves explicit pins", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const base = config.candidates[0];
  if (!base) throw new Error("Missing candidate");
  const expanded = configSchema.parse({
    candidates: [
      base,
      { ...base, name: "other", provider: "other", model: "other" },
    ],
  });
  const files = { "x.ts": "export const x = ;", "context.txt": "fixed" };
  const fallback = journal.create(request, expanded, files);
  const pinned = journal.create(
    { ...request, task: { ...request.task, model: "offline" } },
    expanded,
    files,
  );
  const token = journal.start(id, "quota", 100, 100);
  if (!token) throw new Error("No lease");
  journal.fail(id, token, new Failure("quota"), 101);
  expect(
    journal.start(fallback, "fallback", 102, 10)?.selection.candidate.provider,
  ).toBe("other");
  expect(journal.start(pinned, "pinned", 102, 10)).toBeNull();
  expect(journal.read(pinned).attempts).toBe(0);
});

test("concurrent issued failures retain the longest cooldown across runs and cancellation", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id, path } = fixture();
  const other = journal.create(request, config, {
    "x.ts": "export const x = ;",
    "context.txt": "fixed",
  });
  const a = journal.start(id, "a", 100, 100);
  const b = journal.start(other, "b", 100, 100);
  if (!a || !b) throw new Error("No leases");
  journal.fail(id, a, new Failure("quota", 90000), 101);
  connect(path).fail(other, b, new Failure("outage"), 102);
  journal.cancel(id, 103);
  expect(journal.health()["provider:fixture"]?.until).toBe(90101);
  expect(journal.read(other).dueAt).toBe(90101);
});

test("read-only journal inspection cannot create or mutate persistent runs", () => {
  const { journal, id, path } = fixture();
  const readonly = new CodingJournal(path, { readOnly: true });
  handles.push(readonly);
  expect(readonly.read(id)).toEqual(journal.read(id));
  expect(readonly.health()).toEqual({});
  expect(() => {
    readonly.cancel(id, 100);
  }).toThrow();
  expect(journal.read(id).status).toBe("ready");
  expect(
    () => new CodingJournal(join(path, "missing.sqlite"), { readOnly: true }),
  ).toThrow();
});

test("read-only inspection keeps one consistent snapshot while writers commit", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id, path } = fixture();
  const reader = new CodingJournal(path, { readOnly: true });
  handles.push(reader);
  const token = journal.start(id, "writer", 100, 100);
  if (!token) throw new Error("Missing lease");
  journal.fail(id, token, new Failure("quota"), 101);
  expect(reader.read(id).status).toBe("ready");
  expect(reader.health()).toEqual({});
  reader.close();
  const next = new CodingJournal(path, { readOnly: true });
  handles.push(next);
  expect(next.read(id).status).toBe("waiting_retry");
  expect(next.health()["provider:fixture"]?.until).toBe(30101);
});

test("versioned context replacement preserves old facts, permissions and consumed attempts", () => {
  const { journal, id, path } = fixture();
  const initial = {
    requirements: ["Keep exports"],
    facts: ["Compiler uses strict mode"],
  };
  journal.revisePrompt(id, 1, request.task.prompt, 100, initial);
  const token = journal.start(id, "first", 101, 100);
  if (!token) throw new Error("No lease");
  journal.finish(
    id,
    token,
    { "x.ts": "export const x = 1;" },
    "ready_for_review",
    102,
  );
  const before = journal.read(id);
  const updated = {
    requirements: ["Keep exports", "noUncheckedIndexedAccess is enabled"],
    facts: ["Node 24"],
  };
  journal.revisePrompt(id, 2, request.task.prompt, 103, updated);
  const after = connect(path).read(id);
  expect(after.request.context).toEqual(updated);
  expect(after.revisions[1]?.context).toEqual(initial);
  expect(after.attempts).toBe(1);
  expect(after.status).toBe("ready");
  expect(after.config).toEqual(before.config);
  journal.revisePrompt(id, 3, "New prompt, same project policy", 104);
  expect(journal.read(id).request.context).toEqual(updated);
  expect(() => {
    journal.revisePrompt(id, 4, "Invalid policy", 105, {
      requirements: [],
      facts: [],
      allowMetered: true,
    });
  }).toThrow();
  expect(journal.read(id).revision).toBe(4);
});

test("attempt measurements are fenced, survive reopen and cannot be rewritten by a stale denial", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id, path } = fixture();
  const token = journal.start(id, "owner", 1000, 100);
  if (!token) throw new Error("No token");
  expect(
    journal.finish(
      id,
      token,
      { "x.ts": "export const x=1;" },
      "ready_for_review",
      1001,
      { elapsedMs: 10, estimatedUsd: 2 },
    ),
  ).toBe(true);
  const saved = journal.read(id).measurements;
  expect(saved).toEqual([
    {
      epoch: 1,
      candidate: "test",
      effort: "low",
      completedAt: 1001,
      outcome: "ready_for_review",
      elapsedMs: 10,
      estimatedUsd: null,
    },
  ]);
  expect(connect(path).read(id).measurements).toEqual(saved);
  expect(
    journal.finish(id, token, {}, "blocked", 1002, {
      elapsedMs: 99,
      estimatedUsd: null,
    }),
  ).toBe(false);
  expect(journal.read(id).measurements).toEqual(saved);
  expect(
    journal.fail(id, token, new Failure("policy"), 1003, {
      elapsedMs: 99,
      estimatedUsd: 3,
    }),
  ).toBe(true);
  expect(journal.read(id).measurements).toEqual(saved);
});

test("expired attempt measurements cannot be published and invalid telemetry cannot suppress a policy denial", async () => {
  const { Failure } = await import("../src/failures.js");
  const { journal, id } = fixture();
  const token = journal.start(id, "owner", 1000, 10);
  if (!token) throw new Error("No token");
  expect(
    journal.finish(
      id,
      token,
      { "x.ts": "export const x=1;" },
      "ready_for_review",
      1011,
      { elapsedMs: 10, estimatedUsd: null },
    ),
  ).toBe(false);
  expect(
    journal.fail(id, token, new Failure("policy"), 1011, {
      elapsedMs: NaN,
      estimatedUsd: 1,
    }),
  ).toBe(true);
  expect(journal.read(id)).toMatchObject({ status: "blocked" });
  expect(journal.read(id).measurements).toBeUndefined();
  const active = fixture();
  const live = active.journal.start(active.id, "live", 2000, 100);
  if (!live) throw new Error("Missing live token");
  expect(
    active.journal.fail(active.id, live, new Failure("policy"), 2001, {
      elapsedMs: NaN,
      estimatedUsd: 1,
    }),
  ).toBe(true);
  expect(active.journal.read(active.id).status).toBe("blocked");
  expect(active.journal.read(active.id).measurements).toBeUndefined();
});

test("legacy dispatches keep their snapshot hash when no measurement fields existed", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { createHash } = await import("node:crypto");
  const { journal, id, path } = fixture();
  journal.start(id, "owner", 1000, 10);
  const legacy = journal.read(id);
  for (const dispatch of legacy.dispatches) delete dispatch.effort;
  const body = JSON.stringify(legacy);
  const hash = createHash("sha256").update(body).digest("hex");
  const db = new DatabaseSync(path);
  try {
    db.prepare("UPDATE runs SET body=?,hash=? WHERE id=?").run(body, hash, id);
  } finally {
    db.close();
  }
  expect(JSON.stringify(connect(path).read(id))).toBe(body);
});
