import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { canonicalDigest } from "./verification-assessment.js";
import { dirname, isAbsolute, join } from "node:path";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows, type WorkflowState } from "./coding-workflow.js";
import {
  executionSchema,
  reconcileVerification,
  verifyWorkflow,
} from "./workflow-verification.js";
import { verificationCli } from "./verification-cli.js";

export async function stepWorkflowVerification(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  input: unknown,
  root: string,
  signal: AbortSignal,
  drivers?: {
    beforeEffect?: () => Promise<void>;
    commitFence?: <T>(commit: () => T) => T;
    pack?: (request: string, output: string) => Promise<number>;
    run?: (request: string, output: string) => Promise<number>;
  },
): Promise<WorkflowState> {
  const interrupted = (): never => {
    throw new Error("interrupted");
  };
  const check = (): void => {
    if (signal.aborted) interrupted();
  };

  check();
  await drivers?.beforeEffect?.();
  check();
  if (!isAbsolute(root)) throw new Error("Verification root must be absolute");
  if (coding.read(id).request.sourceRoot !== root)
    throw new Error("Workflow belongs to another project");
  const spec = executionSchema.parse(input);
  check();

  workflows.bindVerificationContract(id, canonicalDigest(spec));
  check();
  const state = workflows.read(id);
  if (
    (state.phase !== "verification_required" && state.phase !== "verified") ||
    state.reviewedCheckpointSha256 === null
  )
    throw new Error("Verification requires a reviewed checkpoint");

  const checkpoint = state.reviewedCheckpointSha256;
  const directory = join(
    root,
    ".harness/workflow-verification",
    canonicalDigest(id),
    checkpoint,
  );
  const reserved =
    state.verificationAttempts?.some(
      (attempt) => attempt.directory === directory,
    ) ?? false;

  check();
  if (existsSync(directory) || reserved) {
    check();
    return reconcileVerification(
      workflows,
      coding,
      id,
      directory,
      spec,
      drivers?.commitFence,
    );
  }
  if (state.phase === "verified")
    throw new Error("Verified workflow is missing verification artifacts");

  const pack = async (request: string, output: string): Promise<number> => {
    check();
    await drivers?.beforeEffect?.();
    check();
    const result = drivers?.pack
      ? await drivers.pack(request, output)
      : await verificationCli(["package", request, output], signal);
    check();
    await drivers?.beforeEffect?.();
    check();
    return result;
  };
  const run = async (request: string, output: string): Promise<number> => {
    check();
    await drivers?.beforeEffect?.();
    check();
    const result = drivers?.run
      ? await drivers.run(request, output)
      : await verificationCli(["run", request, output], signal);
    check();
    await drivers?.beforeEffect?.();
    check();
    return result;
  };

  check();
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  check();
  await verifyWorkflow(workflows, coding, id, spec, directory, {
    pack,
    run,
    ...(drivers?.commitFence ? { commitFence: drivers.commitFence } : {}),
  });
  check();
  return workflows.read(id);
}
