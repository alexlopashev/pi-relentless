import { Failure } from "../src/failures.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { reviewCoding } from "../src/coding-review.js";
const roots: string[] = [];
const journals: CodingJournal[] = [];
afterEach(() => {
  for (const j of journals) j.close();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  journals.length = 0;
  roots.length = 0;
});
const candidate = (provider: string) => ({
  name: provider,
  provider,
  model: provider,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "coding-review-"));
  roots.push(root);
  const journal = new CodingJournal(join(root, "coding.sqlite"));
  journals.push(journal);
  const task = {
    id: "repair",
    prompt: "Preserve interface",
    minQuality: 1,
    effort: "low",
  };
  const id = journal.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 2,
    },
    { candidates: [candidate("author")] },
    { "x.ts": "export const x = ;" },
  );
  const token = journal.start(id, "author", 100, 100);
  if (!token) throw new Error("No lease");
  journal.finish(
    id,
    token,
    { "x.ts": "export const x = 1;" },
    "ready_for_review",
    101,
  );
  const request = {
    task: { ...task, id: "review", prompt: "Review correctness" },
    config: {
      candidates: [candidate("author"), candidate("a"), candidate("b")],
    },
  };
  return { journal, id, request };
}
test("preflights two distinct non-author providers and binds outcomes to the checkpoint", async () => {
  const { journal, id, request } = fixture();
  const providers: string[] = [];
  const before = journal.read(id);
  const report = await reviewCoding(
    id,
    journal,
    request,
    async (task, route) => {
      await Promise.resolve();
      providers.push(route.candidate.provider);
      expect(task.prompt).toContain("Preserve interface");
      expect(task.prompt).toContain("export const x = 1;");
      return JSON.stringify({ verdict: "no_findings", findings: [] });
    },
  );
  expect(providers).toEqual(["a", "b"]);
  expect(report.status).toBe("reviewed");
  expect(report.revision).toBe(1);
  expect(report.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.reviews).toHaveLength(2);
  expect(journal.read(id)).toEqual(before);
});
test("fails preflight without spending when a second independent route is unavailable", async () => {
  const { journal, id, request } = fixture();
  let calls = 0;
  await expect(
    reviewCoding(
      id,
      journal,
      {
        ...request,
        config: {
          candidates: [
            candidate("author"),
            candidate("a"),
            { ...candidate("a"), name: "alias" },
          ],
        },
      },
      async () => {
        await Promise.resolve();
        calls++;
        return "";
      },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
test("an intervening prompt revision prevents acceptance and stops further reviews", async () => {
  const { journal, id, request } = fixture();
  let calls = 0;
  const report = await reviewCoding(id, journal, request, async () => {
    await Promise.resolve();
    calls++;
    journal.revisePrompt(id, 1, "New constraints", 200);
    return JSON.stringify({ verdict: "no_findings", findings: [] });
  });
  expect(report.status).toBe("stale");
  expect(report.attempts).toHaveLength(1);
  expect(report.attempts[0]?.outcome).toBe("stale");
  expect(calls).toBe(1);
});
test("invalid findings and provider failures stop the review without leaking raw errors", async () => {
  for (const mode of ["invalid", "error"]) {
    const { journal, id, request } = fixture();
    let calls = 0;
    const report = await reviewCoding(id, journal, request, async () => {
      await Promise.resolve();
      calls++;
      if (mode === "error")
        throw new Error("private upstream credential-like string");
      return JSON.stringify({
        verdict: "changes_requested",
        findings: [{ path: "outside.ts", line: 1, message: "oops" }],
      });
    });
    expect(report.status).toBe("failed");
    expect(report.failure).toBe(
      mode === "invalid" ? "invalid_output" : "unknown",
    );
    expect(report.failureStage).toBe(
      mode === "invalid" ? "validation" : "inference",
    );
    expect(report.failureRoute?.candidate.provider).toBe("a");
    expect(calls).toBe(1);
    expect(JSON.stringify(report)).not.toContain("private upstream");
  }
});

test("findings remain evidence and deadlines abort without dispatching another provider", async () => {
  const { journal, id, request } = fixture();
  const findings = await reviewCoding(id, journal, request, () =>
    Promise.resolve(
      JSON.stringify({
        verdict: "changes_requested",
        findings: [{ path: "x.ts", line: 1, message: "Check required value" }],
      }),
    ),
  );
  expect(findings.status).toBe("findings");
  expect(journal.read(id).status).toBe("ready_for_review");
  let calls = 0;
  let aborted = false;
  const timed = await reviewCoding(
    id,
    journal,
    { ...request, config: { ...request.config, timeoutMs: 100 } },
    (_task, _route, signal) => {
      calls++;
      signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {
        /* Deliberately uncooperative worker. */
      });
    },
  );
  expect(timed.status).toBe("failed");
  expect(timed.failure).toBe("unknown");
  expect(timed.attempts).toHaveLength(1);
  expect(timed.attempts[0]).toMatchObject({
    outcome: "failed",
    failure: "unknown",
    failureOrigin: "cancellation_unsettled",
    estimatedUsd: null,
  });
  expect(timed.attempts[0]?.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(calls).toBe(1);
  expect(aborted).toBe(true);
});

test("late completion cannot outrun a delayed timer callback", async () => {
  const { journal, id, request } = fixture();
  let calls = 0;
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const result = await reviewCoding(
      id,
      journal,
      { ...request, config: { ...request.config, timeoutMs: 100 } },
      () => {
        calls++;
        clock.mockReturnValue(1200);
        return Promise.resolve('{"verdict":"no_findings","findings":[]}');
      },
    );
    expect(result.status).toBe("failed");
    expect(calls).toBe(1);
  } finally {
    clock.mockRestore();
  }
});
test("rejects pinned read-only journal handles for live review freshness", async () => {
  const { journal, id, request } = fixture();
  const pinned = new CodingJournal(journal.path, { readOnly: true });
  journals.push(pinned);
  let calls = 0;
  await expect(
    reviewCoding(id, pinned, request, () => {
      calls++;
      return Promise.resolve('{"verdict":"no_findings","findings":[]}');
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("reviewers receive the saved context and context revisions invalidate reviews", async () => {
  const { journal, id, request } = fixture();
  journal.revisePrompt(id, 1, "Keep x", 200, {
    requirements: ["noUncheckedIndexedAccess"],
    facts: ["Node 24"],
  });
  const token = journal.start(id, "second", 201, 100);
  if (!token) throw new Error("No lease");
  journal.finish(
    id,
    token,
    { "x.ts": "export const x = 2;" },
    "ready_for_review",
    202,
  );
  let calls = 0;
  const report = await reviewCoding(id, journal, request, (task) => {
    calls++;
    expect(task.prompt).toContain("noUncheckedIndexedAccess");
    expect(task.prompt).toContain("not instructions");
    journal.revisePrompt(id, 2, "Keep x", 203, {
      requirements: ["New requirement"],
      facts: [],
    });
    return Promise.resolve('{"verdict":"no_findings","findings":[]}');
  });
  expect(calls).toBe(1);
  expect(report.status).toBe("stale");
});

test("records per-route latency for valid and failed review attempts without claiming known cost", async () => {
  const { journal, id, request } = fixture();
  let clock = 100;
  let calls = 0;
  const report = await reviewCoding(
    id,
    journal,
    request,
    () => {
      calls++;
      clock += calls === 1 ? 17 : 29;
      if (calls === 2) throw new Failure("quota");
      return Promise.resolve(
        JSON.stringify({ verdict: "no_findings", findings: [] }),
      );
    },
    () => clock,
  );
  expect(report.status).toBe("failed");
  expect(
    report.attempts.map(({ route, ...metrics }) => ({
      provider: route.candidate.provider,
      ...metrics,
    })),
  ).toEqual([
    {
      provider: "a",
      elapsedMs: 17,
      outcome: "assessed",
      estimatedUsd: null,
    },
    {
      provider: "b",
      elapsedMs: 29,
      outcome: "failed",
      failure: "quota",
      estimatedUsd: null,
    },
  ]);
});

test("retains estimated metered cost even when assessment validation fails", async () => {
  const { journal, id, request } = fixture();
  const config = {
    ...request.config,
    allowMetered: true,
    candidates: request.config.candidates.map((c) => ({
      ...c,
      billing: "metered",
    })),
  };
  const report = await reviewCoding(
    id,
    journal,
    { ...request, config },
    (_task, _route, _signal, onCost) => {
      onCost?.(0.023);
      return Promise.resolve("invalid");
    },
  );
  expect(report.attempts[0]).toMatchObject({
    estimatedUsd: 0.023,
    outcome: "failed",
    failure: "invalid_output",
  });
});

test("subscription reviews do not infer an incremental cost from worker estimates", async () => {
  const { journal, id, request } = fixture();
  const report = await reviewCoding(
    id,
    journal,
    request,
    (_task, _route, _signal, onCost) => {
      onCost?.(0.025);
      return Promise.resolve(
        JSON.stringify({ verdict: "no_findings", findings: [] }),
      );
    },
  );
  expect(report.attempts.map((a) => a.estimatedUsd)).toEqual([null, null]);
});

test("shutdown after the first assessment prevents another review dispatch", async () => {
  const { journal, id, request } = fixture();
  const shutdown = new AbortController();
  let calls = 0;
  const report = await reviewCoding(
    id,
    journal,
    request,
    () => {
      calls++;
      shutdown.abort();
      return Promise.resolve(
        JSON.stringify({ verdict: "no_findings", findings: [] }),
      );
    },
    () => 0,
    shutdown.signal,
  );
  expect(calls).toBe(1);
  expect(report.failure).toBe("interrupted");
  expect(report.reviews).toHaveLength(1);
  expect(report.attempts).toHaveLength(1);
});

test("records validation diagnostics separately from provider failures without provider content", async () => {
  const f = fixture();
  const report = await reviewCoding(f.id, f.journal, f.request, () =>
    Promise.resolve("private-token-marker"),
  );
  expect(report).toMatchObject({
    failure: "invalid_output",
    failureStage: "validation",
    validationFailure: "invalid_json",
    attempts: [
      { failure: "invalid_output", validationFailure: "invalid_json" },
    ],
  });
  expect(JSON.stringify(report)).not.toContain("private-token-marker");
  const provider = await reviewCoding(f.id, f.journal, f.request, () =>
    Promise.reject(new Failure("quota")),
  );
  expect(provider.failureStage).toBe("inference");
  expect(provider).not.toHaveProperty("validationFailure");
  expect(provider.attempts[0]).not.toHaveProperty("validationFailure");
});

test("failed review records bounded output shape without accepting fenced JSON or inventing transport causes", async () => {
  const f = fixture();
  const output = '```json\n{"verdict":"no_findings","findings":[]}\n```';
  let calls = 0;
  const report = await reviewCoding(f.id, f.journal, f.request, () => {
    calls++;
    return Promise.resolve(output);
  });
  expect(calls).toBe(1);
  expect(report.status).toBe("failed");
  expect(report.reviews).toEqual([]);
  expect(report.attempts[0]).toMatchObject({
    failure: "invalid_output",
    validationFailure: "invalid_json",
    outputDiagnostic: { shape: "fenced", bytes: Buffer.byteLength(output) },
  });
  expect(JSON.stringify(report)).not.toContain("```json");
  const failure = await reviewCoding(f.id, f.journal, f.request, () =>
    Promise.reject(new Failure("unknown")),
  );
  expect(failure.attempts[0]).not.toHaveProperty("outputDiagnostic");
  const success = await reviewCoding(f.id, f.journal, f.request, () =>
    Promise.resolve('{"verdict":"no_findings","findings":[]}'),
  );
  for (const attempt of success.attempts)
    expect(attempt).not.toHaveProperty("outputDiagnostic");
});

test("broken clocks preserve review decisions, unknown timing and signal cleanup", async () => {
  for (const clock of [
    () => {
      throw new Error("clock failed");
    },
    () => NaN,
    () => Infinity,
    () => -1,
    (() => {
      let n = 100;
      return () => --n;
    })(),
  ]) {
    const { journal, id, request } = fixture();
    const signals: AbortSignal[] = [];
    const report = await reviewCoding(
      id,
      journal,
      request,
      (_task, _route, signal) => {
        if (!signal) throw Error("Missing abort signal");
        signals.push(signal);
        return Promise.resolve('{"verdict":"no_findings","findings":[]}');
      },
      clock,
    );
    expect(report.status).toBe("reviewed");
    expect(report.attempts).toHaveLength(2);
    expect(report.attempts.every((a) => a.elapsedMs === null)).toBe(true);
    expect(signals.every((s) => s.aborted)).toBe(true);
  }
});

test("end-clock failure preserves provider failure and reported metered cost", async () => {
  const { journal, id, request } = fixture();
  let ticks = 0;
  let signal: AbortSignal | undefined;
  const report = await reviewCoding(
    id,
    journal,
    {
      ...request,
      config: {
        ...request.config,
        allowMetered: true,
        candidates: request.config.candidates.map((c) => ({
          ...c,
          billing: "metered",
        })),
      },
    },
    (_task, _route, s, cost) => {
      signal = s;
      cost?.(0.2);
      throw new Failure("quota");
    },
    () => {
      if (++ticks === 1) return 100;
      throw Error("clock failed");
    },
  );
  expect(report.failure).toBe("quota");
  expect(report.attempts).toMatchObject([
    { elapsedMs: null, estimatedUsd: 0.2, outcome: "failed" },
  ]);
  expect(signal?.aborted).toBe(true);
});

test("replaces a newly cooled second reviewer within the reserved pair", async () => {
  const { journal, id, request } = fixture();
  request.config.candidates.push(candidate("c"));
  const health: Record<string, { until: number }> = {};
  const providers: string[] = [];
  const report = await reviewCoding(
    id,
    journal,
    request,
    (_task, selection) => {
      providers.push(selection.candidate.provider);
      health["provider:b"] = { until: Date.now() + 60_000 };
      return Promise.resolve(
        JSON.stringify({ verdict: "no_findings", findings: [] }),
      );
    },
    () => performance.now(),
    undefined,
    () => health,
  );
  expect(report.status).toBe("reviewed");
  expect(providers).toEqual(["a", "c"]);
  expect(report.attempts).toHaveLength(2);
  expect(
    report.reviews.map((review) => review.route.candidate.provider),
  ).toEqual(["a", "c"]);
});

test("mid-pair replacement preserves billing constraints and completed evidence", async () => {
  const { journal, id, request } = fixture();
  request.config.candidates.push({ ...candidate("c"), billing: "metered" });
  const health: Record<string, { until: number }> = {};
  const providers: string[] = [];
  const report = await reviewCoding(
    id,
    journal,
    request,
    (_task, selection) => {
      providers.push(selection.candidate.provider);
      health["provider:b"] = { until: Date.now() + 60_000 };
      return Promise.resolve(
        JSON.stringify({ verdict: "no_findings", findings: [] }),
      );
    },
    () => performance.now(),
    undefined,
    () => health,
  );
  expect(report.status).toBe("waiting_retry");
  expect(report.retryAt).toBeGreaterThan(Date.now());
  expect(providers).toEqual(["a"]);
  expect(report.attempts).toHaveLength(1);
  expect(report.reviews).toHaveLength(1);
});

test("direct continuation honors its saved wait and keeps the completed finding", async () => {
  const { journal, id, request } = fixture();
  const clock = vi.spyOn(Date, "now");
  const now = Date.now();
  clock.mockReturnValue(now);
  try {
    const health: Record<string, { until: number }> = {};
    const partial = await reviewCoding(
      id,
      journal,
      request,
      () => {
        health["provider:b"] = { until: now + 60_000 };
        return Promise.resolve(
          JSON.stringify({
            verdict: "changes_requested",
            findings: [{ path: "x.ts", line: 1, message: "Use 2" }],
          }),
        );
      },
      () => 10,
      undefined,
      () => health,
    );
    expect(partial.status).toBe("waiting_retry");
    let calls = 0;
    const worker = () => {
      calls++;
      return Promise.resolve('{"verdict":"no_findings","findings":[]}');
    };
    const early = await reviewCoding(
      id,
      journal,
      request,
      worker,
      () => 10,
      undefined,
      () => ({}),
      partial,
    );
    expect(early.status).toBe("waiting_retry");
    expect(calls).toBe(0);
    clock.mockReturnValue(now + 60_000);
    const final = await reviewCoding(
      id,
      journal,
      request,
      worker,
      () => 10,
      undefined,
      () => ({}),
      partial,
    );
    expect(final.status).toBe("findings");
    expect(final.attempts).toHaveLength(2);
    expect(final.reviews[0]?.assessment.findings[0]?.message).toBe("Use 2");
    expect(calls).toBe(1);
    expect(partial.status).toBe("waiting_retry");
  } finally {
    clock.mockRestore();
  }
});

test.each(["policy", "approval", "permission", "auth"] as const)(
  "review cancellation retains late %s instead of timeout",
  async (kind) => {
    const { journal, id, request } = fixture();
    let calls = 0;
    const report = await reviewCoding(
      id,
      journal,
      { ...request, config: { ...request.config, timeoutMs: 100 } },
      (_task, _route, signal) => {
        calls++;
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              setTimeout(() => {
                reject(new Failure(kind, undefined, "worker_inference"));
              }, 10);
            },
            { once: true },
          );
        });
      },
    );
    expect(report.failure).toBe(kind);
    expect(report.attempts[0]).toMatchObject({
      failure: kind,
      failureOrigin: "worker_inference",
    });
    expect(report.reviews).toHaveLength(0);
    expect(calls).toBe(1);
  },
);
test("review cancellation does not accept late successful output", async () => {
  const { journal, id, request } = fixture();
  const report = await reviewCoding(
    id,
    journal,
    { ...request, config: { ...request.config, timeoutMs: 100 } },
    (_task, _route, signal) =>
      new Promise<string>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              resolve('{"verdict":"no_findings","findings":[]}');
            }, 10);
          },
          { once: true },
        );
      }),
  );
  expect(report.failure).toBe("timeout");
  expect(report.reviews).toHaveLength(0);
});

