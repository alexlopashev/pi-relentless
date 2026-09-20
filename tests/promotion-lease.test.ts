import { expect, test } from "vitest";
import { capturePromotionLease } from "../src/promotion-lease.js";
test("promotion captures only a live bounded lease without mutating it", () => {
  const lease = { owner: "scheduler", until: 1000 };
  const result = capturePromotionLease(lease, 100);
  expect(result).toEqual(lease);
  expect(result).not.toBe(lease);
});
test("absent, expired or malformed authority cannot reach a source installer", () => {
  for (const lease of [
    null,
    undefined,
    { owner: "", until: 1000 },
    { owner: "a", until: 100 },
    { owner: "a", until: NaN },
    { owner: "a", until: Infinity },
    { owner: "a", until: 1.5 },
    { owner: "a", until: 1000, extra: true },
  ])
    expect(() => capturePromotionLease(lease, 100)).toThrow();
  for (const now of [-1, NaN, Infinity, 0.5])
    expect(() =>
      capturePromotionLease({ owner: "a", until: 1000 }, now),
    ).toThrow();
});
