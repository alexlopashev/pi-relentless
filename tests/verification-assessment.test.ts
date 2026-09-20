import { expect, test } from "vitest";
import {
  assessVerification,
  canonicalDigest,
} from "../src/verification-assessment.js";
const artifact = { path: "/runtime", sha256: "a".repeat(64) };
const manifest = {
  version: 1,
  emulator: artifact,
  kernel: artifact,
  image: artifact,
  wallSeconds: 30,
  outputBytes: 65536,
  candidateSha256: "b".repeat(64),
  testSha256: "c".repeat(64),
};
const report = {
  version: 1,
  outcome: "executed",
  acceptance: "not_assessed",
  inputs: manifest,
  manifestSha256: "",
  controller: {
    exitCode: 0,
    candidateSha256: manifest.candidateSha256,
    testSha256: manifest.testSha256,
  },
  emulatorExitCode: 0,
  reaped: true,
  elapsedSeconds: 1,
  outputBytes: 1,
  hostMemoryBound: false,
};
function valid() {
  return { ...report, manifestSha256: canonicalDigest(manifest) };
}
test("accepts only the declared process-exit rule with exact protected input bindings", () => {
  expect(
    assessVerification(
      manifest,
      valid(),
      manifest.candidateSha256,
      manifest.testSha256,
    ),
  ).toEqual({ accepted: true, reason: "declared_test_process_exited_zero" });
});
test("failed, uncertain and unreaped execution cannot satisfy acceptance", () => {
  for (const mutation of [
    {
      outcome: "test_process_failed",
      controller: { ...report.controller, exitCode: 1 },
    },
    { outcome: "wall_limit" },
    { reaped: false },
    { emulatorExitCode: 1 },
    { controller: null },
  ]) {
    expect(
      assessVerification(
        manifest,
        { ...valid(), ...mutation },
        manifest.candidateSha256,
        manifest.testSha256,
      ).accepted,
    ).toBe(false);
  }
});
test("rejects altered runtime, test or source identity and forged success hashes", () => {
  for (const mutation of [
    { manifestSha256: "d".repeat(64) },
    { inputs: { ...manifest, wallSeconds: 60 } },
    { controller: { ...report.controller, testSha256: "d".repeat(64) } },
  ]) {
    expect(() =>
      assessVerification(
        manifest,
        { ...valid(), ...mutation },
        manifest.candidateSha256,
        manifest.testSha256,
      ),
    ).toThrow();
  }
  expect(() =>
    assessVerification(manifest, valid(), "f".repeat(64), manifest.testSha256),
  ).toThrow();
  expect(() =>
    assessVerification(
      manifest,
      valid(),
      manifest.candidateSha256,
      "f".repeat(64),
    ),
  ).toThrow();
});
test("canonical encoding matches Python's sorted ASCII JSON convention", () => {
  expect(canonicalDigest({ z: "😀", a: "é" })).toBe(
    canonicalDigest({ a: "é", z: "😀" }),
  );
  expect(canonicalDigest({ z: "😀", a: "é" })).toBe(
    "dd8d40259250e78e3d39d706448e64103ffb7ae785389d289770f18c5be8a742",
  );
});

test("canonical encoding escapes DEL like the Python supervisor", () => {
  expect(canonicalDigest({ path: "/runtime\u007f" })).toBe(
    "90bdaa415f9a1f3568f9b48221e94ae17a9c1010c14bea5c49d42c32aa8df920",
  );
});