test("settled late quota retains its existing retry metadata", async () => {
  const { journal, id, request } = fixture();
  const report = await reviewCoding(
    id,
    journal,
    { ...request, config: { ...request.config, timeoutMs: 100 } },
    (_task, _route, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              reject(new Failure("quota", 90000, "worker_inference"));
            }, 10);
          },
          { once: true },
        );
      }),
  );
  expect(report.failure).toBe("quota");
  expect(report.retryAfterMs).toBe(90000);
  expect(report.attempts).toHaveLength(1);
});
test("late policy survives checkpoint invalidation during cancellation", async () => {
  const { journal, id, request } = fixture();
  const report = await reviewCoding(
    id,
    journal,
    { ...request, config: { ...request.config, timeoutMs: 100 } },
    (_task, _route, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            journal.revisePrompt(id, 1, "New constraints", 200);
            setTimeout(() => {
              reject(new Failure("policy", undefined, "worker_inference"));
            }, 10);
          },
          { once: true },
        );
      }),
  );
  expect(report.status).toBe("stale");
  expect(report.failure).toBe("policy");
  expect(report.reviews).toHaveLength(0);
});
test("cancellation costs are captured during drain and frozen on return", async () => {
  const { journal, id, request } = fixture();
  let reportCost: ((value: number) => void) | undefined;
  let finish: ((value: string) => void) | undefined;
  const report = await reviewCoding(
    id,
    journal,
    {
      ...request,
      config: {
        ...request.config,
        timeoutMs: 100,
        allowMetered: true,
        candidates: request.config.candidates.map((c) => ({
          ...c,
          billing: "metered",
        })),
      },
    },
    (_task, _route, signal, onCost) =>
      new Promise<string>((resolve) => {
        reportCost = onCost;
        finish = resolve;
        signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              onCost?.(0.012);
            }, 10);
          },
          { once: true },
        );
      }),
  );
  expect(report.failure).toBe("unknown");
  expect(report.attempts[0]?.estimatedUsd).toBe(0.012);
  const saved = JSON.stringify(report);
  reportCost?.(0.099);
  finish?.('{"verdict":"no_findings","findings":[]}');
  await Promise.resolve();
  await Promise.resolve();
  expect(JSON.stringify(report)).toBe(saved);
});
