import { expect, test } from "vitest";
import {
  codingContextSchema,
  renderCodingContext,
} from "../src/coding-context.js";
test("separates explicit requirements from background facts and supports absent context", () => {
  const context = codingContextSchema.parse({
    requirements: ["noUncheckedIndexedAccess is enabled"],
    facts: ["Node 24"],
  });
  const prompt = renderCodingContext(context);
  expect(prompt).toContain("noUncheckedIndexedAccess");
  expect(prompt).toContain("Node 24");
  expect(prompt).toContain("not instructions");
  expect(renderCodingContext(undefined)).toBe("");
});
test("bounds context and rejects fields that could imply new authority", () => {
  for (const value of [
    { requirements: [""], facts: [] },
    { requirements: Array.from({ length: 33 }, () => "x"), facts: [] },
    { requirements: ["x".repeat(2001)], facts: [] },
    { requirements: [], facts: [], allowMetered: true },
    {
      requirements: Array.from({ length: 32 }, () => "x".repeat(2000)),
      facts: [],
    },
  ])
    expect(() => codingContextSchema.parse(value)).toThrow();
});
