import { mkdtemp, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, expect, vi } from "vitest";
import { relentlessCommand } from "../src/pi-extension.js";
test("auth inspection and retry cannot initialize missing journals or dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-auth-retry-"));
  try {
    const notify = vi.fn(),
      execute = vi.fn();
    const context = { cwd: root, isProjectTrusted: () => true, ui: { notify } };
    for (const cmd of [
      "review-auth-status id",
      "review-auth-retry id " + "a".repeat(64),
    ]) {
      await relentlessCommand(cmd, context, execute);
      expect(notify).toHaveBeenLastCalledWith(
        expect.stringContaining("authentication recovery unavailable"),
        "error",
      );
    }
    expect(execute).not.toHaveBeenCalled();
    expect(existsSync(join(root, ".harness"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi auth commands expose digest and reopen only explicit matching setup failure", async () => {
  const { CodingJournal } = await import("../src/coding-journal.js");
  const { CodingWorkflows } = await import("../src/coding-workflow.js");
  const { Failure } = await import("../src/failures.js");
  const root = await realpath(await mkdtemp(join(tmpdir(), "pi-auth-valid-")));
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(root, ".harness/workflows.sqlite"),
  );
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
  const task = { id: "x", prompt: "Export x", minQuality: 1, effort: "low" };
  let artifacts: string[] = [];
  try {
    const id = coding.create(
      {
        sourceRoot: root,
        task,
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 1,
      },
      { candidates: [candidate("author")] },
      { "x.ts": "export const x = 0;" },
    );
    workflows.create(
      id,
      coding,
      { task, config: { candidates: [candidate("a"), candidate("b")] } },
      2,
    );
    const blocked = await workflows.resume(id, coding, (_task, selection) =>
      selection.candidate.provider === "author"
        ? Promise.resolve(
            '{"edits":[{"path":"x.ts","content":"export const x = 1;"}]}',
          )
        : Promise.reject(new Failure("auth", undefined, "worker_setup")),
    );
    artifacts = blocked.artifactDirectories;
    const digest = workflows.storageDigest(id);
    const notify = vi.fn(),
      execute = vi.fn();
    const context = { cwd: root, isProjectTrusted: () => true, ui: { notify } };
    await relentlessCommand("review-auth-status " + id, context, execute);
    expect(notify).toHaveBeenLastCalledWith(
      expect.stringContaining(digest),
      "info",
    );
    expect(workflows.storageDigest(id)).toBe(digest);
    await relentlessCommand(
      "review-auth-retry " + id + " " + digest,
      { ...context, isProjectTrusted: () => false },
      execute,
    );
    expect(workflows.storageDigest(id)).toBe(digest);
    await relentlessCommand(
      "review-auth-retry " + id + " " + digest,
      context,
      execute,
    );
    expect(notify).toHaveBeenLastCalledWith(
      expect.stringContaining('"reopened": true'),
      "info",
    );
    expect(workflows.read(id).reviewPairsUsed).toBe(1);
    expect(coding.read(id).attempts).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    workflows.close();
    coding.close();
    for (const path of artifacts)
      await rm(path, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
