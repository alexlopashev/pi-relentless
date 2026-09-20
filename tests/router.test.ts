import { describe, expect, it } from "vitest";
import {
  route,
  configSchema,
  type Candidate,
  type Task,
} from "../src/router.js";
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  name: "small",
  provider: "openai-codex",
  model: "small-model",
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["off", "low", "high"],
  ...overrides,
});
const task: Task = {
  id: "t1",
  prompt: "Inspect the proposal",
  minQuality: 1,
  effort: "low",
};
describe("routing", () => {
  it("uses the lowest sufficient quality tier and requested effort", () => {
    expect(
      route(task, [candidate({ name: "big", quality: 3 }), candidate()], false)
        .candidate.name,
    ).toBe("small");
    expect(route(task, [candidate()], false).effort).toBe("low");
  });
  it("preserves a quality floor and explicit provider", () => {
    expect(
      route(
        { ...task, minQuality: 3, provider: "xai" },
        [candidate(), candidate({ name: "grok", provider: "xai", quality: 3 })],
        false,
      ).candidate.name,
    ).toBe("grok");
  });
  it("uses preference only among sufficient candidates at the same tier", () => {
    expect(
      route(
        task,
        [candidate({ name: "second", preference: 2 }), candidate()],
        false,
      ).candidate.name,
    ).toBe("small");
  });
  it("raises effort to the lowest supported level without weakening it", () => {
    expect(
      route(task, [candidate({ efforts: ["off", "high"] })], false).effort,
    ).toBe("high");
  });
  it.each([
    [candidate({ enabled: false })],
    [candidate({ billing: "metered" })],
    [candidate({ efforts: ["off"] })],
    [candidate({ quality: 1 })],
  ])("fails closed if no eligible route exists", (entry) => {
    expect(() => route({ ...task, minQuality: 2 }, [entry], false)).toThrow(
      "No eligible route",
    );
  });
  it("never silently falls back to metered usage", () => {
    const paid = candidate({ billing: "metered" });
    expect(() => route(task, [paid], false)).toThrow("No eligible route");
    expect(route(task, [paid], true).candidate.billing).toBe("metered");
  });
  it("rejects unsupported or ambiguous configuration", () => {
    expect(() =>
      configSchema.parse({ candidates: [candidate(), candidate()] }),
    ).toThrow();
    expect(() =>
      configSchema.parse({ candidates: [candidate()], maxConcurrency: 0 }),
    ).toThrow();
    expect(() =>
      configSchema.parse({ candidates: [candidate({ efforts: [] })] }),
    ).toThrow();
    expect(() =>
      configSchema.parse({ candidates: [candidate()], allowMeterd: true }),
    ).toThrow();
  });
});
it("skips an insufficient effort candidate and deterministically breaks ties", () => {
  const base: Candidate = {
    name: "b",
    provider: "xai",
    model: "model",
    billing: "subscription",
    enabled: true,
    quality: 2,
    preference: 1,
    efforts: ["low"],
  };
  const task: Task = {
    id: "x",
    prompt: "Review",
    minQuality: 2,
    effort: "high",
    provider: "xai",
  };
  expect(
    route(
      task,
      [
        base,
        { ...base, name: "a", efforts: ["high"] },
        { ...base, name: "c", provider: "other", efforts: ["high"] },
      ],
      false,
    ).candidate.name,
  ).toBe("a");
  expect(
    route({ ...task, effort: "low" }, [base, { ...base, name: "a" }], false)
      .candidate.name,
  ).toBe("a");
  expect(
    route(
      task,
      [base, { ...base, name: "higher", quality: 3, efforts: ["high"] }],
      false,
    ).candidate.name,
  ).toBe("higher");
});
