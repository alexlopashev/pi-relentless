import { expect, it } from "vitest";
import { runSwarm } from "../src/swarm.js";
import { configSchema, type Task } from "../src/router.js";
const config = configSchema.parse({
  maxConcurrency: 2,
  candidates: [
    {
      name: "fixture",
      provider: "fixture",
      model: "fake",
      quality: 1,
      preference: 1,
      enabled: true,
      billing: "subscription",
      efforts: ["low"],
    },
  ],
});
const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
  id: `t${String(i)}`,
  prompt: "Think",
  minQuality: 1,
  effort: "low",
}));
it("bounds concurrent calls, runs every task once, and preserves task order", async () => {
  let active = 0;
  let peak = 0;
  const seen: string[] = [];
  const result = await runSwarm(tasks, config, async (task) => {
    active++;
    peak = Math.max(peak, active);
    seen.push(task.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return task.id;
  });
  expect(peak).toBe(2);
  expect(new Set(seen).size).toBe(5);
  expect(result.map((r) => r.taskId)).toEqual(tasks.map((t) => t.id));
  expect(result.every((r) => r.status === "completed")).toBe(true);
});
it("records worker failures without abandoning sibling results", async () => {
  const result = await runSwarm(tasks, config, (task) =>
    task.id === "t0"
      ? Promise.reject(new Error("unavailable"))
      : Promise.resolve("ok"),
  );
  expect(result[0]).toMatchObject({ status: "failed", error: "unavailable" });
  expect(result.slice(1).every((r) => r.status === "completed")).toBe(true);
});
it("preflights all routes before making any provider call", async () => {
  let calls = 0;
  await expect(
    runSwarm(
      [...tasks, { id: "bad", prompt: "bad", minQuality: 3, effort: "high" }],
      config,
      () => {
        calls++;
        return Promise.resolve("no");
      },
    ),
  ).rejects.toThrow("No eligible route");
  expect(calls).toBe(0);
});
it("rejects duplicate task IDs and empty tasks", async () => {
  await expect(
    runSwarm([tasks[0], tasks[0]], config, () => Promise.resolve("")),
  ).rejects.toThrow();
  await expect(
    runSwarm([], config, () => Promise.resolve("")),
  ).rejects.toThrow();
});
it("normalizes non-Error rejections", async () => {
  const result = await runSwarm(tasks.slice(0, 1), config, () => {
    // Deliberately exercise third-party adapters rejecting with a non-Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject("offline");
  });
  expect(result[0]).toMatchObject({
    status: "failed",
    error: "Worker failed without an Error object",
  });
});
