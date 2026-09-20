import { expect, test, vi } from "vitest";
import { Failure } from "../src/failures.js";
import { executeJob } from "../src/worker-job.js";
import type { Worker } from "../src/swarm.js";
const mock = vi.hoisted(() => ({ worker: vi.fn<Worker>() }));
vi.mock("../src/pi-worker.js", () => ({
  createPiWorker: (
    _config: unknown,
    _routes: unknown,
    onCost?: (task: string, cost: number) => void,
  ) => {
    onCost?.("t", 0.014);
    return Promise.resolve(mock.worker);
  },
}));
test("forwards child shutdown to Pi and preserves a denial during cancellation", async () => {
  const controller = new AbortController();
  const candidate = {
    name: "fixture",
    provider: "fixture",
    model: "offline",
    enabled: true,
    billing: "subscription",
    quality: 1,
    preference: 0,
    efforts: ["low"],
  };
  mock.worker.mockImplementation((_task, _route, signal) => {
    if (!signal) return Promise.reject(new Failure("unknown"));
    return new Promise<string>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          reject(new Failure("policy"));
        },
        { once: true },
      );
    });
  });
  const running = executeJob(
    {
      goalId: "g",
      revision: 1,
      attemptId: "a",
      task: { id: "t", prompt: "test", minQuality: 1, effort: "low" },
      config: { candidates: [candidate] },
      selection: { candidate, effort: "low" },
    },
    controller.signal,
  );
  await vi.waitFor(() => {
    expect(mock.worker).toHaveBeenCalled();
  });
  controller.abort();
  expect(await running).toMatchObject({ status: "failed", kind: "policy" });
  expect(mock.worker.mock.calls[0]?.[2]).toBe(controller.signal);
});

test.each(["metered", "subscription"])(
  "child transports only authorized %s estimates",
  async (billing) => {
    const candidate = {
      name: "fixture",
      provider: "fixture",
      model: "offline",
      enabled: true,
      billing,
      quality: 1,
      preference: 0,
      efforts: ["low"],
    };
    mock.worker.mockResolvedValue("result");
    const reply = await executeJob(
      {
        goalId: "g",
        revision: 1,
        attemptId: "a",
        task: { id: "t", prompt: "test", minQuality: 1, effort: "low" },
        config: { candidates: [candidate], allowMetered: true },
        selection: { candidate, effort: "low" },
      },
      new AbortController().signal,
    );
    expect(reply).toEqual({
      status: "completed",
      output: "result",
      ...(billing === "metered" ? { estimatedUsd: 0.014 } : {}),
    });
  },
);

test("reports bounded job stage without echoing validation or worker errors", async () => {
  expect(
    await executeJob(
      { secret: "private-marker" },
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: "failed",
    kind: "unknown",
    origin: "job_validation",
  });
  const candidate = {
    name: "fixture",
    provider: "fixture",
    model: "offline",
    enabled: true,
    billing: "subscription",
    quality: 1,
    preference: 0,
    efforts: ["low"],
  };
  const job = {
    goalId: "g",
    revision: 1,
    attemptId: "a",
    task: { id: "t", prompt: "test", minQuality: 1, effort: "low" },
    config: { candidates: [candidate] },
    selection: { candidate, effort: "low" },
  };
  mock.worker.mockRejectedValue(new Error("private-marker"));
  const failure = await executeJob(job, new AbortController().signal);
  expect(failure).toMatchObject({
    kind: "unknown",
    origin: "worker_inference",
  });
  expect(JSON.stringify(failure)).not.toContain("private-marker");
  mock.worker.mockResolvedValue("x".repeat(65537));
  expect(await executeJob(job, new AbortController().signal)).toMatchObject({
    kind: "invalid_output",
    origin: "output_limit",
  });
});
