import { afterEach, expect, test, vi } from "vitest";
import { startPiProgress } from "../src/pi-progress.js";

afterEach(() => vi.useRealTimers());

test("progress is immediate, tracks phases, and clears after settlement", async () => {
  vi.useFakeTimers();
  const setStatus = vi.fn();
  let phase = "Coding";
  const stop = startPiProgress({
    label: "goal-step",
    signal: new AbortController().signal,
    hasUI: true,
    isCurrent: () => true,
    isTrusted: () => true,
    setStatus,
    read: () => Promise.resolve(phase),
  });
  expect(setStatus).toHaveBeenCalledWith(
    "relentless",
    expect.stringContaining("goal-step"),
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(setStatus).toHaveBeenLastCalledWith(
    "relentless",
    expect.stringContaining("Coding"),
  );
  phase = "Independent review";
  await vi.advanceTimersByTimeAsync(2000);
  expect(setStatus).toHaveBeenLastCalledWith(
    "relentless",
    expect.stringContaining("Independent review"),
  );
  stop();
  expect(setStatus).toHaveBeenLastCalledWith("relentless", undefined);
  const count = setStatus.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(setStatus).toHaveBeenCalledTimes(count);
});

test("abort clears progress and a stale reader cannot overwrite the next session", async () => {
  vi.useFakeTimers();
  const setStatus = vi.fn();
  const controller = new AbortController();
  let current = true;
  let finish: ((value: string) => void) | undefined;
  const read = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = startPiProgress({
    label: "goal-run",
    signal: controller.signal,
    hasUI: true,
    isCurrent: () => current,
    isTrusted: () => true,
    setStatus,
    read,
  });
  await vi.advanceTimersByTimeAsync(6000);
  expect(read).toHaveBeenCalledTimes(1);
  controller.abort();
  expect(setStatus).toHaveBeenLastCalledWith("relentless", undefined);
  current = false;
  const count = setStatus.mock.calls.length;
  finish?.("Old private state");
  await vi.advanceTimersByTimeAsync(10000);
  stop();
  expect(setStatus).toHaveBeenCalledTimes(count);
});

test("headless or untrusted operation does not read journals or publish UI", async () => {
  vi.useFakeTimers();
  for (const mode of [
    { hasUI: false, trusted: true },
    { hasUI: true, trusted: false },
  ]) {
    const setStatus = vi.fn();
    const read = vi.fn(() => Promise.resolve("private"));
    const stop = startPiProgress({
      label: "resume",
      signal: new AbortController().signal,
      hasUI: mode.hasUI,
      isCurrent: () => true,
      isTrusted: () => mode.trusted,
      setStatus,
      read,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(setStatus).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    stop();
  }
});

test("status read and UI failures cannot fail or leak into work", async () => {
  vi.useFakeTimers();
  const setStatus = vi.fn();
  const stop = startPiProgress({
    label: "resume",
    signal: new AbortController().signal,
    hasUI: true,
    isCurrent: () => true,
    isTrusted: () => true,
    setStatus,
    read: () => Promise.reject(new Error("SECRET")),
  });
  await vi.advanceTimersByTimeAsync(4000);
  expect(JSON.stringify(setStatus.mock.calls)).not.toContain("SECRET");
  stop();
  expect(() =>
    startPiProgress({
      label: "resume",
      signal: new AbortController().signal,
      hasUI: true,
      isCurrent: () => true,
      isTrusted: () => true,
      setStatus: () => {
        throw Error("UI unavailable");
      },
    }),
  ).not.toThrow();
  vi.clearAllTimers();
});
