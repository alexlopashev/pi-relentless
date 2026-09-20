import { expect, test } from "vitest";
import { parseReviewFindings } from "../src/review-findings.js";
test("accepts bounded findings in known proposed files and consistent verdicts", () => {
  expect(
    parseReviewFindings('{"verdict":"no_findings","findings":[]}', {
      "x.ts": "x",
    }),
  ).toEqual({ verdict: "no_findings", findings: [] });
  expect(
    parseReviewFindings(
      '{"verdict":"changes_requested","findings":[{"path":"x.ts","line":2,"message":"Wrong return"}]}',
      { "x.ts": "first\nsecond" },
    ).findings,
  ).toHaveLength(1);
});
test("rejects unknown files, out of range lines, contradictions and unstructured output", () => {
  for (const output of [
    '{"verdict":"no_findings","findings":[{"path":"x.ts","line":1,"message":"bug"}]}',
    '{"verdict":"changes_requested","findings":[]}',
    '{"verdict":"changes_requested","findings":[{"path":"other","line":1,"message":"bug"}]}',
    '{"verdict":"changes_requested","findings":[{"path":"x.ts","line":2,"message":"bug"}]}',
    '{"verdict":"no_findings","findings":[],"command":"publish"}',
    "not json",
    "x".repeat(65537),
  ])
    expect(() => parseReviewFindings(output, { "x.ts": "x" })).toThrow();
});

test("validation failures expose bounded reason codes without echoing provider content", () => {
  const cases: [string, string][] = [
    ["private-token-marker", "invalid_json"],
    [
      JSON.stringify({ verdict: "private-token-marker", findings: [] }),
      "invalid_schema",
    ],
    [
      JSON.stringify({
        verdict: "changes_requested",
        findings: [
          { path: "private-token-marker", line: 1, message: "secret" },
        ],
      }),
      "unknown_file",
    ],
    [
      JSON.stringify({
        verdict: "changes_requested",
        findings: [{ path: "x.ts", line: 99, message: "private-token-marker" }],
      }),
      "line_out_of_range",
    ],
    ["private-token-marker".repeat(4000), "output_too_large"],
  ];
  for (const [output, code] of cases) {
    let failure: unknown;
    try {
      parseReviewFindings(output, { "x.ts": "one" });
    } catch (error) {
      failure = error;
    }
    expect(failure).toHaveProperty("code", code);
    expect(String(failure)).not.toContain("private-token-marker");
    expect(JSON.stringify(failure)).not.toContain("private-token-marker");
  }
});
