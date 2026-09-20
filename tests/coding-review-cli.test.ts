import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
vi.mock("../src/process-worker.js", () => ({ processWorker: vi.fn() }));
import { processWorker } from "../src/process-worker.js";
import { codingCli } from "../src/coding-cli.js";
import { CodingJournal } from "../src/coding-journal.js";

test("review command persists exact-checkpoint evidence without changing source or coding status", async () => {
  const root = await mkdtemp(join(tmpdir(), "coding-review-cli-"));
  try {
    const c = (provider: string) => ({
      name: provider,
      provider,
      model: provider,
      enabled: true,
      billing: "subscription",
      quality: 1,
      preference: 1,
      efforts: ["low"],
    });
    const j = new CodingJournal(join(root, ".harness", "coding.sqlite"));
    const task = {
      id: "repair",
      prompt: "Keep x",
      minQuality: 1,
      effort: "low",
    };
    const id = j.create(
      {
        sourceRoot: root,
        task,
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 2,
      },
      { candidates: [c("author")] },
      { "x.ts": "x" },
    );
    const token = j.start(id, "author", 100, 100);
    if (!token) throw new Error("No lease");
    j.finish(
      id,
      token,
      { "x.ts": "export const x = 1;" },
      "ready_for_review",
      101,
    );
    j.close();
    const file = join(root, "review.json");
    await writeFile(
      file,
      JSON.stringify({
        task: { ...task, id: "review" },
        config: { candidates: [c("a"), c("b")] },
      }),
    );
    vi.mocked(processWorker).mockResolvedValue(
      '{"verdict":"no_findings","findings":[]}',
    );
    const result = await codingCli(["review", id, file], root);
    expect(result.reviewStatus).toBe("reviewed");
    expect(result.status).toBe("ready_for_review");
    expect(result.artifactRevision).toBe(1);
    if (!result.directory) throw new Error("Missing artifact");
    const report: unknown = JSON.parse(
      await readFile(join(result.directory, "report.json"), "utf8"),
    );
    expect(report).toMatchObject({ id, revision: 1, status: "reviewed" });
    expect(processWorker).toHaveBeenCalledTimes(2);
  } finally {
    vi.clearAllMocks();
    await rm(root, { recursive: true, force: true });
  }
});
