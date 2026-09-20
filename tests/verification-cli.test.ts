import { afterEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocked.spawn }));
import { verificationCli } from "../src/verification-cli.js";
afterEach(() => {
  vi.clearAllMocks();
});
test("a cancelled Pi session cannot launch a VM supervisor", async () => {
  expect(
    await verificationCli(["run", "/manifest", "/output"], AbortSignal.abort()),
  ).not.toBe(0);
  expect(mocked.spawn).not.toHaveBeenCalled();
});
test("session cancellation signals the supervisor, waits for exit and removes listeners", async () => {
  const child = new EventEmitter();
  const kill = vi.fn();
  Object.assign(child, { kill });
  mocked.spawn.mockReturnValue(child);
  const controller = new AbortController();
  const before = process.listenerCount("SIGTERM");
  const result = verificationCli(
    ["run", "/manifest", "/output"],
    controller.signal,
  );
  controller.abort();
  expect(kill).toHaveBeenCalledWith("SIGTERM");
  child.emit("close", 1);
  expect(await result).toBe(1);
  expect(process.listenerCount("SIGTERM")).toBe(before);
});
