import { expect, test, vi } from "vitest";
import { runWorkflow } from "../src/workflow-runner.js";
test("waits until due and exits at verification without additional dispatch", async () => {
  let now = 100;
  const resume = vi
    .fn()
    .mockResolvedValueOnce({ phase: "coding", retryAt: 500 })
    .mockResolvedValueOnce({ phase: "verification_required", retryAt: null });
  const waits: number[] = [];
  const result = await runWorkflow(
    resume,
    new AbortController().signal,
    (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    () => now,
  );
  expect(waits).toEqual([400]);
  expect(resume).toHaveBeenCalledTimes(2);
  expect(result?.phase).toBe("verification_required");
});
test("cancellation while waiting does not dispatch another attempt", async () => {
  const controller = new AbortController();
  const resume = vi.fn().mockResolvedValue({ phase: "coding", retryAt: 500 });
  const result = await runWorkflow(
    resume,
    controller.signal,
    () => {
      controller.abort();
      return Promise.reject(new Error("aborted"));
    },
    () => 100,
  );
  expect(resume).toHaveBeenCalledTimes(1);
  expect(result?.phase).toBe("coding");
});
test("pre-cancelled runner spends nothing; unexpected sleep errors propagate", async () => {
  const resume = vi.fn().mockResolvedValue({ phase: "coding", retryAt: null });
  const controller = new AbortController();
  controller.abort();
  expect(await runWorkflow(resume, controller.signal)).toBeNull();
  expect(resume).not.toHaveBeenCalled();
  await expect(
    runWorkflow(resume, new AbortController().signal, () =>
      Promise.reject(new Error("clock failed")),
    ),
  ).rejects.toThrow("clock failed");
});

test("chunked sleep never resumes before a distant retry time", async () => {
  let now = 0;
  const times: number[] = [];
  const resume = () => {
    times.push(now);
    return Promise.resolve({
      phase: times.length === 1 ? "coding" : "verification_required",
      retryAt: 65000,
    });
  };
  const waits: number[] = [];
  await runWorkflow(
    resume,
    new AbortController().signal,
    (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    () => now,
  );
  expect(times).toEqual([0, 65000]);
  expect(waits).toEqual([30000, 30000, 5000]);
});

test("verified is a terminal foreground result", async () => {
  const result = await runWorkflow(
    () => Promise.resolve({ phase: "verified", retryAt: null }),
    new AbortController().signal,
    () => {
      throw Error("must not wait");
    },
  );
  expect(result?.phase).toBe("verified");
});

test("verification failures continue through repair and fresh review to verified", async () => {
  const events: string[] = [];
  const resume = vi.fn(() => {
    events.push("review");
    return Promise.resolve({ phase: "verification_required", retryAt: null });
  });
  const verify = vi.fn(() => {
    events.push("verify");
    return Promise.resolve({
      phase: events.length === 2 ? "coding" : "verified",
      retryAt: null,
    });
  });
  let now = 0;
  const result = await runWorkflow(
    resume,
    new AbortController().signal,
    (ms) => {
      now += ms;
      return Promise.resolve();
    },
    () => now,
    verify,
  );
  expect(result?.phase).toBe("verified");
  expect(events).toEqual(["review", "verify", "review", "verify"]);
});

test("unresolved verification stops without repeated execution", async () => {
  const state = { phase: "verification_required", retryAt: null };
  const resume = vi.fn(() => Promise.resolve(state));
  const verify = vi.fn(() => Promise.resolve(state));
  expect(
    await runWorkflow(
      resume,
      new AbortController().signal,
      undefined,
      undefined,
      verify,
    ),
  ).toEqual(state);
  expect(resume).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledTimes(1);
});

test("abort after review never launches verification", async () => {
  const shutdown = new AbortController();
  const state = { phase: "verification_required", retryAt: null };
  const verify = vi.fn(() =>
    Promise.resolve({ phase: "verified", retryAt: null }),
  );
  const resume = () => {
    shutdown.abort();
    return Promise.resolve(state);
  };
  expect(
    await runWorkflow(resume, shutdown.signal, undefined, undefined, verify),
  ).toEqual(state);
  expect(verify).not.toHaveBeenCalled();
});

test("verification receives shutdown signal and propagates execution errors", async () => {
  const shutdown = new AbortController();
  const verify = vi.fn((signal: AbortSignal) => {
    expect(signal).toBe(shutdown.signal);
    return Promise.reject(new Error("ambiguous verification"));
  });
  await expect(
    runWorkflow(
      () => Promise.resolve({ phase: "verification_required", retryAt: null }),
      shutdown.signal,
      undefined,
      undefined,
      verify,
    ),
  ).rejects.toThrow("ambiguous verification");
});
