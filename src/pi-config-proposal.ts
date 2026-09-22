import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  buildConfigProposal,
  proposalSchema,
  renderConfigTarget,
} from "./config-proposal.js";
interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
  ui?: { confirm?(title: string, message: string): Promise<boolean> };
}
function check(context: Context): void {
  if (context.signal?.aborted || !context.isProjectTrusted())
    throw new Error("Project inactive");
}
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function directory(path: string, create = false): boolean {
  try {
    if (!lstatSync(path).isDirectory()) throw new Error("Nonregular directory");
    return true;
  } catch (error) {
    if (!missing(error)) throw error;
    if (!create) return false;
    mkdirSync(path, { mode: 0o700 });
    return true;
  }
}
function read(
  path: string,
  limit: number,
  optional = false,
): string | undefined {
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (optional && missing(error)) return undefined;
    throw error;
  }
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit) throw new Error("Invalid file");
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length);
      if (!count) break;
      length += count;
    }
    if (length > limit) throw new Error("File exceeds limit");
    const content = bytes.subarray(0, length),
      text = content.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(content))
      throw new Error("Invalid UTF-8");
    return text;
  } finally {
    closeSync(fd);
  }
}
export function readPiSettingsSnapshot(root: string): string | undefined {
  if (!directory(join(root, CONFIG_DIR_NAME))) return undefined;
  return read(join(root, CONFIG_DIR_NAME, "settings.json"), 128 * 1024, true);
}
function hash(source: string | undefined): string | null {
  return source === undefined
    ? null
    : createHash("sha256").update(source).digest("hex");
}
function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function writeTemp(parent: string, content: string): string {
  const path = join(parent, `.relentless-${randomUUID()}.tmp`);
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } catch (error) {
    unlinkSync(path);
    throw error;
  } finally {
    closeSync(fd);
  }
  return path;
}
function releaseLock(lock: string, owner: { dev: number; ino: number }): void {
  try {
    const held = lstatSync(lock);
    if (held.dev === owner.dev && held.ino === owner.ino) rmdirSync(lock);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
function proposalDirectory(root: string, create: boolean): string {
  const parent = join(root, ".harness"),
    path = join(parent, "config-proposals");
  if (!directory(parent, create) || !directory(path, create))
    throw new Error("Missing proposals");
  return path;
}
/** Save a content-bound proposal; no settings mutation, inference or approval. */
export async function proposePiConfig(text: string, context: Context) {
  check(context);
  if (Buffer.byteLength(text) > 128 * 1024)
    throw new Error("Input exceeds limit");
  const root = await realpath(context.cwd);
  check(context);
  const proposal = buildConfigProposal(
    root,
    readPiSettingsSnapshot(root),
    JSON.parse(text) as unknown,
  );
  const parent = proposalDirectory(root, true),
    path = join(parent, `${proposal.id}.json`);
  const content = JSON.stringify(proposal, null, 2) + "\n";
  const temp = writeTemp(parent, content);
  try {
    check(context);
    try {
      linkSync(temp, path);
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
      if (read(path, 384 * 1024) !== content)
        throw new Error("Proposal identity conflict", { cause: error });
    }
    syncDirectory(parent);
  } finally {
    unlinkSync(temp);
  }
  return proposal;
}
export async function readPiConfigProposal(id: string, context: Context) {
  check(context);
  if (!/^[0-9a-f]{64}$/u.test(id)) throw new Error("Invalid proposal ID");
  const root = await realpath(context.cwd);
  check(context);
  const path = join(proposalDirectory(root, false), `${id}.json`);
  const raw = read(path, 384 * 1024);
  if (raw === undefined) throw new Error("Missing proposal");
  const proposal = proposalSchema.parse(JSON.parse(raw) as unknown);
  if (proposal.id !== id || proposal.root !== root)
    throw new Error("Proposal project mismatch");
  if (hash(readPiSettingsSnapshot(root)) !== proposal.sourceSha256)
    throw new Error("Proposal settings are stale");
  check(context);
  return proposal;
}
/** Pi confirmation is the approval boundary; callers cannot pass an approved flag. */
export async function applyPiConfigProposal(id: string, context: Context) {
  check(context);
  if (!/^[0-9a-f]{64}$/u.test(id)) throw new Error("Invalid proposal ID");
  const root = await realpath(context.cwd);
  check(context);
  const path = join(proposalDirectory(root, false), `${id}.json`);
  const raw = read(path, 384 * 1024);
  if (raw === undefined) throw new Error("Missing proposal");
  const proposal = proposalSchema.parse(JSON.parse(raw) as unknown);
  if (proposal.id !== id || proposal.root !== root)
    throw new Error("Proposal project mismatch");
  const current = readPiSettingsSnapshot(root);
  if (hash(current) === proposal.targetSha256)
    return { id, status: "already_matches" as const };
  if (hash(current) !== proposal.sourceSha256)
    throw new Error("Proposal settings are stale");
  if (!context.ui?.confirm)
    throw new Error("Interactive confirmation required");
  const approved = await context.ui.confirm(
    "Apply Relentless configuration?",
    JSON.stringify(
      {
        proposal: id,
        project: root,
        sourceSha256: proposal.sourceSha256,
        before: proposal.before,
        after: proposal.after,
      },
      null,
      2,
    ) +
      (proposal.after.resumeGoal
        ? "\nThis authorizes automatic execution of the named goal at the exact revision on future trusted Pi session starts, within its existing attempt, billing, verification and source-integration permissions and current project policy. Removing or changing these settings stops automatic execution. It does not authorize entitlement probes or migrate active workflows."
        : "\nThis changes only the Relentless namespace. Billing and enabled models above become policy. No inference, entitlement check or active-workflow migration is authorized by this confirmation.") +
      (proposal.after.routing.managedLocal
        ? "\nManaged local runtime: this permits launching the pinned executable and model for separately authorized local dispatches, using CPU resources and loopback port 18080. Each owned server is stopped after the call. It does not start now, download files, adopt an external server, or grant inference permissions."
        : ""),
  );
  check(context);
  if (!approved) return { id, status: "declined" as const };
  const parent = join(root, CONFIG_DIR_NAME);
  directory(parent, true);
  // Pi 0.85.1 FileSettingsStorage uses proper-lockfile with realpath:false:
  // a settings.json.lock directory. Hold that same cooperative lock only during
  // synchronous publication. Never reclaim an existing/stale owner's lock here.
  const lock = join(parent, "settings.json.lock");
  mkdirSync(lock, { mode: 0o700 });
  const owner = lstatSync(lock);
  const acquiredAt = Date.now(),
    acquiredMonotonic = performance.now();
  const checkLock = () => {
    const held = lstatSync(lock);
    if (
      !held.isDirectory() ||
      held.dev !== owner.dev ||
      held.ino !== owner.ino ||
      Date.now() - acquiredAt < 0 ||
      Date.now() - acquiredAt >= 5000 ||
      performance.now() - acquiredMonotonic >= 5000
    )
      throw new Error("Settings lock changed or expired");
  };
  let temp: string | undefined;
  try {
    check(context);
    const source = readPiSettingsSnapshot(root);
    if (hash(source) !== proposal.sourceSha256)
      throw new Error("Proposal settings changed during review");
    const target = renderConfigTarget(source, proposal.after);
    if (hash(target) !== proposal.targetSha256)
      throw new Error("Proposal target mismatch");
    temp = writeTemp(parent, target);
    check(context);
    if (hash(readPiSettingsSnapshot(root)) !== proposal.sourceSha256)
      throw new Error("Settings changed before publication");
    checkLock();
    renameSync(temp, join(parent, "settings.json"));
    temp = undefined;
    syncDirectory(parent);
    return { id, status: "applied" as const };
  } finally {
    if (temp !== undefined) unlinkSync(temp);
    releaseLock(lock, owner);
  }
}
