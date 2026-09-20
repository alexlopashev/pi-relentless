import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { workflowCli } from "../src/workflow-cli.js";
test("CLI persists explicit review budget and rejects extra arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "workflow-cli-"));
  try {
    const coding = new CodingJournal(join(root, ".harness", "coding.sqlite"));
    const task = { id: "x", prompt: "x", minQuality: 1, effort: "low" };
    const config = {
      candidates: [
        {
          name: "a",
          provider: "qwen-token-plan-individual",
          model: "a",
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
      { "x.ts": "x" },
    );
    coding.close();
    const path = join(root, "workflow.json");
    await writeFile(
      path,
      JSON.stringify({ review: { task, config }, maxReviewPairs: 1 }),
    );
    const state = await workflowCli(["create", id, path], root);
    expect(state.maxReviewPairs).toBe(1);
    expect(state.reviewPairsUsed).toBe(0);
    await expect(workflowCli(["run", id], root)).rejects.toThrow("unattended");
    expect(await workflowCli(["status", id], root)).toEqual(state);
    expect(await workflowCli(["status", id], root)).toEqual(state);
    await expect(workflowCli(["create", id, path], root)).rejects.toThrow();
    await expect(workflowCli(["status", id, "extra"], root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
