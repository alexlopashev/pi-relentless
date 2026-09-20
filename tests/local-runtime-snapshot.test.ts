import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { snapshotLocalRuntime } from "../src/local-runtime-snapshot.js";
test("later executable, model or library replacement cannot change verified snapshot bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-snapshot-test-"));
  let directory: string | undefined;
  try {
    const artifact = async (name: string) => {
      const path = join(root, name);
      await writeFile(path, name);
      return { path, sha256: createHash("sha256").update(name).digest("hex") };
    };
    const executable = await artifact("server"),
      model = await artifact("model"),
      library = await artifact("libtest.dylib");
    const result = await snapshotLocalRuntime({
      executable,
      model,
      libraries: { "libtest.dylib": library },
      startupMs: 1000,
    });
    directory = result.directory;
    for (const file of [executable, model, library])
      await writeFile(file.path, "replacement");
    expect(await readFile(result.config.executable.path, "utf8")).toBe(
      "server",
    );
    expect(await readFile(result.config.model.path, "utf8")).toBe("model");
    expect(await readFile(join(directory, "libtest.dylib"), "utf8")).toBe(
      "libtest.dylib",
    );
    await expect(
      snapshotLocalRuntime({
        executable,
        model,
        libraries: {},
        startupMs: 1000,
      }),
    ).rejects.toThrow();
    await rm(executable.path);
    await symlink(model.path, executable.path);
    await expect(
      snapshotLocalRuntime({
        executable,
        model,
        libraries: {},
        startupMs: 1000,
      }),
    ).rejects.toThrow();
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
