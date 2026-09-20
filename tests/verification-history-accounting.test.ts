import { test, expect } from "vitest";
import { verificationHistoryAccounting } from "../src/verification-history-accounting.js";
const recorded = (activeMs: number | null) => ({
  proof: { timing: { activeMs } },
});
test("sums all recorded verification attempts without dropping failures or claiming pending time", () => {
  expect(
    verificationHistoryAccounting([recorded(10), recorded(20)], true),
  ).toEqual({
    observedAttempts: 2,
    recorded: 2,
    pending: 0,
    knownActiveMs: 30,
    elapsedMs: 30,
    complete: true,
  });
  expect(
    verificationHistoryAccounting([recorded(10), { proof: null }], true),
  ).toMatchObject({
    pending: 1,
    knownActiveMs: 10,
    elapsedMs: null,
    complete: false,
  });
});
test("legacy or missing timing remains unknown and overflow is rejected", () => {
  expect(verificationHistoryAccounting(undefined, false)).toMatchObject({
    complete: false,
    elapsedMs: null,
  });
  expect(verificationHistoryAccounting([recorded(10)], false)).toMatchObject({
    complete: false,
    knownActiveMs: 10,
    elapsedMs: null,
  });
  expect(verificationHistoryAccounting([{ proof: {} }], true)).toMatchObject({
    complete: false,
    elapsedMs: null,
  });
  expect(() => verificationHistoryAccounting([recorded(-1)], true)).toThrow();
  expect(() =>
    verificationHistoryAccounting(
      [recorded(Number.MAX_VALUE), recorded(Number.MAX_VALUE)],
      true,
    ),
  ).toThrow();
});
