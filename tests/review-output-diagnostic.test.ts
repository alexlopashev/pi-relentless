import { expect, test } from "vitest";
import { reviewOutputDiagnostic } from "../src/review-output-diagnostic.js";

test("describes malformed output structure without retaining content or inferring cause", () => {
  const cases = [
    ["  \n", "empty", 3],
    ["```json\nsecret\n```", "fenced", 18],
    ["  {secret", "json_like", 9],
    ["[secret", "json_like", 7],
    ["secret", "other", 6],
    ["é", "other", 2],
    ["x".repeat(65536), "other", 65536],
    ["x".repeat(65537), "oversized", 65537],
    [" ".repeat(70000), "oversized", 65537],
  ] as const;
  for (const [output, shape, bytes] of cases) {
    const value = reviewOutputDiagnostic(output);
    expect(value).toEqual({ shape, bytes });
    expect(JSON.stringify(value)).not.toContain("secret");
  }
});
