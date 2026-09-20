import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { Failure } from "../src/failures.js";
import { codingCli } from "../src/coding-cli.js";
test("creates and inspects a durable coding run without inference", async () => {
  const root = await mkdtemp(join(tmpdir(), "coding-cli-test-"));
  try {
    await writeFile(join(root, "x.ts"), "export const x = ;");
    const config = join(root, "config.json"),
      request = join(root, "request.json");
    await writeFile(
      config,
      JSON.stringify({
        candidates: [
          {
            name: "f",
            provider: "fixture",
            model: "offline",
            billing: "subscription",
            enabled: true,
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      }),
    );
    await writeFile(
      request,
      JSON.stringify({
        sourceRoot: root,
        task: { id: "repair", prompt: "Repair", minQuality: 1, effort: "low" },
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 2,
      }),
    );
    const created = await codingCli(["create", config, request], root);
    expect(created.status).toBe("ready");
    expect(created.attempts).toBe(0);
    expect(await codingCli(["status", created.id], root)).toEqual(created);
    const journal = new CodingJournal(join(root, ".harness", "coding.sqlite"));
    const token = journal.start(created.id, "cli-test", 100, 10);
    if (!token) throw new Error("No lease");
    journal.fail(created.id, token, new Failure("quota", 60000), 101);
    journal.close();
    const status = await codingCli(["status", created.id], root);
    expect(status.retryAt).toBe(60101);
    expect(status.lastFailure).toBe("quota");
    const update = join(root, "update.json");
    await writeFile(
      update,
      JSON.stringify({
        expectedRevision: 1,
        prompt: "Preserve API compatibility while repairing.",
        context: {
          requirements: ["noUncheckedIndexedAccess"],
          facts: ["Node 24"],
        },
      }),
    );
    const revised = await codingCli(["revise", created.id, update], root);
    expect(revised.revision).toBe(2);
    const inspection = new CodingJournal(
      join(root, ".harness", "coding.sqlite"),
      { readOnly: true },
    );
    try {
      expect(inspection.read(created.id).request.context).toEqual({
        requirements: ["noUncheckedIndexedAccess"],
        facts: ["Node 24"],
      });
    } finally {
      inspection.close();
    }
    expect(revised.retryAt).toBe(status.retryAt);
    expect(revised.attempts).toBe(1);
    expect(revised.lastFailure).toBe("quota");
    await expect(
      codingCli(["revise", created.id, update], root),
    ).rejects.toThrow();
    const cancelled = await codingCli(["cancel", created.id], root);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.retryAt).toBeNull();
    expect(cancelled.cancelledAt).toBeTypeOf("number");
    expect(cancelled.attempts).toBe(1);
    expect(await codingCli(["cancel", created.id], root)).toEqual(cancelled);
    await expect(
      codingCli(["status", created.id, "unexpected"], root),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
