import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { canonicalDigest } from "../src/verification-assessment.js";
import { buildInstallationReceipt } from "../src/source-installation-receipt.js";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const request = {
    root: "/project",
    checkpointSha256: "a".repeat(64),
    coding: { id: "work" },
    files: [{ path: "x.ts", current: "new" }],
  };
  const value = { request, rootIdentity: [1, 2], status: "applied", files: [] };
  const record = { value, sha256: canonicalDigest(value) };
  const expected = {
    root: "/project",
    rootIdentity: [1, 2] as [number, number],
    codingId: "work",
    checkpointSha256: "a".repeat(64),
    files: [{ path: "x.ts", sha256: sha("new") }],
  };
  return { request, record, expected };
}
test("installation receipt binds request and transaction to verified files observed in source", () => {
  const f = fixture();
  expect(
    buildInstallationReceipt("/receipt", f.request, f.record, f.expected, {
      "x.ts": "new",
    }),
  ).toEqual({
    directory: "/receipt",
    requestSha256: canonicalDigest(f.request),
    stateSha256: f.record.sha256,
  });
});
test("changed source, corrupt or incomplete transactions and mismatched requests fail", () => {
  const f = fixture();
  expect(() =>
    buildInstallationReceipt("/receipt", f.request, f.record, f.expected, {
      "x.ts": "edited",
    }),
  ).toThrow();
  expect(() =>
    buildInstallationReceipt(
      "/receipt",
      f.request,
      { ...f.record, sha256: "f".repeat(64) },
      f.expected,
      { "x.ts": "new" },
    ),
  ).toThrow();
  const value = { ...f.record.value, status: "incomplete" };
  expect(() =>
    buildInstallationReceipt(
      "/receipt",
      f.request,
      { value, sha256: canonicalDigest(value) },
      f.expected,
      { "x.ts": "new" },
    ),
  ).toThrow();
  expect(() =>
    buildInstallationReceipt(
      "/receipt",
      { ...f.request, root: "/other" },
      f.record,
      f.expected,
      { "x.ts": "new" },
    ),
  ).toThrow();
  expect(() =>
    buildInstallationReceipt(
      "/receipt",
      f.request,
      f.record,
      { ...f.expected, rootIdentity: [1, 3] },
      { "x.ts": "new" },
    ),
  ).toThrow();
  expect(() =>
    buildInstallationReceipt(
      "/receipt",
      f.request,
      f.record,
      { ...f.expected, files: [] },
      { "x.ts": "new" },
    ),
  ).toThrow();
});
