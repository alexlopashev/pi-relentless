import { test, expect } from "vitest";
import { verificationTiming } from "../src/verification-timing.js";
test("separates packaging, supervisor envelope and setup/assessment without double-counting the VM", () => {
  expect(verificationTiming([100, 110, 115, 145, 150], 0.02)).toEqual({
    version: 1,
    scope: "prepare_to_assessment",
    packagingMs: 10,
    supervisorMs: 30,
    assessmentAndSetupMs: 10,
    activeMs: 50,
    vmMs: 20,
  });
});
test("clock failure or regression remains unknown, independently of valid VM timing", () => {
  for (const marks of [
    [100, 90, 115, 145, 150],
    [100, null, 115, 145, 150],
    [100, 110, Infinity, 145, 150],
    [100, 110, 115, 145],
  ])
    expect(verificationTiming(marks, 0.02)).toMatchObject({
      packagingMs: null,
      supervisorMs: null,
      assessmentAndSetupMs: null,
      activeMs: null,
      vmMs: 20,
    });
  expect(verificationTiming([1, 1, 1, 1, 1], Number.MAX_VALUE)).toMatchObject({
    activeMs: 0,
    vmMs: null,
  });
});
