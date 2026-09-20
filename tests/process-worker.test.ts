import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: fake.fork }));
import { processWorker } from "../src/process-worker.js";
import { configSchema, route, type Task } from "../src/router.js";
import { workerReplySchema } from "../src/process-worker.js";
const config = configSchema.parse({
  candidates: [
    {
      name: "fixture",
      provider: "xai",
      model: "fixture",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["off"],
    },
  ],
  timeoutMs: 100,
});
const task: Task = {
  id: "one",
  prompt: "fixture",
  minQuality: 1,
  effort: "off",
};
it.each(["message", "error"])(
  "retains a denial and its origin after a later %s transport fault",
  async (event) => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      send: vi.fn(),
    });
    fake.fork.mockReturnValue(child);
    const running = processWorker(
      {
        goalId: "g",
        revision: 1,
        attemptId: "a",
        task,
        selection: route(task, config.candidates, false),
        config,
      },
      new AbortController().signal,
    );
    const assertion = expect(running).rejects.toMatchObject({
      kind: "policy",
      origin: "provider_response",
    });
    child.emit("message", {
      status: "failed",
      kind: "policy",
      origin: "provider_response",
    });
    child.emit(
      event,
      event === "message" ? { raw: "secret" } : new Error("secret"),
    );
    child.emit("close");
    await assertion;
  },
);
it("transports allowlisted origin and rejects arbitrary diagnostic strings", async () => {
  expect(
    workerReplySchema.safeParse({
      status: "failed",
      kind: "unknown",
      origin: "secret",
    }).success,
  ).toBe(false);
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    send: vi.fn(),
  });
  fake.fork.mockReturnValue(child);
  const running = processWorker(
    {
      goalId: "g",
      revision: 1,
      attemptId: "a",
      task,
      selection: route(task, config.candidates, false),
      config,
    },
    new AbortController().signal,
  );
  const assertion = expect(running).rejects.toMatchObject({
    kind: "unknown",
    origin: "provider_response",
  });
  child.emit("message", {
    status: "failed",
    kind: "unknown",
    origin: "provider_response",
  });
  child.emit("close");
  await assertion;
});
it.each(["policy", "quota", "approval"] as const)(
  "retains received %s failure when cancellation races child exit",
  async (kind) => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      send: vi.fn(),
    });
    fake.fork.mockReturnValue(child);
    const controller = new AbortController();
    const result = processWorker(
      {
        goalId: "goal",
        revision: 1,
        attemptId: "attempt",
        task,
        selection: route(task, config.candidates, false),
        config,
      },
      controller.signal,
    );
    const assertion = expect(result).rejects.toMatchObject({
      kind,
      retryAfterMs: 60000,
    });
    child.emit("message", { status: "failed", kind, retryAfterMs: 60000 });
    controller.abort();
    child.emit("close");
    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  },
);

it("delivers validated metered cost after child close, including failed inference", async () => {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    send: vi.fn(),
  });
  fake.fork.mockReturnValue(child);
  const metered = {
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({
      ...c,
      billing: "metered" as const,
    })),
  };
  const estimate = vi.fn();
  const running = processWorker(
    {
      goalId: "g",
      revision: 1,
      attemptId: "a",
      task,
      selection: route(task, metered.candidates, true),
      config: metered,
    },
    new AbortController().signal,
    estimate,
  );
  const rejected = expect(running).rejects.toMatchObject({ kind: "quota" });
  child.emit("message", {
    status: "failed",
    kind: "quota",
    estimatedUsd: 0.012,
  });
  expect(estimate).not.toHaveBeenCalled();
  child.emit("close");
  await rejected;
  expect(estimate).toHaveBeenCalledExactlyOnceWith(0.012);
});

it("telemetry observer failure cannot erase a policy denial", async () => {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    send: vi.fn(),
  });
  fake.fork.mockReturnValue(child);
  const metered = {
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({
      ...c,
      billing: "metered" as const,
    })),
  };
  const running = processWorker(
    {
      goalId: "g",
      revision: 1,
      attemptId: "a",
      task,
      selection: route(task, metered.candidates, true),
      config: metered,
    },
    new AbortController().signal,
    () => {
      throw new Error("observer failed");
    },
  );
  const rejected = expect(running).rejects.toMatchObject({ kind: "policy" });
  child.emit("message", {
    status: "failed",
    kind: "policy",
    estimatedUsd: 0.012,
  });
  child.emit("close");
  await rejected;
});
