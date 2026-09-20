import { expect, test } from "vitest";
import { wilsonLower95 } from "../src/evidence-confidence.js";
test("uses the lower endpoint of a two-sided 95 percent Wilson interval", () => {
  expect(wilsonLower95(0, 0)).toBe(0);
  expect(wilsonLower95(0, 10)).toBe(0);
  expect(wilsonLower95(3, 3)).toBeCloseTo(0.4385029682, 8);
  expect(wilsonLower95(30, 30)).toBeCloseTo(0.8864866068, 8);
  expect(wilsonLower95(5, 10)).toBeCloseTo(0.2365930905, 8);
});
test("rejects impossible counts and stays bounded at large supported samples", () => {
  for (const [pass, total] of [
    [-1, 3],
    [4, 3],
    [0.5, 3],
    [1, NaN],
    [1, Infinity],
    [1, 10001],
  ])
    expect(() => wilsonLower95(pass ?? 0, total ?? 0)).toThrow();
  expect(wilsonLower95(10000, 10000)).toBeGreaterThan(0.999);
  expect(wilsonLower95(10000, 10000)).toBeLessThan(1);
});
