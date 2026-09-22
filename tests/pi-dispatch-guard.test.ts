import { test, expect, vi } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodingJournal } from "../src/coding-journal.js";
import { workflowCli } from "../src/workflow-cli.js";
import { relentlessCommand } from "../src/pi-extension.js";
import { Failure } from "../src/failures.js";
import type { Route } from "../src/router.js";
import { processWorker } from "../src/process-worker.js";
vi.mock("../src/process-worker.js", () => ({
  processWorker: vi.fn(() =>
    Promise.reject(new Error("No inference in tests")),
  ),
}));
test("Pi dispatch guard runs before a saved workflow can invoke a worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-guard-"));
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const task = { id: "x", prompt: "x", minQuality: 1, effort: "low" };
  const config = {
    candidates: [
      {
        name: "cloud",
        provider: "cloud",
        model: "one",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    config,
    { "x.ts": "export {};" },
  );
  const second = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    config,
    { "x.ts": "export {};" },
  );
  const third = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    config,
    { "x.ts": "export {};" },
  );
  coding.close();
  const spec = join(root, "workflow.json");
  await writeFile(
    spec,
    JSON.stringify({ review: { task, config }, maxReviewPairs: 1 }),
  );
  await workflowCli(["create", id, spec], root);
  const guard = vi.fn<
    (role: "coder" | "reviewer", selection: Route) => Promise<void>
  >(() => Promise.reject(new Failure("permission")));
  const result = await workflowCli(["resume", id], root, {
    beforeDispatch: guard,
  });
  expect(guard).toHaveBeenCalledTimes(1);
  expect(guard.mock.calls[0]?.[0]).toBe("coder");
  expect(processWorker).not.toHaveBeenCalled();
  expect(result.phase).toBe("blocked");
  await workflowCli(["create", second, spec], root);
  await mkdir(join(root, ".pi"));
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      relentless: { version: 1, routing: config, roles: { coder: ["cloud"] } },
    }),
  );
  const notify = vi.fn();
  await relentlessCommand(`resume ${second}`, {
    cwd: root,
    isProjectTrusted: () => true,
    ui: { notify },
    models: () => ({
      available: [{ provider: "cloud", model: "one", efforts: ["low"] }],
      scoped: [{ provider: "other", model: "one" }],
    }),
  });
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('"phase": "blocked"'),
    "info",
  );
  expect(processWorker).not.toHaveBeenCalled();
  await workflowCli(["create", third, spec], root);
  let trustChecks = 0;
  await relentlessCommand(`resume ${third}`, {
    cwd: root,
    isProjectTrusted: () => ++trustChecks < 3,
    ui: { notify },
    models: () => ({
      available: [{ provider: "cloud", model: "one", efforts: ["low"] }],
      scoped: [],
    }),
  });
  expect(processWorker).not.toHaveBeenCalled();
});

test("reviewer dispatch is guarded under the reviewer role after coding", async () => {
  vi.mocked(processWorker)
    .mockReset()
    .mockResolvedValueOnce(
      JSON.stringify({
        edits: [{ path: "x.ts", content: "export const x = 2;" }],
      }),
    );
  const root = await mkdtemp(join(tmpdir(), "pi-review-guard-"));
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const task = {
    id: "x",
    prompt: "Export x equal to 2",
    minQuality: 1,
    effort: "low",
  };
  const candidate = (name: string) => ({
    name,
    provider: name,
    model: name,
    billing: "subscription",
    enabled: true,
    quality: 1,
    preference: 1,
    efforts: ["low"],
  });
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    { candidates: [candidate("author")] },
    { "x.ts": "export const x = 1;" },
  );
  coding.close();
  const spec = join(root, "workflow.json");
  await writeFile(
    spec,
    JSON.stringify({
      review: {
        task,
        config: { candidates: [candidate("review-a"), candidate("review-b")] },
      },
      maxReviewPairs: 1,
    }),
  );
  await workflowCli(["create", id, spec], root);
  const roles: string[] = [];
  const result = await workflowCli(["resume", id], root, {
    beforeDispatch: (role) => {
      roles.push(role);
      return role === "reviewer"
        ? Promise.reject(new Failure("permission"))
        : Promise.resolve();
    },
  });
  expect(roles).toEqual(["coder", "reviewer"]);
  expect(processWorker).toHaveBeenCalledTimes(1);
  expect(result.phase).toBe("blocked");
});

test("shutdown during dispatch policy resolution never starts a worker", async () => {
  vi.mocked(processWorker).mockClear();
  const root = await mkdtemp(join(tmpdir(), "pi-abort-guard-"));
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const task = { id: "x", prompt: "x", minQuality: 1, effort: "low" };
  const config = {
    candidates: [
      {
        name: "cloud",
        provider: "cloud",
        model: "one",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    config,
    { "x.ts": "export {};" },
  );
  coding.close();
  const spec = join(root, "workflow.json");
  await writeFile(
    spec,
    JSON.stringify({ review: { task, config }, maxReviewPairs: 1 }),
  );
  await workflowCli(["create", id, spec], root);
  const shutdown = new AbortController();
  await workflowCli(["resume", id], root, {
    signal: shutdown.signal,
    beforeDispatch: () => {
      shutdown.abort();
      return Promise.resolve();
    },
  });
  expect(processWorker).not.toHaveBeenCalled();
});

test("shutdown aborts an active worker and does not dispatch a replacement", async () => {
  vi.mocked(processWorker).mockClear();
  const root = await mkdtemp(join(tmpdir(), "pi-abort-guard-"));
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const task = { id: "x", prompt: "x", minQuality: 1, effort: "low" };
  const config = {
    candidates: [
      {
        name: "cloud",
        provider: "cloud",
        model: "one",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 1,
    },
    config,
    { "x.ts": "export {};" },
  );
  coding.close();
  const spec = join(root, "workflow.json");
  await writeFile(
    spec,
    JSON.stringify({ review: { task, config }, maxReviewPairs: 1 }),
  );
  await workflowCli(["create", id, spec], root);
  const shutdown = new AbortController();
  vi.mocked(processWorker).mockImplementationOnce((job, signal) => {
    expect(job.goalId).toBe(id);
    shutdown.abort();
    expect(signal.aborted).toBe(true);
    return Promise.reject(new Failure("interrupted"));
  });
  const result = await workflowCli(["resume", id], root, {
    signal: shutdown.signal,
  });
  expect(processWorker).toHaveBeenCalledTimes(1);
  expect(result.phase).toBe("blocked");
});
