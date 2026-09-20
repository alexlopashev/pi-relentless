import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { createPiGoal } from "../src/pi-goal-create.js";
import { Ledger } from "../src/ledger.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const routing = {
  maxConcurrency: 1,
  candidates: [
    {
      name: "local",
      provider: "relentless-local",
      model: "qwen3.5-4b",
      billing: "local",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["off"],
    },
  ],
};
const input = {
  objective: "Complete the declared task",
  constraints: ["No cloud"],
  tasks: [
    {
      id: "answer",
      prompt: "Return JSON",
      minQuality: 1,
      effort: "off",
      acceptance: { kind: "json", equals: { ok: true } },
    },
  ],
  maxAttempts: 1,
};
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "pi-goal-create-"));
  roots.push(cwd);
  await mkdir(join(cwd, ".pi"));
  await writeFile(
    join(cwd, ".pi/settings.json"),
    JSON.stringify({ relentless: { version: 1, routing, roles: {} } }),
  );
  return { cwd, isProjectTrusted: () => true };
}
test("Pi creation freezes project policy and records an undispatched goal", async () => {
  const context = await fixture();
  const result = await createPiGoal(JSON.stringify(input), context);
  const ledger = new Ledger(join(context.cwd, ".harness/ledger.sqlite"));
  try {
    const goal = ledger.goal(result.goalId);
    expect(goal.contract.config.candidates[0]?.name).toBe("local");
    expect(goal.tasks[0]?.attempts).toBe(0);
    expect(goal.contract.constraints).toEqual(["No cloud"]);
    expect(goal.revision).toBe(1);
  } finally {
    ledger.close();
  }
});
test("creation rejects routing overrides, malformed contracts, cancelled or untrusted sessions", async () => {
  const context = await fixture();
  await expect(
    createPiGoal(JSON.stringify({ ...input, config: routing }), context),
  ).rejects.toThrow();
  await expect(
    createPiGoal(JSON.stringify({ ...input, tasks: [] }), context),
  ).rejects.toThrow();
  await expect(
    createPiGoal(JSON.stringify(input), {
      ...context,
      isProjectTrusted: () => false,
    }),
  ).rejects.toThrow();
  await expect(
    createPiGoal(JSON.stringify(input), {
      ...context,
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow();
});

test("Pi command exposes the saved goal ID without dispatching", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const context = await fixture();
  const messages: string[] = [];
  await relentlessCommand(
    `goal-create ${JSON.stringify(input)}`,
    {
      ...context,
      ui: {
        notify: (message, type) => {
          expect(type).toBe("info");
          messages.push(message);
        },
      },
    },
    () => Promise.reject(new Error("Must not dispatch")),
  );
  expect(messages[0]).toContain('"goalId"');
});

test("creation retains cross-task validation and rechecks trust after asynchronous reads", async () => {
  const context = await fixture();
  await expect(
    createPiGoal(
      JSON.stringify({
        ...input,
        tasks: [{ ...input.tasks[0], dependsOn: ["answer"] }],
      }),
      context,
    ),
  ).rejects.toThrow("Dependency cycle");
  let checks = 0;
  await expect(
    createPiGoal(JSON.stringify(input), {
      ...context,
      isProjectTrusted: () => ++checks < 3,
    }),
  ).rejects.toThrow("Untrusted project");
  const { existsSync } = await import("node:fs");
  expect(existsSync(join(context.cwd, ".harness/ledger.sqlite"))).toBe(false);
});
