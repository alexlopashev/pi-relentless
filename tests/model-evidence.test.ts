import { expect, it } from "vitest";
import {
  assessRoutes,
  rankRoutes,
  type Observation,
} from "../src/model-evidence.js";
import type { Route } from "../src/router.js";
const now = 100000;
const suiteHash = "a".repeat(64);
const policy = {
  workload: "code",
  suiteHash,
  caseIds: ["0", "1", "2"],
  metric: "latency",
};
function route(name: string): Route {
  return {
    candidate: {
      name,
      provider: name,
      model: "model",
      billing: "subscription",
      quality: 1,
      preference: 1,
      enabled: true,
      efforts: ["low", "high"],
    },
    effort: "low",
  };
}
function evidence(
  provider: string,
  elapsedMs: number,
  estimatedUsd: number | null = null,
): Observation[] {
  return Array.from({ length: 3 }, (_, i) => ({
    id: provider + String(i),
    provider,
    billing: "subscription",
    model: "model",
    effort: "low",
    workload: "code",
    suiteHash,
    caseId: String(i),
    completedAt: now,
    accepted: true,
    elapsedMs,
    estimatedUsd,
  }));
}
it("ranks measured latency only within the supplied eligible routes", () => {
  const rows = [
    ...evidence("fast", 10),
    ...evidence("slow", 100),
    ...evidence("excluded", 1),
  ];
  expect(
    rankRoutes([route("slow"), route("fast")], rows, policy, now).map(
      (r) => r.route.candidate.name,
    ),
  ).toEqual(["fast", "slow"]);
});
it("includes failed-attempt time and cost in successful-task scores", () => {
  const rows = evidence("a", 10, 0.1);
  rows.push(
    ...evidence("a", 100, 0.7).map((r) => ({
      ...r,
      id: r.id + "fail",
      accepted: false,
    })),
  );
  expect(
    rankRoutes([route("a")], rows, { ...policy, minSuccessRate: 0.5 }, now)[0]
      ?.score,
  ).toBeCloseTo(110);
  expect(
    rankRoutes(
      [route("a")],
      rows,
      { ...policy, metric: "cost", minSuccessRate: 0.5 },
      now,
    )[0]?.score,
  ).toBeCloseTo(0.8);
  expect(rankRoutes([route("a")], rows, policy, now)).toEqual([]);
});
it("never treats missing costs as free", () => {
  expect(
    rankRoutes(
      [route("a")],
      evidence("a", 10),
      { ...policy, metric: "cost" },
      now,
    ),
  ).toEqual([]);
  expect(
    rankRoutes(
      [route("a")],
      evidence("a", 10, 0),
      { ...policy, metric: "cost" },
      now,
    )[0]?.score,
  ).toBe(0);
});
it.each(["provider", "model", "effort", "workload", "suiteHash"])(
  "rejects evidence from another %s",
  (key) => {
    const rows = evidence("a", 10).map((r) => ({
      ...r,
      [key]: key === "suiteHash" ? "b".repeat(64) : "other",
    }));
    expect(rankRoutes([route("a")], rows, policy, now)).toEqual([]);
  },
);
it("requires fresh non-future samples and sufficient distinct cases", () => {
  expect(
    rankRoutes(
      [route("a")],
      evidence("a", 10),
      { ...policy, maxAgeMs: 100 },
      now + 101,
    ),
  ).toEqual([]);
  expect(rankRoutes([route("a")], evidence("a", 10), policy, now - 1)).toEqual(
    [],
  );
  expect(
    rankRoutes([route("a")], evidence("a", 10).slice(0, 2), policy, now),
  ).toEqual([]);
  expect(
    rankRoutes(
      [route("a")],
      evidence("a", 10).map((r) => ({ ...r, caseId: "one" })),
      policy,
      now,
    ),
  ).toEqual([]);
});
it("rejects duplicate evidence and malformed numeric values", () => {
  const rows = evidence("a", 10);
  expect(() =>
    rankRoutes([route("a")], [...rows, rows[0]], policy, now),
  ).toThrow();
  expect(() =>
    rankRoutes(
      [route("a")],
      rows.map((r) => ({ ...r, elapsedMs: Infinity })),
      policy,
      now,
    ),
  ).toThrow();
  expect(() => rankRoutes([route("a")], rows, policy, NaN)).toThrow();
});
it("keeps baseline route order on an exact score tie and excludes all failures", () => {
  expect(
    rankRoutes(
      [route("b"), route("a")],
      [...evidence("a", 10), ...evidence("b", 10)],
      policy,
      now,
    ).map((r) => r.route.candidate.name),
  ).toEqual(["b", "a"]);
  expect(
    rankRoutes(
      [route("a")],
      evidence("a", 10).map((r) => ({ ...r, accepted: false })),
      { ...policy, minSuccessRate: 0.5 },
      now,
    ),
  ).toEqual([]);
});

