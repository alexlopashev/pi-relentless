import { expect, test } from "vitest";
import { PiSessionWork } from "../src/pi-session-work.js";

test("shutdown aborts active work and excludes overlap until it settles", async () => {
  const work = new PiSessionWork();
  let finish: (() => void) | undefined;
  let active: AbortSignal | undefined;
  const first = work.run((signal) => {
    active = signal;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  work.stop();
  expect(active?.aborted).toBe(true);
  await expect(work.run(() => Promise.resolve())).rejects.toThrow();
  work.start();
  await expect(work.run(() => Promise.resolve())).rejects.toThrow();
  finish?.();
  await first;
  expect(await work.run((signal) => Promise.resolve(signal.aborted))).toBe(
    false,
  );
});
test("exceptions release the slot and repeated stop does not start new work", async () => {
  const work = new PiSessionWork();
  await expect(
    work.run(() => {
      throw Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(await work.run(() => Promise.resolve(7))).toBe(7);
  work.stop();
  work.stop();
  let called = false;
  await expect(
    work.run(() => {
      called = true;
      return Promise.resolve();
    }),
  ).rejects.toThrow();
  expect(called).toBe(false);
});
