import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { parseCodingEdits } from "../src/coding-edits.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const source = "const first = 1;\nconst second = 2;\n";
const files = new Map([["x.ts", source]]);
const writable = new Set(["x.ts"]);
const reply = (replacements: unknown[], baseSha256 = hash(source)) =>
  JSON.stringify({ edits: [{ path: "x.ts", baseSha256, replacements }] });
test("targeted edits bind to the exact snapshot and resolve simultaneously", () => {
  const result = parseCodingEdits(
    reply([
      { oldText: "first = 1", newText: "second = 2" },
      { oldText: "second = 2", newText: "last = 3" },
    ]),
    writable,
    files,
  );
  expect(result).toEqual([
    { path: "x.ts", content: "const second = 2;\nconst last = 3;\n" },
  ]);
  expect(files.get("x.ts")).toBe(source);
});
test.each(
  [
    [{ oldText: "missing", newText: "x" }],
    [{ oldText: "const", newText: "let" }],
    [
      { oldText: "first = 1", newText: "x" },
      { oldText: "= 1;", newText: "y" },
    ],
    [{ oldText: "", newText: "x" }],
    [{ oldText: "first", newText: "\u0000" }],
  ].map((replacements) => ({ replacements })),
)(
  "rejects missing, ambiguous, overlapping and invalid replacements",
  ({ replacements }) => {
    expect(() =>
      parseCodingEdits(reply(replacements), writable, files),
    ).toThrow();
    expect(files.get("x.ts")).toBe(source);
  },
);
test("hash mismatch, missing snapshot, read-only and mixed edit forms fail closed", () => {
  const changes = [{ oldText: "first", newText: "third" }];
  expect(() =>
    parseCodingEdits(reply(changes, "0".repeat(64)), writable, files),
  ).toThrow();
  expect(() => parseCodingEdits(reply(changes), writable)).toThrow();
  expect(() => parseCodingEdits(reply(changes), new Set(), files)).toThrow();
  expect(() =>
    parseCodingEdits(
      JSON.stringify({
        edits: [
          {
            path: "x.ts",
            content: "new",
            baseSha256: hash(source),
            replacements: changes,
          },
        ],
      }),
      writable,
      files,
    ),
  ).toThrow();
});
test("legacy replacements remain supported but duplicate paths and later invalid edits are rejected atomically", () => {
  expect(
    parseCodingEdits(
      '{"edits":[{"path":"x.ts","content":"new"}]}',
      writable,
      files,
    ),
  ).toEqual([{ path: "x.ts", content: "new" }]);
  expect(() =>
    parseCodingEdits(
      '{"edits":[{"path":"x.ts","content":"new"},{"path":"x.ts","content":"other"}]}',
      writable,
      files,
    ),
  ).toThrow();
  expect(() =>
    parseCodingEdits(
      '{"edits":[{"path":"x.ts","content":"new"},{"path":"readonly.ts","content":"other"}]}',
      writable,
      files,
    ),
  ).toThrow();
  expect(files.get("x.ts")).toBe(source);
});
test("final UTF-8 file size, aggregate source size and traversal are bounded", () => {
  expect(() =>
    parseCodingEdits(
      reply([{ oldText: "first", newText: "🌍".repeat(9000) }]),
      writable,
      files,
    ),
  ).toThrow();
  const big = new Map([
    ["a.ts", "a".repeat(32000)],
    ["b.ts", "b".repeat(32000)],
    ["c.ts", "c".repeat(32000)],
    ["d.ts", "d".repeat(32000)],
    ["x.ts", ""],
  ]);
  expect(() =>
    parseCodingEdits(
      JSON.stringify({ edits: [{ path: "x.ts", content: "x".repeat(4000) }] }),
      writable,
      big,
    ),
  ).toThrow();
  expect(() =>
    parseCodingEdits(
      '{"edits":[{"path":"../x.ts","content":"x"}]}',
      new Set(["../x.ts"]),
    ),
  ).toThrow();
});

test("overlapping occurrences of one anchor are ambiguous", () => {
  const original = "aaa";
  expect(() =>
    parseCodingEdits(
      reply([{ oldText: "aa", newText: "b" }], hash(original)),
      writable,
      new Map([["x.ts", original]]),
    ),
  ).toThrow("occurrence");
});
test("result expansion is bounded even when each individual replacement fits", () => {
  const original = "a" + "b".repeat(31999);
  expect(() =>
    parseCodingEdits(
      reply([{ oldText: "a", newText: "c".repeat(1000) }], hash(original)),
      writable,
      new Map([["x.ts", original]]),
    ),
  ).toThrow("File size");
});

test.each([
  ["not-json", "invalid_json"],
  ['{"edits":[]}', "invalid_edits"],
  ['{"edits":[{"path":"secret.ts","content":"sensitive"}]}', "invalid_path"],
  [reply([{ oldText: "absent secret", newText: "x" }]), "text_occurrence"],
  [
    reply([{ oldText: "first", newText: "x" }], "0".repeat(64)),
    "hash_mismatch",
  ],
])(
  "invalid coding edits retain a bounded reason without response data",
  (output, reason) => {
    try {
      parseCodingEdits(output, writable, files);
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toMatchObject({ reason });
      expect(String(error)).not.toContain("secret");
    }
  },
);
