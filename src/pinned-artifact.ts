import { createHash } from "node:crypto";
import { open, type FileHandle } from "node:fs/promises";
import { O_NOFOLLOW, O_NONBLOCK, O_RDONLY } from "node:constants";
import { isAbsolute } from "node:path";

export async function verifyPinnedArtifact(
  artifact: { path: string; sha256: string },
  maxBytes: number,
  signal?: AbortSignal,
): Promise<number> {
  if (!isAbsolute(artifact.path)) throw new Error("Path must be absolute");
  if (!/^[0-9a-f]{64}$/.test(artifact.sha256))
    throw new Error("Invalid SHA-256 digest");
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > 2 * 1024 ** 3
  ) {
    throw new Error("Invalid maximum size");
  }
  const checkAborted = (): void => {
    if (signal?.aborted) throw new Error("Aborted");
  };

  checkAborted();
  let handle: FileHandle | undefined;
  try {
    handle = await open(artifact.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    checkAborted();
    const initial = await handle.stat();
    if (!initial.isFile()) throw new Error("Not a regular file");
    if (initial.size > maxBytes) throw new Error("File is too large");

    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesRead = 0;
    while (bytesRead <= maxBytes) {
      checkAborted();
      const requested = Math.min(buffer.length, maxBytes + 1 - bytesRead);
      const result = await handle.read(buffer, 0, requested, bytesRead);
      checkAborted();
      if (result.bytesRead === 0) break;
      hash.update(buffer.subarray(0, result.bytesRead));
      bytesRead += result.bytesRead;
      if (bytesRead > maxBytes) throw new Error("File is too large");
    }

    const final = await handle.stat();
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs ||
      final.ctimeMs !== initial.ctimeMs ||
      bytesRead !== initial.size
    )
      throw new Error("File changed during verification");
    if (hash.digest("hex") !== artifact.sha256)
      throw new Error("Hash mismatch");
    checkAborted();
    return bytesRead;
  } finally {
    if (handle) await handle.close();
  }
}
