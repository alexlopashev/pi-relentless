import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { codingSchema, runCoding } from "../src/coding-worker.js";
import { CodingJournal } from "../src/coding-journal.js";
import { createCodingRun, resumeCoding } from "../src/durable-coding.js";
import { createPiWork } from "../src/pi-work-create.js";
import { configSchema } from "../src/router.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const config = configSchema.parse({
  candidates: [
    {
      name: "author",
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
  const sourceRoot = await mkdtemp(join(tmpdir(), "relentless-new-"));
  roots.push(sourceRoot);
  return {
    sourceRoot,
    task: {
      id: "new",
      prompt: "Create answer export",
      minQuality: 1,
      effort: "low",
    },
    files: [
      {
        path: "new.ts",
        writable: true,
        create: true,
        requiredExports: ["answer"],
      },
    ],
    maxAttempts: 2,
  };
}
const output = JSON.stringify({
  edits: [{ path: "new.ts", content: "export const answer = 42;" }],
});
test("private new-file coding preserves absence in changes without touching the project", async () => {
  const request = await fixture();
  const result = await runCoding(request, config, (task) => {
    expect(task.prompt).not.toContain("No commands, new files, or deletions.");
    expect(task.prompt).toContain("create:true");
    return Promise.resolve(output);
  });
  roots.push(result.directory);
  expect(result.status).toBe("ready_for_review");
  expect(existsSync(join(request.sourceRoot, "new.ts"))).toBe(false);
  expect(
    JSON.parse(await readFile(join(result.directory, "changes.json"), "utf8")),
  ).toEqual([
    expect.objectContaining({
      path: "new.ts",
      before: null,
      beforeSha256: null,
      after: "export const answer = 42;",
    }),
  ]);
});
test("durable absent baseline survives reopen and a checked worker attempt", async () => {
  const request = await fixture(),
    path = join(request.sourceRoot, "coding.sqlite");
  let journal = new CodingJournal(path);
  try {
    const id = await createCodingRun(request, config, journal);
    expect(journal.read(id).files["new.ts"]).toEqual({
      original: null,
      current: "",
    });
    journal.close();
    journal = new CodingJournal(path);
    const result = await resumeCoding(id, journal, (task) => {
      expect(task.prompt).not.toContain(
        "No commands, new files, or deletions.",
      );
      expect(task.prompt).toContain("create:true");
      return Promise.resolve(output);
    });
    if (result.directory) roots.push(result.directory);
    expect(journal.read(id)).toMatchObject({
      status: "ready_for_review",
      attempts: 1,
      files: {
        "new.ts": { original: null, current: "export const answer = 42;" },
      },
    });
    expect(existsSync(join(request.sourceRoot, "new.ts"))).toBe(false);
  } finally {
    journal.close();
  }
});
test("existing empty files cannot satisfy a declared absence", async () => {
  const request = await fixture();
  await writeFile(join(request.sourceRoot, "new.ts"), "");
  let calls = 0;
  await expect(
    runCoding(request, config, () => {
      calls++;
      return Promise.resolve(output);
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  const journal = new CodingJournal(join(request.sourceRoot, "coding.sqlite"));
  try {
    await expect(createCodingRun(request, config, journal)).rejects.toThrow();
  } finally {
    journal.close();
  }
  expect(await readFile(join(request.sourceRoot, "new.ts"), "utf8")).toBe("");
});
test("absence requires writable declaration and cannot be used for ordinary inputs", async () => {
  const request = await fixture();
  expect(
    codingSchema.safeParse({
      ...request,
      files: [{ path: "new.ts", writable: false, create: true }],
    }).success,
  ).toBe(false);
  const journal = new CodingJournal(join(request.sourceRoot, "coding.sqlite"));
  try {
    expect(() =>
      journal.create(
        { ...request, files: [{ path: "new.ts", writable: true }] },
        config,
        { "new.ts": null },
      ),
    ).toThrow();
    expect(() => journal.create(request, config, { "new.ts": "" })).toThrow();
  } finally {
    journal.close();
  }
});
test("new file paths reject missing parents and dangling symlinks without mutation", async () => {
  const request = await fixture();
  await symlink(
    join(request.sourceRoot, "missing"),
    join(request.sourceRoot, "new.ts"),
  );
  await expect(
    runCoding(request, config, (task) => {
      expect(task.prompt).not.toContain(
        "No commands, new files, or deletions.",
      );
      expect(task.prompt).toContain("create:true");
      return Promise.resolve(output);
    }),
  ).rejects.toThrow();
  await expect(
    runCoding(
      {
        ...request,
        files: [{ path: "missing/new.ts", writable: true, create: true }],
      },
      config,
      (task) => {
        expect(task.prompt).not.toContain(
          "No commands, new files, or deletions.",
        );
        expect(task.prompt).toContain("create:true");
        return Promise.resolve(output);
      },
    ),
  ).rejects.toThrow();
  expect(existsSync(join(request.sourceRoot, "missing"))).toBe(false);
});

test("Pi persists declared absence without creating the source file", async () => {
  const request = await fixture();
  const base = config.candidates[0];
  if (!base) throw new Error("Missing author fixture");
  const candidates = [
    ...config.candidates,
    ...["review-a", "review-b"].map((name) => ({
      ...base,
      name,
      provider: name,
      model: name,
    })),
  ];
  await mkdir(join(request.sourceRoot, ".pi"));
  await writeFile(
    join(request.sourceRoot, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: { candidates },
        roles: { coder: ["author"], reviewer: ["review-a", "review-b"] },
      },
    }),
  );
  const { sourceRoot, ...input } = request;
  const result = await createPiWork(
    JSON.stringify({
      ...input,
      reviewTask: { ...request.task, id: "review" },
      maxReviewPairs: 1,
    }),
    {
      cwd: sourceRoot,
      isProjectTrusted: () => true,
      models: () => ({ available: candidates, scoped: [] }),
    },
  );
  const journal = new CodingJournal(
    join(sourceRoot, ".harness/coding.sqlite"),
    { readOnly: true },
  );
  try {
    expect(journal.read(result.id).files["new.ts"]).toEqual({
      original: null,
      current: "",
    });
  } finally {
    journal.close();
  }
  expect(existsSync(join(sourceRoot, "new.ts"))).toBe(false);
});
