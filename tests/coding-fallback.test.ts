import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { createCodingRun, resumeCoding } from "../src/durable-coding.js";
import { configSchema } from "../src/router.js";
import { Failure } from "../src/failures.js";
const roots: string[] = [];
const journals: CodingJournal[] = [];
afterEach(async () => {
  journals.splice(0).forEach((j) => {
    j.close();
  });
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(pin = false, timeoutMs = 100) {
  const root = await mkdtemp(join(tmpdir(), "coding-fallback-"));
  roots.push(root);
  await writeFile(join(root, "x.json"), "0");
  const journal = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(journal);
  const candidate = {
    name: "first",
    provider: "a",
    model: "one",
    enabled: true,
    billing: "subscription",
    quality: 1,
    preference: 0,
    efforts: ["low"],
  };
  const config = configSchema.parse({
    candidates: [
      candidate,
      {
        ...candidate,
        name: "second",
        provider: "b",
        model: "two",
        preference: 1,
      },
    ],
    timeoutMs,
  });
  const id = await createCodingRun(
    {
      sourceRoot: root,
      task: {
        id: "edit",
        prompt: "Change to one",
        minQuality: 1,
        effort: "low",
        ...(pin ? { model: "one" } : {}),
      },
      files: [{ path: "x.json", writable: true }],
      maxAttempts: 3,
    },
    config,
    journal,
  );
  return { journal, id };
}
test("quota falls back to an eligible provider with the same snapshot and cumulative budget", async () => {
  const { journal, id } = await fixture();
  const calls: string[] = [];
  const result = await resumeCoding(id, journal, (_task, selection) => {
    calls.push(selection.candidate.provider);
    return selection.candidate.provider === "a"
      ? Promise.reject(new Failure("quota", 60000))
      : Promise.resolve('{"edits":[{"path":"x.json","content":"1"}]}');
  });
  if (result.directory) roots.push(result.directory);
  expect(calls).toEqual(["a", "b"]);
  expect(result.status).toBe("ready_for_review");
  expect(journal.read(id).attempts).toBe(2);
  expect(journal.read(id).failures[0]?.candidate).toBe("first");
});
test("a pinned model waits durably, then retries only when due", async () => {
  const { journal, id } = await fixture(true);
  const first = await resumeCoding(
    id,
    journal,
    () => Promise.reject(new Failure("outage")),
    () => 1000,
  );
  if (first.directory) roots.push(first.directory);
  expect(first.status).toBe("waiting_retry");
  expect(journal.read(id).dueAt).toBe(31000);
  const early = await resumeCoding(
    id,
    journal,
    () => {
      throw new Error("No early dispatch");
    },
    () => 30999,
  );
  if (early.directory) roots.push(early.directory);
  expect(journal.read(id).attempts).toBe(1);
  const final = await resumeCoding(
    id,
    journal,
    (_task, selection) => {
      expect(selection.candidate.model).toBe("one");
      return Promise.resolve('{"edits":[{"path":"x.json","content":"1"}]}');
    },
    () => 31000,
  );
  if (final.directory) roots.push(final.directory);
  expect(final.status).toBe("ready_for_review");
});
test.each(["policy", "auth", "permission", "approval", "unknown"] as const)(
  "%s is recorded and blocks without provider hopping",
  async (kind) => {
    const { journal, id } = await fixture();
    let calls = 0;
    const result = await resumeCoding(id, journal, () => {
      calls++;
      return Promise.reject(new Failure(kind));
    });
    if (result.directory) roots.push(result.directory);
    expect(calls).toBe(1);
    expect(result.status).toBe("blocked");
    expect(journal.read(id).failures[0]?.kind).toBe(kind);
  },
);
test("a denial arriving during timeout cancellation overrides retry eligibility", async () => {
  const { journal, id } = await fixture();
  let calls = 0;
  const result = await resumeCoding(
    id,
    journal,
    (_task, _selection, signal) => {
      calls++;
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(new Failure("policy"));
          },
          { once: true },
        );
      });
    },
  );
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(calls).toBe(1);
  expect(journal.read(id).failures[0]?.kind).toBe("policy");
});
test("confirmed timeout can fall back only after the old worker settles", async () => {
  const { journal, id } = await fixture();
  let settled = false;
  const result = await resumeCoding(id, journal, (_task, selection, signal) => {
    if (selection.candidate.provider === "b") {
      expect(settled).toBe(true);
      return Promise.resolve('{"edits":[{"path":"x.json","content":"1"}]}');
    }
    return new Promise<string>((_resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => {
          settled = true;
          reject(new Failure("interrupted"));
        },
        { once: true },
      );
    });
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(journal.read(id).failures[0]?.kind).toBe("timeout");
});
test("a blocking denial after lease expiry remains authoritative without replacement", async () => {
  const { journal, id } = await fixture(false, 2000);
  let now = 100;
  let replacement: ReturnType<CodingJournal["start"]> = null;
  const result = await resumeCoding(
    id,
    journal,
    (_task, _selection, signal) => {
      now = 30100;
      replacement = journal.start(id, "replacement", now, 30000);
      now++;
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(new Failure("policy"));
          },
          { once: true },
        );
      });
    },
    () => now,
  );
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(replacement).toBeNull();
  expect(journal.read(id).attempts).toBe(1);
  expect(journal.read(id).failures.at(-1)?.kind).toBe("policy");
  expect(journal.read(id).files["x.json"]?.current).toBe("0");
});
test("provider handoff retains an already committed intermediate patch", async () => {
  const { journal, id } = await fixture();
  let calls = 0;
  const result = await resumeCoding(id, journal, (task, selection) => {
    calls++;
    if (calls === 1)
      return Promise.resolve('{"edits":[{"path":"x.json","content":"{"}]}');
    if (calls === 2) return Promise.reject(new Failure("quota"));
    expect(selection.candidate.provider).toBe("b");
    expect(task.prompt).toContain('"content":"{"');
    return Promise.resolve('{"edits":[{"path":"x.json","content":"1"}]}');
  });
  if (result.directory) roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(journal.read(id).attempts).toBe(3);
});
