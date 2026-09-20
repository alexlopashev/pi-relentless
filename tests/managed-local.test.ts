import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
const fake = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: fake.fork }));
import { startManagedLocal } from "../src/managed-local.js";
const config = {
  executable: { path: "/runtime/server", sha256: "a".repeat(64) },
  model: { path: "/model.gguf", sha256: "b".repeat(64) },
  libraries: {},
  startupMs: 1000,
};
function child() {
  const c = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((_input: unknown, callback?: (error: Error | null) => void) =>
      callback?.(null),
    ),
    kill: vi.fn(),
  });
  fake.fork.mockReturnValue(c);
  return c;
}
test("a managed lease exposes only its ephemeral header after readiness and awaits owned cleanup", async () => {
  const c = child();
  const started = startManagedLocal(config);
  c.emit("message", { status: "ready" });
  const lease = await started;
  expect(lease.headers.Authorization).toMatch(/^Bearer [a-f0-9]{64}$/);
  let closed = false;
  const closing = lease.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(c.send).toHaveBeenLastCalledWith(
    { command: "stop" },
    expect.any(Function),
  );
  c.emit("close", 0, null);
  await closing;
  expect(closed).toBe(true);
  await lease.close();
  expect(c.kill).not.toHaveBeenCalled();
});
test("abort before start does not spawn; abort during startup waits for supervisor close", async () => {
  const prior = new AbortController();
  prior.abort();
  fake.fork.mockClear();
  await expect(startManagedLocal(config, prior.signal)).rejects.toThrow();
  expect(fake.fork).not.toHaveBeenCalled();
  const c = child();
  const abort = new AbortController();
  const started = startManagedLocal(config, abort.signal);
  const rejected = expect(started).rejects.toThrow();
  abort.abort();
  c.emit("message", { status: "ready" });
  c.emit("close", 0, null);
  await rejected;
});
