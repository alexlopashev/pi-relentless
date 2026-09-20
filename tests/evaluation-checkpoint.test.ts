import { evaluationDirectory } from "../src/evaluation-runtime.js";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { EvaluationCheckpoint } from "../src/evaluation-checkpoint.js";
import { evaluate } from "../src/evaluation.js";
import { configSchema } from "../src/router.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
const config = configSchema.parse({
  candidates: [
    {
      name: "test",
      provider: "fixture",
      model: "test",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const suite = {
  workload: "fixture",
  effort: "low",
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
function file() {
  const root = mkdtempSync(join(tmpdir(), "evaluation-checkpoint-"));
  roots.push(root);
  return join(root, "checkpoint.sqlite");
}
test("reopen retains completed observations and never replays an in-flight reservation", async () => {
  const path = file();
  const checkpoint = new EvaluationCheckpoint(path, { suite, config });
  let calls = 0;
  let release: ((value: string) => void) | undefined;
  const running = evaluate(
    suite,
    config,
    () => {
      calls++;
      if (calls === 2)
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      return Promise.resolve('{"ok":true}');
    },
    Date.now,
    () => undefined,
    checkpoint,
  );
  // Finish the first call and reserve the second, without waiting for the unresolved worker.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const other = new EvaluationCheckpoint(path, { suite, config });
  expect(other.read().report?.observations).toHaveLength(1);
  expect(other.read().pending).not.toBeNull();
  await expect(
    evaluate(
      suite,
      config,
      () => {
        throw new Error("replayed");
      },
      Date.now,
      () => undefined,
      other,
    ),
  ).rejects.toThrow("Ambiguous");
  other.close();
  release?.('{"ok":true}');
  await running;
  checkpoint.close();
});
test("finished evaluations reopen without inference and reject changed contracts", async () => {
  const path = file();
  let cp = new EvaluationCheckpoint(path, { suite, config });
  const result = await evaluate(
    suite,
    config,
    () => Promise.resolve('{"ok":true}'),
    Date.now,
    () => undefined,
    cp,
  );
  cp.close();
  cp = new EvaluationCheckpoint(path, { suite, config });
  expect(
    await evaluate(
      suite,
      config,
      () => {
        throw new Error("replayed");
      },
      Date.now,
      () => undefined,
      cp,
    ),
  ).toEqual(result);
  cp.close();
  expect(
    () =>
      new EvaluationCheckpoint(path, {
        suite: { ...suite, workload: "changed" },
        config,
      }),
  ).toThrow();
});

test("crash after a committed result resumes only remaining cases with the original deadline", async () => {
  const path = file();
  let cp = new EvaluationCheckpoint(path, { suite, config });
  const original = cp.finish.bind(cp);
  vi.spyOn(cp, "finish").mockImplementation((id, report) => {
    original(id, report);
    throw new Error("crash after commit");
  });
  await expect(
    evaluate(
      suite,
      config,
      () => Promise.resolve('{"ok":true}'),
      () => 1000,
      () => undefined,
      cp,
    ),
  ).rejects.toThrow("crash");
  const deadline = cp.read().deadline;
  cp.close();
  cp = new EvaluationCheckpoint(path, { suite, config });
  let calls = 0;
  const result = await evaluate(
    suite,
    config,
    (task) => {
      calls++;
      expect(task.prompt).toBe("b");
      return Promise.resolve('{"ok":true}');
    },
    () => 2000,
    () => undefined,
    cp,
  );
  expect(calls).toBe(1);
  expect(result.observations).toHaveLength(2);
  expect(cp.read().deadline).toBe(deadline);
  cp.close();
});
test("resume past saved deadline spends nothing and cannot change acceptance", async () => {
  const path = file();
  const cp = new EvaluationCheckpoint(path, { suite, config });
  cp.initialize(
    {
      suiteHash: createHash("sha256")
        .update(
          JSON.stringify({ workload: suite.workload, cases: suite.cases }),
        )
        .digest("hex"),
      observations: [],
      stopped: false,
    },
    1000,
  );
  const worker = vi.fn(() => Promise.resolve('{"ok":true}'));
  await expect(
    evaluate(
      { ...suite, workload: "different" },
      config,
      worker,
      () => 2000,
      () => undefined,
      cp,
    ),
  ).rejects.toThrow("contract");
  const result = await evaluate(
    suite,
    config,
    worker,
    () => 2000,
    () => undefined,
    cp,
  );
  expect(result.reason).toBe("deadline");
  expect(worker).not.toHaveBeenCalled();
  cp.close();
});

test("checkpoint refuses forged evidence and reservations beyond the frozen plan", async () => {
  const path = file();
  const cp = new EvaluationCheckpoint(path, { suite, config });
  expect(() => {
    cp.initialize(
      { suiteHash: "a".repeat(64), observations: [], stopped: false },
      1000,
    );
  }).toThrow();
  const result = await evaluate(
    suite,
    config,
    () => Promise.resolve('{"ok":true}'),
    Date.now,
    () => undefined,
    cp,
  );
  expect(() => {
    cp.reserve(2, "extra");
  }).toThrow();
  const changed = {
    ...result,
    observations: result.observations.map((o) => ({ ...o, accepted: false })),
    stopped: true,
  };
  expect(() => {
    cp.stop(changed);
  }).toThrow();
  cp.close();
});

test("reservation delay past deadline prevents inference", async () => {
  const cp = new EvaluationCheckpoint(file(), { suite, config });
  let now = 1000;
  const reserve = cp.reserve.bind(cp);
  vi.spyOn(cp, "reserve").mockImplementation((index, id) => {
    reserve(index, id);
    now = 200000;
  });
  const worker = vi.fn(() => Promise.resolve('{"ok":true}'));
  const result = await evaluate(
    suite,
    config,
    worker,
    () => now,
    () => undefined,
    cp,
  );
  expect(worker).not.toHaveBeenCalled();
  expect(result.reason).toBe("deadline");
  expect(cp.read().pending).toBeNull();
  cp.close();
});

test("directory resume reconstructs terminal artifacts without inference", async () => {
  const path = file();
  const cp = new EvaluationCheckpoint(path, { suite, config });
  const result = await evaluate(
    suite,
    config,
    () => Promise.resolve('{"ok":true}'),
    Date.now,
    () => undefined,
    cp,
  );
  cp.close();
  writeFileSync(
    join(dirname(path), "request.json"),
    JSON.stringify({ suite, config }),
  );
  expect((await evaluationDirectory(dirname(path), "status")).report).toEqual(
    result,
  );
  expect((await evaluationDirectory(dirname(path), "resume")).report).toEqual(
    result,
  );
  expect(
    JSON.parse(readFileSync(join(dirname(path), "report.json"), "utf8")),
  ).toEqual(result);
});

test("read-only checkpoint inspection neither creates missing state nor permits mutations", async () => {
  const path = file();
  expect(
    () => new EvaluationCheckpoint(path, { suite, config }, { readOnly: true }),
  ).toThrow();
  const checkpoint = new EvaluationCheckpoint(path, { suite, config });
  await evaluate(
    suite,
    config,
    () => Promise.resolve('{"ok":true}'),
    Date.now,
    () => undefined,
    checkpoint,
  );
  checkpoint.close();
  const inspector = new EvaluationCheckpoint(
    path,
    { suite, config },
    { readOnly: true },
  );
  try {
    expect(inspector.read().report?.observations).toHaveLength(2);
    expect(() => {
      inspector.reserve(2, "extra");
    }).toThrow();
  } finally {
    inspector.close();
  }
});
