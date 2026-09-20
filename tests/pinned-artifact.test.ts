import { test, expect } from "vitest";
import { mkdtemp, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifyPinnedArtifact } from "../src/pinned-artifact.js";
test("checks bounded regular artifact bytes and rejects stale pins, links and cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "pinned-artifact-"));
  const path = join(root, "file");
  const content = "pinned bytes";
  await writeFile(path, content);
  const artifact = {
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
  expect(await verifyPinnedArtifact(artifact, 1024)).toBe(
    Buffer.byteLength(content),
  );
  await expect(
    verifyPinnedArtifact({ ...artifact, sha256: "0".repeat(64) }, 1024),
  ).rejects.toThrow();
  await expect(verifyPinnedArtifact(artifact, 1)).rejects.toThrow();
  await expect(
    verifyPinnedArtifact(artifact, 1024, AbortSignal.abort()),
  ).rejects.toThrow();
  await symlink(path, join(root, "link"));
  await expect(
    verifyPinnedArtifact({ ...artifact, path: join(root, "link") }, 1024),
  ).rejects.toThrow();
  await expect(
    verifyPinnedArtifact({ ...artifact, path: root }, 1024),
  ).rejects.toThrow();
});
