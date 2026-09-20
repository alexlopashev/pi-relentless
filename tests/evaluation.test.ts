import { rankRoutes } from "../src/model-evidence.js";
import { evaluationRoutes } from "../src/evaluation.js";
import { expect, it, vi } from "vitest";
import { evaluate } from "../src/evaluation.js";
import { configSchema } from "../src/router.js";
import { Failure } from "../src/failures.js";
const config = configSchema.parse({
  candidates: [
    {
      name: "one",
      provider: "fixture",
      model: "model",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const suite = {
  workload: "json",
  effort: "low",
  cases: [
    {
      id: "one",
      prompt: "Echo one",
      acceptance: { kind: "json", equals: { answer: 1 } },
    },
    {
      id: "two",
      prompt: "Echo two",
      acceptance: { kind: "json", equals: { answer: 2 } },
    },
    {
      id: "three",
      prompt: "Echo three",
      acceptance: { kind: "json", equals: { answer: 3 } },
    },
  ],
};
it("records host-checked outcomes, timing, exact route and unknown costs", async () => {
  let clock = 100;
  let calls = 0;
  const result = await evaluate(
    suite,
    config,
    () => Promise.resolve(JSON.stringify({ answer: ++calls })),
    () => (clock += 10),
  );
  expect(result.observations).toHaveLength(3);
  expect(
    result.observations.every(
      (o) =>
        o.accepted &&
        o.elapsedMs !== null &&
        o.elapsedMs > 0 &&
        o.estimatedUsd === null &&
        o.billing === "subscription",
    ),
  ).toBe(true);
  expect(new Set(result.observations.map((o) => o.id)).size).toBe(3);
  const changed = await evaluate(
    {
      ...suite,
      cases: suite.cases.map((c) => ({ ...c, prompt: c.prompt + " changed" })),
    },
    config,
    () => Promise.resolve("{}"),
  );
  expect(changed.suiteHash).not.toBe(result.suiteHash);
  expect(changed.observations.every((o) => !o.accepted)).toBe(true);
});
it("stops on provider blocks and never accepts an agent success claim", async () => {
  let calls = 0;
  const result = await evaluate(suite, config, () => {
    calls++;
    return Promise.reject(new Failure("policy"));
  });
  expect(calls).toBe(1);
  expect(result.stopped).toBe(true);
  expect(result.observations[0]?.accepted).toBe(false);
});
it("refuses disabled billing and oversized dispatch plans before inference", async () => {
  let calls = 0;
  const worker = () => {
    calls++;
    return Promise.resolve("{}");
  };
  const paid = configSchema.parse({
    ...config,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  await expect(evaluate(suite, paid, worker)).rejects.toThrow();
  const many = configSchema.parse({
    ...config,
    candidates: Array.from({ length: 11 }, (_, i) => ({
      ...config.candidates[0],
      name: String(i),
    })),
  });
  await expect(evaluate(suite, many, worker)).rejects.toThrow(/budget/i);
  expect(calls).toBe(0);
});
it("does not accept the final response after its suite deadline", async () => {
  let now = 1000;
  const report = await evaluate(
    { ...suite, maxDurationMs: 1000 },
    config,
    () => {
      now += 2000;
      return Promise.resolve('{"answer":1}');
    },
    () => now,
  );
  expect(report.stopped).toBe(true);
  expect(report.observations[0]?.accepted).toBe(false);
});

it("cancels an in-flight worker when the suite deadline expires", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  let signal: AbortSignal | undefined;
  try {
    const pending = evaluate(
      { ...suite, maxDurationMs: 1000 },
      config,
      (_task, _route, s) => {
        signal = s;
        return new Promise<string>(() => {
          /* deliberately pending */
        });
      },
    );
    await vi.advanceTimersByTimeAsync(1001);
    const result = await pending;
    expect(result.stopped).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(result.observations[0]?.accepted).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it("pairs worker cost callbacks with deterministic case outcomes and rejects subscription cost inference", async () => {
  const metered = configSchema.parse({
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  for (const settings of [metered, config]) {
    let calls = 0;
    const result = await evaluate(
      suite,
      settings,
      (_task, _selection, _signal, onCost) => {
        calls++;
        onCost?.(calls / 100);
        return Promise.resolve(
          JSON.stringify({ answer: calls === 2 ? 0 : calls }),
        );
      },
    );
    const ranked = rankRoutes(
      evaluationRoutes(suite, settings),
      result.observations,
      {
        workload: suite.workload,
        suiteHash: result.suiteHash,
        caseIds: suite.cases.map((c) => c.id),
        metric: "cost",
        minSuccessRate: 0.5,
      },
      Date.now(),
    );
    expect(ranked).toEqual([]); // A wholly failing case cannot qualify on aggregate success.
    expect(result.observations.map((o) => o.accepted)).toEqual([
      true,
      false,
      true,
    ]);
    expect(result.observations.map((o) => o.estimatedUsd)).toEqual(
      settings === metered ? [0.01, 0.02, 0.03] : [null, null, null],
    );
  }
});

it("cost-qualified routes consume host-verified process-style observations", async () => {
  const settings = configSchema.parse({
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  let calls = 0;
  const result = await evaluate(
    suite,
    settings,
    (_task, _route, _signal, onCost) => {
      onCost?.(++calls / 100);
      return Promise.resolve(JSON.stringify({ answer: calls }));
    },
  );
  const ranked = rankRoutes(
    evaluationRoutes(suite, settings),
    result.observations,
    {
      workload: suite.workload,
      suiteHash: result.suiteHash,
      caseIds: suite.cases.map((c) => c.id),
      metric: "cost",
    },
    Date.now(),
  );
  expect(ranked[0]?.score).toBeCloseTo(0.02);
});
