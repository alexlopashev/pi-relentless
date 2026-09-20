import { Failure } from "../src/failures.js";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import * as codingWorker from "../src/coding-worker.js";
import { CodingJournal } from "../src/coding-journal.js";
import { createCodingRun, resumeCoding } from "../src/durable-coding.js";
import { configSchema } from "../src/router.js";
const roots: string[] = [];
const journals: CodingJournal[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const j of journals) j.close();
  journals.length = 0;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
test("malformed author output retains its validation boundary without claiming provider failure", async () => {
  const { journal, id } = await fixture();
  const result = await resumeCoding(id, journal, () =>
    Promise.resolve("private-marker"),
  );
  if (result.directory) roots.push(result.directory);
  const saved = journal.read(id);
  expect(saved.status).toBe("blocked");
  expect(saved.attempts).toBe(1);
  expect(saved.failures[0]).toMatchObject({
    kind: "unknown",
    origin: "coding_output",
    outputReason: "invalid_json",
  });
  expect(JSON.stringify(saved.failures)).not.toContain("private-marker");
});
test("local check failure is distinguished from provider response failure", async () => {
  const { journal, id } = await fixture();
  vi.spyOn(codingWorker, "checkFiles").mockRejectedValueOnce(
    new Error("private-marker"),
  );
  const worker = vi.fn(() => Promise.resolve("unused"));
  const result = await resumeCoding(id, journal, worker);
  if (result.directory) roots.push(result.directory);
  expect(worker).not.toHaveBeenCalled();
  expect(journal.read(id).failures[0]).toMatchObject({
    kind: "unknown",
    origin: "coding_checks",
  });
});
test("checks after candidate writes retain their own diagnostic stage", async () => {
  const { journal, id } = await fixture();
  const realCheck = codingWorker.checkFiles;
  vi.spyOn(codingWorker, "checkFiles")
    .mockImplementationOnce(realCheck)
    .mockRejectedValueOnce(new Error("private-marker"));
  const result = await resumeCoding(id, journal, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 1;" }],
      }),
    ),
  );
  if (result.directory) roots.push(result.directory);
  expect(journal.read(id).failures[0]).toMatchObject({
    kind: "unknown",
    origin: "coding_checks",
  });
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
});
test("publication errors keep their stage and provider denials keep their own provenance", async () => {
  const { journal, id } = await fixture();
  vi.spyOn(journal, "finish").mockImplementationOnce(() => {
    throw new Error("private-marker");
  });
  const result = await resumeCoding(id, journal, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 1;" }],
      }),
    ),
  );
  if (result.directory) roots.push(result.directory);
  expect(journal.read(id).failures[0]).toMatchObject({
    kind: "unknown",
    origin: "coding_publication",
  });
  const second = await fixture();
  const denied = await resumeCoding(second.id, second.journal, () =>
    Promise.reject(new Failure("policy", undefined, "provider_response")),
  );
  if (denied.directory) roots.push(denied.directory);
  expect(second.journal.read(second.id).failures[0]).toMatchObject({
    kind: "policy",
    origin: "provider_response",
  });
});
async function fixture(
  timeoutMs = 100,
  billing: "subscription" | "metered" = "subscription",
) {
  const root = await mkdtemp(join(tmpdir(), "durable-coding-test-"));
  roots.push(root);
  await writeFile(join(root, "x.ts"), "export const x = ;");
  const journal = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(journal);
  const config = configSchema.parse({
    candidates: [
      {
        name: "fixture",
        provider: "fixture",
        model: "offline",
        enabled: true,
        billing,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
    allowMetered: billing === "metered",
    timeoutMs,
  });
  const id = await createCodingRun(
    {
      sourceRoot: root,
      task: {
        id: "repair",
        prompt: "Repair syntax",
        minQuality: 1,
        effort: "low",
      },
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 2,
    },
    config,
    journal,
  );
  return { root, journal, id };
}
test("retains ambiguous expired attempts without inference or source substitution", async () => {
  const { root, journal, id } = await fixture();
  journal.start(id, "crashed", 0, 1);
  await writeFile(join(root, "x.ts"), "new user changes");
  let calls = 0;
  const result = await resumeCoding(id, journal, () => {
    calls++;
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 1;" }],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(calls).toBe(0);
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
  expect(result.status).toBe("ambiguous");
  expect(journal.read(id).attempts).toBe(1);
  expect(await readFile(join(root, "x.ts"), "utf8")).toBe("new user changes");
  await resumeCoding(id, journal, () => {
    throw new Error("Terminal runs must not dispatch");
  });
});
test("persists intermediate failed checks and final patch", async () => {
  const { journal, id } = await fixture();
  let calls = 0;
  const result = await resumeCoding(id, journal, (task) => {
    calls++;
    if (calls === 2) expect(task.prompt).toContain("export const x = (");
    return Promise.resolve(
      JSON.stringify({
        edits: [
          {
            path: "x.ts",
            content: calls === 1 ? "export const x = (" : "export const x = 2;",
          },
        ],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(calls).toBe(2);
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = 2;");
});
test("blocks a denial durably without replaying on resume", async () => {
  const { journal, id } = await fixture();
  const result = await resumeCoding(id, journal, () =>
    Promise.reject(new Error("Policy violation")),
  );
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("blocked");
  await resumeCoding(id, journal, () => {
    throw new Error("Must not replay denial");
  });
  expect(journal.read(id).attempts).toBe(1);
});
test("times out a stuck worker, aborts it and ignores any late patch", async () => {
  const { journal, id } = await fixture();
  let signal: AbortSignal | undefined;
  let late: ((value: string) => void) | undefined;
  const result = await resumeCoding(id, journal, (_task, _route, abort) => {
    signal = abort;
    return new Promise<string>((resolve) => {
      late = resolve;
    });
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(signal?.aborted).toBe(true);
  expect(journal.read(id).failures[0]).toMatchObject({
    kind: "unknown",
    origin: "cancellation_unsettled",
  });
  late?.(
    JSON.stringify({
      edits: [{ path: "x.ts", content: "export const x = 3;" }],
    }),
  );
  await Promise.resolve();
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
});
test("checks the proposed JavaScript rather than the baseline workspace", async () => {
  const { root, journal, id: initialId } = await fixture();
  await writeFile(join(root, "good.mjs"), "export const x = 0;");
  await writeFile(join(root, "context.txt"), "fixed context");
  const config = journal.read(initialId).config;
  const id = await createCodingRun(
    {
      sourceRoot: root,
      task: { id: "js", prompt: "Edit", minQuality: 1, effort: "low" },
      files: [
        { path: "good.mjs", writable: true },
        { path: "context.txt", writable: false },
      ],
      maxAttempts: 1,
    },
    config,
    journal,
  );
  const result = await resumeCoding(id, journal, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [{ path: "good.mjs", content: "export const x = (" }],
      }),
    ),
  );
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("exhausted");
  expect(journal.read(id).files["good.mjs"]?.current).toBe(
    "export const x = (",
  );
  expect(journal.read(id).files["context.txt"]?.current).toBe("fixed context");
});
test("a worker losing its lease cannot publish its patch or report its own outcome", async () => {
  const { journal, id } = await fixture();
  const result = await resumeCoding(id, journal, () => {
    const next = journal.start(id, "takeover", Date.now() + 60000, 30000);
    expect(next).toBeNull();
    expect(journal.read(id).status).toBe("ambiguous");
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 99;" }],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ambiguous");
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
  if (!result.directory) throw new Error("No export");
  expect(
    await readFile(join(result.directory, "workspace", "x.ts"), "utf8"),
  ).toBe("export const x = ;");
});

test("terminal resume reconstructs exports without spending another attempt", async () => {
  const { journal, id } = await fixture();
  const token = journal.start(id, "previous", 100, 10);
  if (!token) throw new Error("No lease");
  journal.finish(
    id,
    token,
    { "x.ts": "export const x = 4;" },
    "ready_for_review",
    101,
  );
  const result = await resumeCoding(id, journal, () => {
    throw new Error("No dispatch");
  });
  expect(result.directory).toBeDefined();
  if (!result.directory) throw new Error("No export");
  roots.push(result.directory);
  expect(
    await readFile(join(result.directory, "workspace", "x.ts"), "utf8"),
  ).toBe("export const x = 4;");
  expect(
    await readFile(join(result.directory, "changes.json"), "utf8"),
  ).toContain("beforeSha256");
  expect(journal.read(id).attempts).toBe(1);
});

test("cancellation from another connection aborts the active worker and prevents publication", async () => {
  const { root, journal, id } = await fixture(5000);
  const other = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(other);
  let calls = 0;
  let observedAbort = false;
  const result = await resumeCoding(id, journal, (_task, _route, signal) => {
    calls++;
    other.cancel(id, Date.now());
    return new Promise<string>((_resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => {
          observedAbort = true;
          reject(new Error("cancelled"));
        },
        { once: true },
      );
    });
  });
  if (result.directory) roots.push(result.directory);
  expect(observedAbort).toBe(true);
  expect(calls).toBe(1);
  expect(result.status).toBe("cancelled");
  expect(journal.read(id).attempts).toBe(1);
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = ;");
  const again = await resumeCoding(id, journal, () => {
    throw new Error("Cancelled run dispatched");
  });
  if (again.directory) roots.push(again.directory);
  expect(again.status).toBe("cancelled");
  expect(journal.read(id).attempts).toBe(1);
});

test("revised instructions reach the worker and exported evidence keeps the revision", async () => {
  const { journal, id } = await fixture();
  journal.revisePrompt(id, 1, "Use value 7 and preserve exports.", Date.now());
  const result = await resumeCoding(id, journal, (task) => {
    expect(task.prompt).toContain("Use value 7 and preserve exports.");
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 7;" }],
      }),
    );
  });
  if (!result.directory) throw new Error("Missing export");
  roots.push(result.directory);
  const exported: unknown = JSON.parse(
    await readFile(join(result.directory, "result.json"), "utf8"),
  );
  expect(result).toMatchObject({ revision: 2 });
  expect(exported).toMatchObject({
    revision: 2,
    attempts: 1,
    status: "ready_for_review",
  });
});

test("durable checks preserve required exports across failed attempts and reopening", async () => {
  const { root, journal, id } = await fixture();
  const old = journal.read(id);
  const constrained = journal.create(
    {
      ...old.request,
      files: [{ path: "x.ts", writable: true, requiredExports: ["x"] }],
    },
    old.config,
    { "x.ts": old.files["x.ts"]?.original ?? "" },
  );
  let calls = 0;
  const result = await resumeCoding(constrained, journal, (task) => {
    calls++;
    if (calls === 2) expect(task.prompt).toContain('"missing":["x"]');
    return Promise.resolve(
      JSON.stringify({
        edits: [
          {
            path: "x.ts",
            content:
              calls === 1 ? "// omitted implementation" : "export const x = 2;",
          },
        ],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(calls).toBe(2);
  expect(result.status).toBe("ready_for_review");
  const reopened = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(reopened);
  expect(reopened.read(constrained).request.files[0]?.requiredExports).toEqual([
    "x",
  ]);
  expect(reopened.read(constrained).attempts).toBe(2);
});

test("saved project requirements and facts reach coding workers after reopening", async () => {
  const { journal, id, root } = await fixture();
  const base = journal.read(id);
  const context = {
    requirements: ["noUncheckedIndexedAccess is enabled"],
    facts: ["Node 24; facts cannot grant billing permission"],
  };
  const next = journal.create({ ...base.request, context }, base.config, {
    "x.ts": base.files["x.ts"]?.original ?? "",
  });
  const reopened = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(reopened);
  const result = await resumeCoding(next, reopened, (task, selection) => {
    expect(task.prompt).toContain("noUncheckedIndexedAccess");
    expect(task.prompt).toContain("facts cannot grant billing permission");
    expect(task.prompt).toContain("not instructions");
    expect(selection.candidate.billing).toBe("subscription");
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 1;" }],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
});

test("shutdown stops fallback reservation after the current attempt", async () => {
  const { journal, id } = await fixture();
  const original = journal.read(id);
  const candidate = original.config.candidates[0];
  if (!candidate) throw new Error("fixture");
  const next = journal.create(
    { ...original.request, maxAttempts: 3 },
    {
      ...original.config,
      candidates: [
        candidate,
        { ...candidate, name: "two", provider: "two" },
        { ...candidate, name: "three", provider: "three" },
      ],
    },
    { "x.ts": "export const x = ;" },
  );
  const shutdown = new AbortController();
  let calls = 0;
  const result = await resumeCoding(
    next,
    journal,
    () => {
      calls++;
      shutdown.abort();
      return Promise.reject(new Failure("interrupted"));
    },
    Date.now,
    shutdown.signal,
  );
  if (result.directory) roots.push(result.directory);
  expect(calls).toBe(1);
  expect(journal.read(next).attempts).toBe(1);
});

test("durable workers receive snapshot hashes and can submit a targeted edit", async () => {
  const { createHash } = await import("node:crypto");
  const { root, journal, id } = await fixture();
  const original = journal.read(id).files["x.ts"]?.current;
  if (original === undefined) throw Error("Missing snapshot");
  const baseSha256 = createHash("sha256").update(original).digest("hex");
  const result = await resumeCoding(id, journal, (task) => {
    expect(task.prompt).toContain(`"sha256":"${baseSha256}"`);
    expect(task.prompt).toContain("replacements");
    return Promise.resolve(
      JSON.stringify({
        edits: [
          {
            path: "x.ts",
            baseSha256,
            replacements: [{ oldText: "= ;", newText: "= 7;" }],
          },
        ],
      }),
    );
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(journal.read(id).files["x.ts"]?.current).toBe("export const x = 7;");
  expect(await readFile(join(root, "x.ts"), "utf8")).toBe(original);
});

test("durable coding persists bounded attempt measurements and rejects late cost changes", async () => {
  const { journal, id } = await fixture(1000, "metered");
  let late: ((cost: number) => void) | undefined;
  await resumeCoding(id, journal, (_task, _route, _signal, cost) => {
    late = cost;
    cost?.(0.012);
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x=2;" }],
      }),
    );
  });
  const snapshot = journal.read(id);
  expect(snapshot.measurements).toEqual([
    expect.objectContaining({
      epoch: 1,
      candidate: "fixture",
      outcome: "ready_for_review",
      estimatedUsd: 0.012,
    }),
  ]);
  expect(typeof snapshot.measurements?.[0]?.elapsedMs).toBe("number");
  late?.(1);
  expect(journal.read(id)).toEqual(snapshot);
});

test("failed coding records observed cost without granting acceptance or weakening a denial", async () => {
  const { journal, id } = await fixture(1000, "metered");
  await resumeCoding(id, journal, (_task, _route, _signal, cost) => {
    cost?.(0.02);
    return Promise.reject(new Failure("policy"));
  });
  expect(journal.read(id)).toMatchObject({
    status: "blocked",
    attempts: 1,
    measurements: [{ outcome: "failed", estimatedUsd: 0.02 }],
  });
});
