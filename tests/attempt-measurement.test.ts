import { expect, test } from "vitest";
import { attemptMeasurement } from "../src/attempt-measurement.js";
test("freezes elapsed time and known metered cost, ignoring late callbacks", () => {
  let now = 10;
  const timer = attemptMeasurement(true, () => now);
  timer.cost(0.01);
  timer.cost(NaN);
  timer.cost(-1);
  timer.cost(0);
  now = 30;
  expect(timer.finish()).toEqual({ elapsedMs: 20, estimatedUsd: 0.01 });
  timer.cost(1);
  now = 100;
  expect(timer.finish()).toEqual({ elapsedMs: 20, estimatedUsd: 0.01 });
});
test("unknown and subscription cost remain null and clock failures cannot break execution", () => {
  let now = 10;
  const subscription = attemptMeasurement(false, () => now);
  subscription.cost(1);
  now = 11;
  expect(subscription.finish()).toEqual({ elapsedMs: 1, estimatedUsd: null });
  expect(attemptMeasurement(true, () => 1).finish()).toEqual({
    elapsedMs: 0,
    estimatedUsd: null,
  });
  expect(
    attemptMeasurement(true, () => {
      throw new Error("clock");
    }).finish(),
  ).toBeUndefined();
  const backwards = attemptMeasurement(true, () => now);
  now = 0;
  expect(backwards.finish()).toBeUndefined();
});
