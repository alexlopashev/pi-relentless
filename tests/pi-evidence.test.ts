import { lstat } from "node:fs/promises";
import { vi } from "vitest";
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { EvaluationCheckpoint } from "../src/evaluation-checkpoint.js";
import { evaluate } from "../src/evaluation.js";
import { configSchema } from "../src/router.js";
import { piProjectConfigSchema } from "../src/pi-project-config.js";
import { loadPiEvidence } from "../src/pi-evidence.js";
const config = configSchema.parse({
  allowMetered: true,
  candidates: [
    {
      name: "fixture",
      provider: "fixture",
      model: "one",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const suite = {
  workload: "json-fixture",
  effort: "low",
  repeats: 2,
  cases: [
    {
      id: "a",
      prompt: "a",
      acceptance: { kind: "json", equals: { ok: true } },
    },
    {
      id: "b",
      prompt: "b",
      acceptance: { kind: "json", equals: { ok: true } },
    },
  ],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-evidence-"));
  const directory = join(root, ".harness/evaluations/one");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "request.json"),
    JSON.stringify({ suite, config }),
  );
  const checkpoint = new EvaluationCheckpoint(
    join(directory, "checkpoint.sqlite"),
    { suite, config },
  );
  const project = piProjectConfigSchema.parse({
    version: 1,
    routing: { ...config, allowMetered: false },
    roles: { coder: ["fixture"] },
    evidence: { evaluations: [".harness/evaluations/one"] },
  });
  return { root, directory, checkpoint, project };
}
test("loads complete checked trials including failures, without adopting evaluation permissions", async () => {
  const f = await fixture();
  try {
    await evaluate(
      suite,
      config,
      (task) =>
        Promise.resolve(task.prompt === "a" ? '{"ok":true}' : '{"ok":false}'),
      Date.now,
      () => undefined,
      f.checkpoint,
    );
    const loaded = await loadPiEvidence(f.root, f.project);
    expect(loaded.routing.observations).toHaveLength(4);
    expect(
      loaded.routing.observations?.filter((r) => !r.accepted),
    ).toHaveLength(2);
    expect(loaded.routing.allowMetered).toBe(false);
    expect(f.project.routing.observations).toBeUndefined();
  } finally {
    f.checkpoint.close();
  }
});
test("rejects missing, incomplete, pending and contract-mismatched journals", async () => {
  const f = await fixture();
  try {
    await expect(loadPiEvidence(f.root, f.project)).rejects.toThrow();
    await evaluate(
      suite,
      config,
      () => Promise.resolve('{"ok":true}'),
      Date.now,
      () => undefined,
      f.checkpoint,
    );
    await writeFile(
      join(f.directory, "request.json"),
      JSON.stringify({ suite: { ...suite, workload: "changed" }, config }),
    );
    await expect(loadPiEvidence(f.root, f.project)).rejects.toThrow();
    await expect(
      loadPiEvidence(f.root, {
        ...f.project,
        evidence: { evaluations: [".harness/evaluations/missing"] },
      }),
    ).rejects.toThrow();
  } finally {
    f.checkpoint.close();
  }
});
test("rejects traversal and symlinked evidence directories", async () => {
  const f = await fixture();
  try {
    expect(() =>
      piProjectConfigSchema.parse({
        ...f.project,
        evidence: { evaluations: ["../elsewhere"] },
      }),
    ).toThrow();
    await symlink(f.directory, join(f.root, ".harness/evaluations/link"));
    await expect(
      loadPiEvidence(f.root, {
        ...f.project,
        evidence: { evaluations: [".harness/evaluations/link"] },
      }),
    ).rejects.toThrow();
  } finally {
    f.checkpoint.close();
  }
});

test("pending reservations are excluded without interrupting the running evaluator", async () => {
  const f = await fixture();
  let release: ((value: string) => void) | undefined;
  let started: (() => void) | undefined;
  const reserved = new Promise<void>((resolve) => {
    started = resolve;
  });
  const running = evaluate(
    suite,
    config,
    () =>
      release
        ? Promise.resolve('{"ok":true}')
        : new Promise<string>((resolve) => {
            release = resolve;
            started?.();
          }),
    Date.now,
    () => undefined,
    f.checkpoint,
  );
  try {
    await reserved;
    await expect(loadPiEvidence(f.root, f.project)).rejects.toThrow();
  } finally {
    release?.('{"ok":true}');
    try {
      await running;
    } finally {
      f.checkpoint.close();
    }
  }
});

test("Pi routes using local checked latency evidence and freezes it into new work", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const { CodingJournal } = await import("../src/coding-journal.js");
  const f = await fixture();
  f.checkpoint.close();
  const { rm } = await import("node:fs/promises");
  await rm(join(f.directory, "checkpoint.sqlite"));
  const slow = config.candidates[0];
  if (!slow) throw new Error("Missing fixture");
  const fast = {
    ...slow,
    name: "fast",
    provider: "fast",
    model: "fast",
    preference: 10,
  };
  const evaluationConfig = configSchema.parse({
    ...config,
    candidates: [slow, fast],
  });
  await writeFile(
    join(f.directory, "request.json"),
    JSON.stringify({ suite, config: evaluationConfig }),
  );
  const checkpoint = new EvaluationCheckpoint(
    join(f.directory, "checkpoint.sqlite"),
    { suite, config: evaluationConfig },
  );
  let now = Date.now();
  try {
    const report = await evaluate(
      suite,
      evaluationConfig,
      (_task, selected) => {
        now += selected.candidate.name === "fast" ? 2 : 20;
        return Promise.resolve('{"ok":true}');
      },
      () => now,
      () => undefined,
      checkpoint,
    );
    const reviewers = ["review-a", "review-b"].map((name) => ({
      ...slow,
      name,
      provider: name,
      model: name,
    }));
    const project = {
      ...f.project,
      routing: { ...evaluationConfig, candidates: [slow, fast, ...reviewers] },
      roles: { coder: ["fixture", "fast"], reviewer: ["review-a", "review-b"] },
    };
    await mkdir(join(f.root, ".pi"));
    await writeFile(
      join(f.root, ".pi/settings.json"),
      JSON.stringify({ relentless: project }),
    );
    await writeFile(join(f.root, "x.ts"), "export const x=1;");
    const notices: { message: string; type: string }[] = [];
    const context = {
      cwd: f.root,
      isProjectTrusted: () => true,
      models: () => ({
        available: project.routing.candidates.map((c) => ({
          provider: c.provider,
          model: c.model,
          efforts: c.efforts,
        })),
        scoped: [],
      }),
      ui: {
        notify: (message: string, type: "info" | "error") => {
          notices.push({ message, type });
        },
      },
    };
    const task = {
      id: "measured",
      prompt: "Return checked JSON",
      minQuality: 1,
      effort: "low",
      optimization: {
        workload: suite.workload,
        suiteHash: report.suiteHash,
        caseIds: ["a", "b"],
        metric: "latency",
        minSamples: 3,
      },
    };
    // Fixture clock ran ahead of wall time; route at a controlled matching wall clock.
    const { vi } = await import("vitest");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await relentlessCommand("route coder " + JSON.stringify(task), context);
      expect(JSON.parse(notices[0]?.message ?? "null")).toMatchObject({
        candidate: "fast",
        dispatched: false,
        basis: "local_evaluation_and_configured_evidence",
      });
      await relentlessCommand(
        "create " +
          JSON.stringify({
            task,
            files: [{ path: "x.ts", writable: true }],
            maxAttempts: 1,
            reviewTask: {
              id: "review",
              prompt: "Review",
              minQuality: 1,
              effort: "low",
            },
            maxReviewPairs: 1,
          }),
        context,
      );
      const result: unknown = JSON.parse(notices[1]?.message ?? "null");
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "string"
      )
        throw new Error("Missing created id");
      const journal = new CodingJournal(join(f.root, ".harness/coding.sqlite"));
      try {
        expect(journal.read(result.id).config.observations).toHaveLength(8);
        expect(journal.read(result.id).attempts).toBe(0);
      } finally {
        journal.close();
      }
    } finally {
      clock.mockRestore();
    }
  } finally {
    checkpoint.close();
  }
});

test("rejects a directory swapped to an external symlink after its initial check", async () => {
  const f = await fixture();
  await evaluate(
    suite,
    config,
    () => Promise.resolve('{"ok":true}'),
    Date.now,
    () => undefined,
    f.checkpoint,
  );
  f.checkpoint.close();
  const fs =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  const external = await mkdtemp(join(tmpdir(), "outside-evidence-"));
  await fs.cp(f.directory, external, { recursive: true });
  const expectedDirectory = await fs.realpath(f.directory);
  let swapped = false;
  vi.mocked(lstat).mockImplementation(async (...args) => {
    const stat = await fs.lstat(...args);
    if (String(args[0]) === expectedDirectory && !swapped) {
      swapped = true;
      await fs.rename(f.directory, `${f.directory}-original`);
      await fs.symlink(external, f.directory);
    }
    return stat;
  });
  try {
    await expect(loadPiEvidence(f.root, f.project)).rejects.toThrow();
    expect(swapped).toBe(true);
  } finally {
    vi.mocked(lstat).mockImplementation(fs.lstat);
  }
});
