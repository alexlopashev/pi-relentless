import { constants } from "node:fs";
import { open, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  managedLocalSchema,
  type ManagedLocalConfig,
} from "./managed-local-config.js";
async function copyPinned(
  artifact: { path: string; sha256: string },
  target: string,
  limit: number,
  executable: boolean,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  const source = await open(
    artifact.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await source.stat();
    if (!info.isFile() || info.size <= 0 || info.size > limit)
      throw new Error("Invalid local artifact");
    const destination = await open(target, "wx", 0o600);
    try {
      const digest = createHash("sha256"),
        buffer = Buffer.alloc(1024 * 1024);
      let offset = 0;
      while (offset < info.size) {
        signal?.throwIfAborted();
        const { bytesRead } = await source.read(
          buffer,
          0,
          Math.min(buffer.length, info.size - offset),
          offset,
        );
        if (!bytesRead) throw new Error("Incomplete artifact");
        digest.update(buffer.subarray(0, bytesRead));
        let written = 0;
        while (written < bytesRead) {
          const result = await destination.write(
            buffer,
            written,
            bytesRead - written,
            offset + written,
          );
          if (!result.bytesWritten) throw new Error("Incomplete snapshot");
          written += result.bytesWritten;
        }
        offset += bytesRead;
      }
      if (digest.digest("hex") !== artifact.sha256)
        throw new Error("Artifact hash mismatch");
      await destination.sync();
      await destination.chmod(executable ? 0o500 : 0o400);
      return info.size;
    } finally {
      await destination.close();
    }
  } finally {
    await source.close();
  }
}
/** Execute/load only these private copies; approved original paths are never reopened by the server. */
export async function snapshotLocalRuntime(
  input: ManagedLocalConfig,
  signal?: AbortSignal,
): Promise<{ directory: string; config: ManagedLocalConfig }> {
  const config = managedLocalSchema.parse(input);
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "clanker-local-owned-"));
  try {
    const executable = {
      ...config.executable,
      path: join(directory, "llama-server"),
    };
    const model = { ...config.model, path: join(directory, "model.gguf") };
    await copyPinned(
      config.executable,
      executable.path,
      64 * 1024 * 1024,
      true,
      signal,
    );
    let remaining = 512 * 1024 * 1024;
    const libraries: ManagedLocalConfig["libraries"] = {};
    for (const [name, artifact] of Object.entries(config.libraries)) {
      const path = join(directory, name);
      remaining -= await copyPinned(
        artifact,
        path,
        Math.min(remaining, 128 * 1024 * 1024),
        false,
        signal,
      );
      libraries[name] = { ...artifact, path };
    }
    await copyPinned(
      config.model,
      model.path,
      8 * 1024 * 1024 * 1024,
      false,
      signal,
    );
    signal?.throwIfAborted();
    return { directory, config: { ...config, executable, model, libraries } };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
