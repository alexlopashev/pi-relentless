import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import { relentlessCommand } from "../src/pi-extension.js";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
const candidates = ["author", "review-a", "review-b"].map((name) => ({
  name,
  provider: name,
  model: name,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
}));
const models = () => ({
  available: candidates.map((c) => ({
    provider: c.provider,
    model: c.model,
    efforts: c.efforts,
  })),
  scoped: [],
});
const task = {
  id: "fix",
  prompt: "Make x equal two",
  minQuality: 1,
  effort: "low",
};
const input = {
  task,
  files: [{ path: "x.ts", writable: true }],
  maxAttempts: 2,
  reviewTask: { ...task, id: "review" },
  maxReviewPairs: 1,
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-create-"));
  await mkdir(join(root, ".pi"));
  await writeFile(join(root, "x.ts"), "export const x = 1;");
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: { candidates, maxConcurrency: 1 },
        roles: { coder: ["author"], reviewer: ["review-a", "review-b"] },
      },
    }),
  );
  return root;
}
test("Pi creates a frozen coding and review workflow without executing inference", async () => {
  const root = await fixture();
  const notify = vi.fn();
  const execute = vi.fn();
  await relentlessCommand(
    `create ${JSON.stringify(input)}`,
    { cwd: root, isProjectTrusted: () => true, models, ui: { notify } },
    execute,
  );
  const output: unknown = JSON.parse(String(notify.mock.calls[0]?.[0]));
  expect(output).toMatchObject({ phase: "coding", dispatched: false });
  if (
    !output ||
    typeof output !== "object" ||
    !("id" in output) ||
    typeof output.id !== "string"
  )
    throw new Error("Missing id");
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const workflows = new CodingWorkflows(
    join(root, ".harness/workflows.sqlite"),
  );
  try {
    expect(coding.read(output.id)).toMatchObject({
      attempts: 0,
      request: { sourceRoot: await realpath(root), maxAttempts: 2 },
      config: { candidates: [{ name: "author" }] },
    });
    expect(workflows.read(output.id)).toMatchObject({
      phase: "coding",
      maxReviewPairs: 1,
      review: {
        config: { candidates: [{ name: "review-a" }, { name: "review-b" }] },
      },
    });
  } finally {
    coding.close();
    workflows.close();
  }
  expect(execute).not.toHaveBeenCalled();
});
test("creation rejects root overrides and unavailable independent reviewers before creating state", async () => {
  for (const override of [true, false]) {
    const root = await fixture();
    const notify = vi.fn();
    await relentlessCommand(
      `create ${JSON.stringify(override ? { ...input, sourceRoot: "/elsewhere" } : input)}`,
      {
        cwd: root,
        isProjectTrusted: () => true,
        models: override ? models : () => ({ ...models(), available: [] }),
        ui: { notify },
      },
    );
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
    expect(existsSync(join(root, ".harness/coding.sqlite"))).toBe(false);
  }
});

test("revoked trust or session cancellation prevents creation after asynchronous source reads", async () => {
  for (const cancel of [true, false]) {
    const root = await fixture();
    const notify = vi.fn();
    const controller = new AbortController();
    let trusted = true;
    await relentlessCommand(`create ${JSON.stringify(input)}`, {
      cwd: root,
      signal: controller.signal,
      isProjectTrusted: () => trusted,
      models: () => {
        if (cancel) controller.abort();
        else trusted = false;
        return models();
      },
      ui: { notify },
    });
    expect(existsSync(join(root, ".harness/coding.sqlite"))).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
  }
});

test("a workflow attachment failure returns the retained coding id without inference or pretending success", async () => {
  const root = await fixture();
  const notify = vi.fn();
  const failure = vi
    .spyOn(CodingWorkflows.prototype, "create")
    .mockImplementation(() => {
      throw new Error("disk failure");
    });
  try {
    await relentlessCommand(`create ${JSON.stringify(input)}`, {
      cwd: root,
      isProjectTrusted: () => true,
      models,
      ui: { notify },
    });
    const output: unknown = JSON.parse(String(notify.mock.calls[0]?.[0]));
    expect(output).toMatchObject({
      phase: "creation_incomplete",
      dispatched: false,
    });
    expect(notify.mock.calls[0]?.[1]).toBe("error");
    if (
      !output ||
      typeof output !== "object" ||
      !("id" in output) ||
      typeof output.id !== "string"
    )
      throw new Error("Missing recovery id");
    const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
    try {
      expect(coding.read(output.id)).toMatchObject({
        attempts: 0,
        status: "ready",
      });
    } finally {
      coding.close();
    }
  } finally {
    failure.mockRestore();
  }
});

test("retrying identical creation recovers attachment and keeps the first snapshot despite source or settings changes", async () => {
  const root = await fixture();
  const notify = vi.fn();
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models,
    ui: { notify },
  };
  const fail = vi
    .spyOn(CodingWorkflows.prototype, "create")
    .mockImplementation(() => {
      throw new Error("interrupted attachment");
    });
  try {
    await relentlessCommand(`create ${JSON.stringify(input)}`, context);
  } finally {
    fail.mockRestore();
  }
  const first: unknown = JSON.parse(String(notify.mock.calls[0]?.[0]));
  await writeFile(join(root, "x.ts"), "export const x = 999;");
  await writeFile(join(root, ".pi/settings.json"), "{}");
  notify.mockClear();
  await relentlessCommand(`create ${JSON.stringify(input)}`, context);
  const second: unknown = JSON.parse(String(notify.mock.calls[0]?.[0]));
  expect(first).toMatchObject({ phase: "creation_incomplete" });
  expect(second).toMatchObject({ phase: "coding", dispatched: false });
  if (
    !first ||
    typeof first !== "object" ||
    !("id" in first) ||
    typeof first.id !== "string"
  )
    throw new Error("Missing first id");
  expect(second).toHaveProperty("id", first.id);
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  try {
    expect(coding.read(first.id).files["x.ts"]?.original).toBe(
      "export const x = 1;",
    );
  } finally {
    coding.close();
  }
  notify.mockClear();
  await relentlessCommand(`create ${JSON.stringify(input)}`, context);
  expect(JSON.parse(String(notify.mock.calls[0]?.[0]))).toEqual(second);
});

test("reusing a task id for a changed creation contract is rejected", async () => {
  const root = await fixture();
  const notify = vi.fn();
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models,
    ui: { notify },
  };
  await relentlessCommand(`create ${JSON.stringify(input)}`, context);
  notify.mockClear();
  await relentlessCommand(
    `create ${JSON.stringify({ ...input, maxAttempts: 3 })}`,
    context,
  );
  expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
});
