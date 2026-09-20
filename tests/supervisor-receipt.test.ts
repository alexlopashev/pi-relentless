import { test, expect } from "vitest";
import { recoverSupervisorDecision } from "../src/supervisor-receipt.js";
const expected = {
  checkpointSha256: "a".repeat(64),
  specificationSha256: "b".repeat(64),
  reportSha256: "c".repeat(64),
};
const receipt = { version: 1, ...expected, supervisorExitCode: 0 };
test("only a bound successful supervisor receipt permits an accepted decision", () => {
  expect(
    recoverSupervisorDecision(receipt, expected, {
      accepted: true,
      reason: "passed",
    }),
  ).toEqual({ accepted: true, reason: "passed", supervisorExitCode: 0 });
  expect(
    recoverSupervisorDecision({ ...receipt, supervisorExitCode: 1 }, expected, {
      accepted: true,
      reason: "passed",
    }),
  ).toEqual({
    accepted: false,
    reason: "supervisor_failed",
    supervisorExitCode: 1,
  });
  expect(
    recoverSupervisorDecision(receipt, expected, {
      accepted: false,
      reason: "failed",
    }),
  ).toEqual({ accepted: false, reason: "failed", supervisorExitCode: 0 });
});
test("missing, malformed or mismatched receipts cannot reconstruct a decision", () => {
  for (const value of [
    undefined,
    {},
    { ...receipt, version: 2 },
    { ...receipt, supervisorExitCode: NaN },
    { ...receipt, reportSha256: "d".repeat(64) },
    { ...receipt, checkpointSha256: "d".repeat(64) },
    { ...receipt, specificationSha256: "d".repeat(64) },
  ])
    expect(() =>
      recoverSupervisorDecision(value, expected, {
        accepted: true,
        reason: "passed",
      }),
    ).toThrow();
});
