import { canonicalDigest } from "./verification-assessment.js";
import {
  capturePromotionLease,
  type PromotionLease,
} from "./promotion-lease.js";
import { goalPromotionReference } from "./goal-work.js";
import { execFileSync } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { reconcileVerification } from "./workflow-verification.js";

export async function promoteWorkflow(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  directory: string,
  options: {
    workflowSha256?: string;
    settingsSha256?: string;
    lease?: PromotionLease;
    beforeEffect?: () => Promise<void>;
  } = {},
): Promise<unknown> {
  const lease =
    options.lease === undefined
      ? undefined
      : capturePromotionLease(options.lease, Date.now());
  const state = workflows.read(id);
  if (state.phase !== "verified" || !state.verification?.accepted)
    throw new Error("Promotion requires a verified candidate");
  await reconcileVerification(
    workflows,
    coding,
    id,
    state.verification.directory,
  );
  const snapshot = coding.read(id);
  const expected = state.verification.checkpointSha256;
  const reference = coding.withCheckpoint(id, expected, () => ({
    path: resolve(coding.path),
    id,
    bodySha256: coding.storageDigest(id),
  }));
  const goal = goalPromotionReference(snapshot.request, {
    codingId: id,
    checkpointSha256: expected,
  });
  if (lease !== undefined && goal === undefined)
    throw new Error("Scheduler lease requires goal-bound promotion");
  const workflowReference =
    options.workflowSha256 === undefined
      ? undefined
      : workflows.withWriteFence(() => {
          if (canonicalDigest(workflows.read(id)) !== options.workflowSha256)
            throw new Error("Inspected workflow changed");
          return {
            path: resolve(workflows.path),
            id,
            bodySha256: workflows.storageDigest(id),
          };
        });
  const request = JSON.stringify({
    ...(goal ? { goal } : {}),
    ...(options.settingsSha256 === undefined
      ? {}
      : { settingsSha256: options.settingsSha256 }),
    ...(workflowReference ? { workflow: workflowReference } : {}),
    coding: reference,
    version: 1,
    root: snapshot.request.sourceRoot,
    checkpointSha256: expected,
    files: snapshot.request.files.map((file) => {
      const content = snapshot.files[file.path];
      if (!content) throw new Error("Missing candidate file");
      return {
        path: file.path,
        original: content.original,
        current: content.current,
        writable: file.writable,
      };
    }),
  });
  const bytes = Buffer.from(request);
  if (bytes.length > 2 * 1024 * 1024)
    throw new Error("Promotion request exceeds limit");
  const output = resolve(directory);
  if (!existsSync(output)) await mkdir(output, { mode: 0o700 });
  if (!(await lstat(output)).isDirectory())
    throw new Error("Promotion output must be a directory");
  const path = join(output, "request.json");
  if (existsSync(path)) {
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size !== bytes.length)
        throw new Error("Promotion request changed");
      const saved = Buffer.alloc(bytes.length + 1);
      let offset = 0;
      while (offset < saved.length) {
        const { bytesRead } = await file.read(
          saved,
          offset,
          saved.length - offset,
          offset,
        );
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (!saved.subarray(0, offset).equals(bytes))
        throw new Error("Promotion request changed");
    } finally {
      await file.close();
    }
  } else {
    const file = await open(path, "wx", 0o400);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  const parent = await open(output, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  const ancestor = await open(resolve(output, ".."), "r");
  try {
    await ancestor.sync();
  } finally {
    await ancestor.close();
  }
  await options.beforeEffect?.();
  if (lease !== undefined) capturePromotionLease(lease, Date.now());
  const stdout = execFileSync(
    "python3",
    [
      fileURLToPath(new URL("../scripts/promote_sources.py", import.meta.url)),
      path,
      join(output, "transaction"),
      ...(lease === undefined ? [] : [JSON.stringify(lease)]),
    ],
    {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 65536,
      env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(stdout) as unknown;
}

export async function workflowPromotionCli(
  args: string[],
  root = process.cwd(),
): Promise<unknown> {
  const [id, directory, ...extra] = args;
  if (!id || !directory || extra.length)
    throw new Error(
      "Usage: workflow promote <coding-id> <promotion-directory>",
    );
  const codingPath = join(root, ".harness/coding.sqlite"),
    workflowPath = join(root, ".harness/workflows.sqlite");
  if (!existsSync(codingPath) || !existsSync(workflowPath))
    throw new Error("Missing project journal");
  const coding = new CodingJournal(codingPath);
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(workflowPath);
    return await promoteWorkflow(workflows, coding, id, directory);
  } finally {
    workflows?.close();
    coding.close();
  }
}