it("does not reuse subscription evidence for a metered route", () => {
  const metered = route("a");
  metered.candidate.billing = "metered";
  expect(
    rankRoutes(
      [metered],
      evidence("a", 10, 0),
      { ...policy, metric: "cost" },
      now,
    ),
  ).toEqual([]);
});
it("requires balanced coverage of every declared case", () => {
  const rows = evidence("a", 10);
  expect(
    rankRoutes(
      [route("a")],
      [
        ...rows,
        ...rows
          .filter((r) => r.caseId === "0")
          .map((r) => ({ ...r, id: r.id + "repeat" })),
      ],
      policy,
      now,
    ),
  ).toEqual([]);
  expect(
    rankRoutes(
      [route("a")],
      rows.map((r) => ({
        ...r,
        caseId: r.caseId === "2" ? "other" : r.caseId,
      })),
      policy,
      now,
    ),
  ).toEqual([]);
});
it("does not hide a failed required case behind a strong aggregate", () => {
  const ids = Array.from({ length: 10 }, (_, i) => String(i));
  const rows = ids.map((caseId, i) => ({
    ...evidence("a", 10)[0],
    id: `case-${caseId}`,
    caseId,
    accepted: i !== 9,
  }));
  expect(
    rankRoutes([route("a")], rows, { ...policy, caseIds: ids }, now),
  ).toEqual([]);
});
it("applies confidence and sample requirements to each case, never pooled trials", () => {
  const repeated = Array.from({ length: 30 }, (_, repeat) =>
    evidence("a", 10).map((row) => ({
      ...row,
      id: `${row.id}-${String(repeat)}`,
    })),
  ).flat();
  const guarded = { ...policy, minCaseLowerBound95: 0.8, minCaseSamples: 3 };
  expect(rankRoutes([route("a")], evidence("a", 10), guarded, now)).toEqual([]);
  const ranked = rankRoutes([route("a")], repeated, guarded, now)[0];
  expect(ranked?.cases).toHaveLength(3);
  expect(ranked?.cases[0]?.lowerBound95).toBeCloseTo(0.8864866068, 8);
  expect(
    rankRoutes([route("a")], repeated, { ...guarded, minCaseSamples: 31 }, now),
  ).toEqual([]);
});

it("keeps unknown latency as missing evidence rather than free successful work", () => {
  const rows = evidence("a", 10).map((row) => ({ ...row, elapsedMs: null }));
  expect(rankRoutes([route("a")], rows, policy, now)).toEqual([]);
});

it("active-time ranking accounts for complete workflow work instead of author latency", () => {
  const rows = [
    ...evidence("fast-author", 10).map((r) => ({ ...r, activeMs: 300 })),
    ...evidence("efficient-workflow", 50).map((r) => ({ ...r, activeMs: 100 })),
  ];
  expect(
    rankRoutes(
      [route("fast-author"), route("efficient-workflow")],
      rows,
      { ...policy, metric: "activeTime" },
      now,
    ).map((r) => r.route.candidate.name),
  ).toEqual(["efficient-workflow", "fast-author"]);
  expect(
    rankRoutes(
      [route("fast-author")],
      evidence("fast-author", 10),
      { ...policy, metric: "activeTime" },
      now,
    ),
  ).toEqual([]);
  const incomplete = rows.map((r) =>
    r.id === "efficient-workflow0" ? { ...r, activeMs: null } : r,
  );
  expect(
    rankRoutes(
      [route("efficient-workflow")],
      incomplete,
      { ...policy, metric: "activeTime" },
      now,
    ),
  ).toEqual([]);
  const failed = rows
    .filter((r) => r.provider === "efficient-workflow")
    .map((r) => ({
      ...r,
      id: r.id + "failed",
      accepted: false,
      activeMs: 900,
    }));
  expect(
    rankRoutes(
      [route("efficient-workflow")],
      [...rows, ...failed],
      { ...policy, metric: "activeTime", minSuccessRate: 0.5 },
      now,
    )[0]?.score,
  ).toBe(1000);
});

it("explains missing case samples and costs without treating unknown as free", () => {
  const [result] = assessRoutes(
    [route("a")],
    evidence("a", 10),
    { ...policy, metric: "cost", minCaseSamples: 2 },
    now,
  );
  expect(result?.qualified).toBe(false);
  expect(result?.score).toBeNull();
  expect(result?.reasons).toEqual(
    expect.arrayContaining(["case_samples", "missing_metric"]),
  );
  expect(result?.cases.map((c) => c.samples)).toEqual([1, 1, 1]);
});
it("assessment excludes expired and incompatible evidence and reports coverage gaps", () => {
  const rows = evidence("a", 10).map((r, i) =>
    i === 0
      ? { ...r, completedAt: now - 1001 }
      : i === 1
        ? { ...r, billing: "metered" as const }
        : r,
  );
  const [result] = assessRoutes(
    [route("a")],
    rows,
    { ...policy, maxAgeMs: 1000 },
    now,
  );
  expect(result?.samples).toBe(1);
  expect(result?.reasons).toEqual(
    expect.arrayContaining([
      "unbalanced_cases",
      "case_samples",
      "samples",
      "cases",
    ]),
  );
});
it("qualified assessments preserve ranking scores and input order including failures", () => {
  const routes = [route("slow"), route("fast")];
  const rows = [...evidence("slow", 30, 1), ...evidence("fast", 10, 2)];
  const assessed = assessRoutes(routes, rows, policy, now);
  expect(assessed.map((r) => r.route.candidate.name)).toEqual(["slow", "fast"]);
  expect(assessed.map((r) => r.score)).toEqual([30, 10]);
  expect(assessed.every((r) => r.qualified && r.reasons.length === 0)).toBe(
    true,
  );
  expect(rankRoutes(routes, rows, policy, now).map((r) => r.score)).toEqual([
    10, 30,
  ]);
});
