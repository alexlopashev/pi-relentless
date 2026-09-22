import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { loadPiProjectConfig } from "../src/pi-project-config.js";

test("the distributed package exposes the Relentless extension and skill", async () => {
  const manifest: unknown = JSON.parse(await readFile("package.json", "utf8"));
  expect(manifest).toMatchObject({
    name: "relentless",
    scripts: { relentless: "node dist/cli.js" },
  });
  expect(manifest).toHaveProperty(
    "pi.extensions.0",
    "./.pi/extensions/relentless.ts",
  );
  expect(
    await readFile("skills/relentless-configure/SKILL.md", "utf8"),
  ).toContain("name: relentless-configure");
});

test("Pi loads routing and roles from the Relentless project namespace", async () => {
  const root = await mkdtemp(join(tmpdir(), "relentless-branding-"));
  try {
    await mkdir(join(root, ".pi"));
    await writeFile(
      join(root, ".pi/settings.json"),
      JSON.stringify({
        relentless: {
          version: 1,
          routing: {
            candidates: [
              {
                name: "local",
                provider: "relentless-local",
                model: "qwen3.5-4b",
                billing: "local",
                enabled: true,
                quality: 1,
                preference: 1,
                efforts: ["off"],
              },
            ],
            maxConcurrency: 1,
          },
          roles: { scheduler: ["local"] },
        },
      }),
    );
    expect((await loadPiProjectConfig(root, true))?.roles.scheduler).toEqual([
      "local",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
