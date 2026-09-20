import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadPiProjectConfig,
  piProjectConfigSchema,
} from "../src/pi-project-config.js";
const config = {
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
};
test("project settings carry extension config without claiming measured strengths", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-config-"));
  await mkdir(join(root, ".pi"));
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({ theme: "dark", relentless: config }),
  );
  const parsed = await loadPiProjectConfig(root, true);
  expect(parsed?.roles.scheduler).toEqual(["local"]);
  expect(parsed?.routing.allowMetered).toBe(false);
  expect(parsed?.routing.observations).toBeUndefined();
});
test("trust, role references, version and existing billing constraints fail closed", async () => {
  await expect(loadPiProjectConfig("/does-not-exist", false)).rejects.toThrow(
    "trusted",
  );
  expect(
    piProjectConfigSchema.safeParse({ ...config, version: 2 }).success,
  ).toBe(false);
  expect(
    piProjectConfigSchema.safeParse({
      ...config,
      roles: { coder: ["missing"] },
    }).success,
  ).toBe(false);
  expect(
    piProjectConfigSchema.safeParse({
      ...config,
      routing: { ...config.routing, maxConcurrency: 2 },
    }).success,
  ).toBe(false);
});
test("missing config is distinct from malformed or redirected settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-config-"));
  expect(await loadPiProjectConfig(root, true)).toBeNull();
  await mkdir(join(root, ".pi"));
  const target = join(root, "other.json");
  await writeFile(target, JSON.stringify({ relentless: config }));
  await symlink(target, join(root, ".pi/settings.json"));
  await expect(loadPiProjectConfig(root, true)).rejects.toThrow();
});

test("Pi preserves the Relentless namespace when changing native project settings", async () => {
  const contents: Record<string, string> = {
    project: JSON.stringify({ relentless: config }),
  };
  const manager = SettingsManager.fromStorage(
    {
      withLock(scope, update) {
        const next = update(contents[scope]);
        if (next !== undefined) contents[scope] = next;
      },
    },
    { projectTrusted: true },
  );
  manager.setProjectPackages([]);
  await manager.flush();
  expect(JSON.parse(contents["project"] ?? "{}")).toEqual({
    relentless: config,
    packages: [],
  });
});
