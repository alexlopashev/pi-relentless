import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { configSchema, route } from "../src/router.js";
import { assertPiDispatch } from "../src/pi-dispatch-policy.js";
test("local dispatch cannot use a removed or changed managed runtime permission", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-policy-"));
  try {
    await mkdir(join(root, ".pi"));
    const config = configSchema.parse({
      maxConcurrency: 1,
      candidates: [
        {
          name: "local",
          provider: "clanker-local",
          model: "qwen3.5-4b",
          billing: "local",
          enabled: true,
          quality: 1,
          preference: 1,
          efforts: ["off"],
        },
      ],
      managedLocal: {
        executable: { path: "/runtime/server", sha256: "a".repeat(64) },
        model: { path: "/model.gguf", sha256: "b".repeat(64) },
        libraries: {},
        startupMs: 1000,
      },
    });
    const selection = route(
      { id: "t", prompt: "t", minQuality: 1, effort: "off" },
      config.candidates,
      false,
    );
    const context = {
      cwd: root,
      isProjectTrusted: () => true,
      models: () => ({
        available: [
          { provider: "clanker-local", model: "qwen3.5-4b", efforts: ["off"] },
        ],
        scoped: [],
      }),
    };
    const save = async (routing: unknown) =>
      writeFile(
        join(root, ".pi/settings.json"),
        JSON.stringify({
          clanker: { version: 1, routing, roles: { coder: ["local"] } },
        }),
      );
    await save(config);
    await expect(
      assertPiDispatch(context, "coder", selection, config),
    ).resolves.toBeUndefined();
    const removed = { ...config };
    delete removed.managedLocal;
    await save(removed);
    await expect(
      assertPiDispatch(context, "coder", selection, config),
    ).rejects.toMatchObject({ kind: "permission" });
    await save(config);
    await expect(
      assertPiDispatch(context, "coder", selection, removed),
    ).rejects.toMatchObject({ kind: "permission" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
