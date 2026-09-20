import {
  constants,
  openSync,
  closeSync,
  readSync,
  fstatSync,
  lstatSync,
} from "node:fs";
import { join, isAbsolute } from "node:path";
import { canonicalDigest } from "./verification-assessment.js";
import { buildInstallationReceipt } from "./source-installation-receipt.js";
/** Bounded synchronous reads allow final source observation inside admission fences. */
function readLocal(root: string, path: string, limit: number): string {
  const parts = path.split("/");
  if (
    isAbsolute(path) ||
    parts.some((p) => p === "" || p === "." || p === "..")
  )
    throw Error("Unsafe installation path");
  let parent = root;
  if (!lstatSync(parent).isDirectory()) throw Error("Invalid project root");
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    if (!lstatSync(parent).isDirectory())
      throw Error("Redirected installation path");
  }
  const fd = openSync(
    join(root, path),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit)
      throw Error("Invalid installation file");
    const bytes = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    const raw = bytes.subarray(0, size),
      text = raw.toString("utf8");
    if (size > limit || !Buffer.from(text).equals(raw))
      throw Error("Invalid installation content");
    return text;
  } finally {
    closeSync(fd);
  }
}
export function goalPromotionDirectory(
  root: string,
  id: string,
  checkpoint: string,
): string {
  if (!/^[a-f0-9]{64}$/u.test(checkpoint)) throw Error("Invalid checkpoint");
  return join(
    root,
    ".harness/goal-promotions",
    canonicalDigest(id),
    checkpoint,
  );
}
export function inspectGoalInstallation(
  root: string,
  evidence: {
    codingId: string;
    checkpointSha256: string;
    files: readonly { path: string; sha256: string }[];
  },
) {
  const relative = join(
    ".harness/goal-promotions",
    canonicalDigest(evidence.codingId),
    evidence.checkpointSha256,
  );
  const directory = goalPromotionDirectory(
    root,
    evidence.codingId,
    evidence.checkpointSha256,
  );
  const request: unknown = JSON.parse(
    readLocal(root, join(relative, "request.json"), 2 * 1024 * 1024),
  );
  const record: unknown = JSON.parse(
    readLocal(root, join(relative, "transaction/state.json"), 4 * 1024 * 1024),
  );
  const info = lstatSync(root),
    sources: Record<string, string> = {};
  for (const file of evidence.files)
    sources[file.path] = readLocal(root, file.path, 32768);
  return buildInstallationReceipt(
    directory,
    request,
    record,
    {
      root,
      rootIdentity: [info.dev, info.ino],
      codingId: evidence.codingId,
      checkpointSha256: evidence.checkpointSha256,
      files: evidence.files,
    },
    sources,
  );
}
