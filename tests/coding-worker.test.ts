import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runCoding } from "../src/coding-worker.js";
import { configSchema } from "../src/router.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((p) => rm(p, { recursive: true, force: true })));
  roots.length = 0;
});
const config = configSchema.parse({
  candidates: [
    {
      name: "fixture",
      provider: "fixture",
      model: "offline",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coding-test-"));
  roots.push(root);
  await writeFile(
    join(root, "sum.mjs"),
    "export function sum(a,b) { return a + b;\n",
  );
  return {
    sourceRoot: root,
    task: {
      id: "repair",
      prompt: "Repair the syntax",
      minQuality: 1,
      effort: "low",
    },
    files: [{ path: "sum.mjs", writable: true }],
    maxAttempts: 2,
  };
}
test("edits a disposable copy, feeds check failures back, and leaves source untouched", async () => {
  const request = await fixture();
  let calls = 0;
  const result = await runCoding(request, config, (task) => {
    calls++;
    if (calls === 2) expect(task.prompt).toContain("syntax");
    return Promise.resolve(
      JSON.stringify({
        edits: [
          {
            path: "sum.mjs",
            content:
              calls === 1
                ? "export function sum(a,b) {"
                : "export function sum(a,b) { return a + b; }\n",
          },
        ],
      }),
    );
  });
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(calls).toBe(2);
  expect(await readFile(join(request.sourceRoot, "sum.mjs"), "utf8")).toBe(
    "export function sum(a,b) { return a + b;\n",
  );
  const changes = await readFile(
    join(result.directory, "changes.json"),
    "utf8",
  );
  expect(changes).toContain("beforeSha256");
  expect(changes).toContain("return a + b; }");
});
test.each(["../escape.mjs", "/tmp/escape.mjs", ".env", "a/../sum.mjs"])(
  "rejects unsafe manifest path %s before inference",
  async (path) => {
    const request = await fixture();
    let calls = 0;
    await expect(
      runCoding(
        { ...request, files: [{ path, writable: true }] },
        config,
        () => {
          calls++;
          return Promise.resolve("");
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  },
);
test("rejects symlinks before exposing source to a model", async () => {
  const request = await fixture();
  await symlink(
    join(request.sourceRoot, "sum.mjs"),
    join(request.sourceRoot, "link.mjs"),
  );
  await expect(
    runCoding(
      { ...request, files: [{ path: "link.mjs", writable: true }] },
      config,
      () => Promise.resolve(""),
    ),
  ).rejects.toThrow(/symbolic/i);
});
test("rejects a whole edit batch if one path is unauthorized", async () => {
  const request = await fixture();
  const result = await runCoding(request, config, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [
          { path: "sum.mjs", content: "export const x = 1;" },
          { path: "outside.mjs", content: "bad" },
        ],
      }),
    ),
  );
  roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(
    await readFile(join(result.directory, "workspace", "sum.mjs"), "utf8"),
  ).toContain("return a + b;\n");
});
test("syntax checking never executes generated code", async () => {
  const request = await fixture();
  const result = await runCoding(request, config, () =>
    Promise.resolve(
      JSON.stringify({
        edits: [
          { path: "sum.mjs", content: "throw new Error('must not run');" },
        ],
      }),
    ),
  );
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
});
test("read-only context cannot be edited", async () => {
  const request = await fixture();
  await writeFile(join(request.sourceRoot, "context.txt"), "unchanged");
  const result = await runCoding(
    {
      ...request,
      files: [...request.files, { path: "context.txt", writable: false }],
    },
    config,
    () =>
      Promise.resolve(
        JSON.stringify({
          edits: [{ path: "context.txt", content: "changed" }],
        }),
      ),
  );
  roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(
    await readFile(join(result.directory, "workspace", "context.txt"), "utf8"),
  ).toBe("unchanged");
});
test("exhausts the repair budget without claiming success", async () => {
  const request = await fixture();
  let calls = 0;
  const result = await runCoding(request, config, () => {
    calls++;
    return Promise.resolve(
      JSON.stringify({
        edits: [{ path: "sum.mjs", content: "export function broken(" }],
      }),
    );
  });
  roots.push(result.directory);
  expect(result.status).toBe("exhausted");
  expect(calls).toBe(2);
});
test("provider denials block without trying another model", async () => {
  const request = await fixture();
  let calls = 0;
  const result = await runCoding(request, config, () => {
    calls++;
    return Promise.reject(new Error("Policy violation"));
  });
  roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(calls).toBe(1);
});
test("TypeScript and JSON replacements receive fixed checks", async () => {
  const request = await fixture();
  await writeFile(
    join(request.sourceRoot, "typed.ts"),
    "export const x: number = ;",
  );
  await writeFile(join(request.sourceRoot, "data.json"), "{");
  const result = await runCoding(
    {
      ...request,
      files: [
        { path: "typed.ts", writable: true },
        { path: "data.json", writable: true },
      ],
    },
    config,
    () =>
      Promise.resolve(
        JSON.stringify({
          edits: [
            { path: "typed.ts", content: "export const x: number = 1;" },
            { path: "data.json", content: "{}" },
          ],
        }),
      ),
  );
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
});
test("rejects special files before opening or inference", async () => {
  const { execFileSync } = await import("node:child_process");
  const request = await fixture();
  execFileSync("/usr/bin/mkfifo", [join(request.sourceRoot, "pipe.mjs")]);
  await expect(
    runCoding(
      { ...request, files: [{ path: "pipe.mjs", writable: true }] },
      config,
      () => Promise.resolve(""),
    ),
  ).rejects.toThrow(/regular file/i);
});
test("does not label unchanged valid source as a reviewable patch", async () => {
  const request = await fixture();
  const source = "export const x = 1;";
  await writeFile(join(request.sourceRoot, "sum.mjs"), source);
  const result = await runCoding(request, config, () =>
    Promise.resolve(
      JSON.stringify({ edits: [{ path: "sum.mjs", content: source }] }),
    ),
  );
  roots.push(result.directory);
  expect(result.status).toBe("blocked");
  expect(result.attempts.at(-1)?.status).toBe("no_changes");
});

test("required exports reject syntax-valid erasure and guide a bounded repair", async () => {
  const request = await fixture();
  request.files = [{ path: "sum.mjs", writable: true }];
  let calls = 0;
  const result = await runCoding(
    {
      ...request,
      files: [{ path: "sum.mjs", writable: true, requiredExports: ["sum"] }],
    },
    config,
    (task) => {
      calls++;
      expect(task.prompt).toContain('"requiredExports":["sum"]');
      if (calls === 2) {
        expect(task.prompt).toContain('"check":"exports"');
        expect(task.prompt).toContain('"missing":["sum"]');
      }
      return Promise.resolve(
        JSON.stringify({
          edits: [
            {
              path: "sum.mjs",
              content:
                calls === 1
                  ? "// Unable to provide a replacement."
                  : "export function sum(a,b) { return a+b; }",
            },
          ],
        }),
      );
    },
  );
  roots.push(result.directory);
  expect(calls).toBe(2);
  expect(result.status).toBe("ready_for_review");
  expect(result.attempts[0]?.checks).toContainEqual({
    path: "sum.mjs",
    check: "exports",
    passed: false,
    missing: ["sum"],
  });
});

test("rejects required-export contracts on unsupported CommonJS and read-only files before inference", async () => {
  const { codingSchema } = await import("../src/coding-worker.js");
  const request = await fixture();
  for (const path of ["x.cjs", "x.cts", "x.json"]) {
    expect(() =>
      codingSchema.parse({
        ...request,
        files: [{ path, writable: true, requiredExports: ["sum"] }],
      }),
    ).toThrow();
  }
  expect(() =>
    codingSchema.parse({
      ...request,
      files: [
        ...request.files,
        { path: "context.ts", writable: false, requiredExports: ["sum"] },
      ],
    }),
  ).toThrow();
});

test("legacy coding receives explicit project context without changing route authority", async () => {
  const request = await fixture();
  const result = await runCoding(
    {
      ...request,
      context: {
        requirements: ["exactOptionalPropertyTypes is enabled"],
        facts: ["Node 24"],
      },
    },
    config,
    (task, selection) => {
      expect(task.prompt).toContain("exactOptionalPropertyTypes");
      expect(task.prompt).toContain("not instructions");
      expect(selection.candidate.billing).toBe("subscription");
      return Promise.resolve(
        JSON.stringify({
          edits: [
            {
              path: "sum.mjs",
              content: "export function sum(a,b) { return a+b; }",
            },
          ],
        }),
      );
    },
  );
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
});

test("foreground workers use the same hash-bound targeted edit protocol", async () => {
  const { createHash } = await import("node:crypto");
  const request = await fixture();
  const original = await readFile(join(request.sourceRoot, "sum.mjs"), "utf8");
  const baseSha256 = createHash("sha256").update(original).digest("hex");
  const result = await runCoding(request, config, (task) => {
    expect(task.prompt).toContain(`"sha256":"${baseSha256}"`);
    return Promise.resolve(
      JSON.stringify({
        edits: [
          {
            path: "sum.mjs",
            baseSha256,
            replacements: [
              { oldText: "return a + b;", newText: "return a + b; }" },
            ],
          },
        ],
      }),
    );
  });
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(
    await readFile(join(result.directory, "workspace/sum.mjs"), "utf8"),
  ).toBe(original.replace("return a + b;", "return a + b; }"));
  expect(await readFile(join(request.sourceRoot, "sum.mjs"), "utf8")).toBe(
    original,
  );
});
