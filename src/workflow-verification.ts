import { assertGoalWork } from "./goal-work.js";
import {
  recoverSupervisorDecision,
  supervisorReceiptSchema,
} from "./supervisor-receipt.js";
import {
  assessVerification,
  canonicalDigest,
  verificationManifestSchema,
  verificationReportSchema,
} from "./verification-assessment.js";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { lstat, mkdir, open, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { verificationCli } from "./verification-cli.js";
import {
  verificationTiming,
  verificationTimingSchema,
} from "./verification-timing.js";

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z.strictObject({
  path: z.string().refine(isAbsolute, "Artifact path must be absolute"),
  sha256: sha,
});
const name = z
  .string()
  .max(240)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/);
const specSchema = z
  .strictObject({
    version: z.literal(1),
    emulator: artifact,
    kernel: artifact,
    baseImage: artifact,
    tests: z
      .record(name, artifact)
      .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 500),
    entrypoint: name,
    wallSeconds: z.number().int().min(1).max(300),
    outputBytes: z.number().int().min(1024).max(1048576),
  })
  .refine(
    (v) => Object.hasOwn(v.tests, v.entrypoint),
    "Entrypoint must be a supplied test",
  );

/** Export evidence only; neither packaging nor this binding grants acceptance. */
export async function prepareVerification(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  input: unknown,
  directory: string,
  pack: (request: string, output: string) => Promise<number> = (
    request,
    output,
  ) => verificationCli(["package", request, output]),
): Promise<{
  codingId: string;
  revision: number;
  checkpointSha256: string;
  specificationSha256: string;
  packageRequestSha256: string;
  directory: string;
  acceptance: "not_assessed";
}> {
  if (coding.readOnly)
    throw new Error("Packaging needs a fresh coding journal");
  const spec = specSchema.parse(input);
  const current = () => {
    const state = workflows.read(id);
    const snapshot = coding.read(id);
    assertGoalWork(snapshot.request);
    if (state.phase !== "verification_required")
      throw new Error("Candidate must be independently reviewed first");
    const checkpointSha256 = digest(JSON.stringify(snapshot));
    if (
      snapshot.status !== "ready_for_review" ||
      checkpointSha256 !== state.reviewedCheckpointSha256
    )
      throw new Error("Reviewed candidate is stale");
    return { snapshot, checkpointSha256 };
  };
  const initial = current();
  const paths = Object.keys(initial.snapshot.files).sort();
  for (const path of paths) {
    name.parse(path);
    if (Object.hasOwn(spec.tests, path))
      throw new Error("Source/test collision");
  }
  const output = resolve(directory);
  workflows.beginVerification(id, coding, output, digest(JSON.stringify(spec)));
  await mkdir(output, { mode: 0o700 });
  const inputs = join(output, "inputs");
  await mkdir(inputs, { mode: 0o700 });
  const sources: Record<string, z.infer<typeof artifact>> = {};
  for (const [index, path] of paths.entries()) {
    const file = initial.snapshot.files[path];
    if (!file) throw new Error("Missing checkpoint source");
    const target = join(inputs, String(index));
    await writeFile(target, file.current, { flag: "wx", mode: 0o400 });
    sources[path] = { path: target, sha256: digest(file.current) };
  }
  const request = JSON.stringify({ ...spec, sources });
  const requestPath = join(output, "package.json");
  await writeFile(requestPath, request, { flag: "wx", mode: 0o400 });
  if ((await pack(requestPath, join(output, "image"))) !== 0)
    throw new Error("Verification packaging failed");
  if (current().checkpointSha256 !== initial.checkpointSha256)
    throw new Error("Reviewed candidate is stale");
  const binding = {
    codingId: id,
    revision: initial.snapshot.revision,
    checkpointSha256: initial.checkpointSha256,
    specificationSha256: digest(JSON.stringify(spec)),
    packageRequestSha256: digest(request),
    directory: output,
    acceptance: "not_assessed" as const,
  };
  await writeFile(join(output, "binding.json"), JSON.stringify(binding), {
    flag: "wx",
    mode: 0o400,
  });
  return binding;
}

export const executionSchema = z.strictObject({
  package: specSchema,
  acceptance: z.strictObject({
    kind: z.literal("test_process_exit"),
    expected: z.literal(0),
  }),
});

/** Evaluates an operator-declared exit-code rule, not overall goal completion. */
export async function verifyWorkflow(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  input: unknown,
  directory: string,
  drivers: {
    pack?: (request: string, output: string) => Promise<number>;
    run?: (manifest: string, output: string) => Promise<number>;
    monotonicClock?: () => number;
    commitFence?: <T>(commit: () => T) => T;
  } = {},
): Promise<{
  accepted: boolean;
  reason: string;
  checkpointSha256: string;
  specificationSha256: string;
  reportSha256: string;
  acceptance: z.infer<typeof executionSchema>["acceptance"];
  timing: z.infer<typeof verificationTimingSchema>;
}> {
  const spec = executionSchema.parse(input);
  const contract = workflows.read(id).verificationContractSha256;
  if (contract && contract !== canonicalDigest(spec))
    throw new Error("Verification contract changed");
  const snapshot = coding.read(id);
  const goal = assertGoalWork(snapshot.request);
  if (goal && goal.specificationSha256 !== canonicalDigest(spec))
    throw new Error("Goal verification contract changed");
  const expectedSource = canonicalDigest(
    Object.entries(snapshot.files)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, file]) => ({ path, sha256: digest(file.current) })),
  );
  const expectedTest = canonicalDigest({
    entrypoint: spec.package.entrypoint,
    files: Object.entries(spec.package.tests)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, file]) => ({ path, sha256: file.sha256 })),
  });
  const clock = () => {
    try {
      return (drivers.monotonicClock ?? (() => performance.now()))();
    } catch {
      return null;
    }
  };
  const started = clock();
  const binding = await prepareVerification(
    workflows,
    coding,
    id,
    spec.package,
    directory,
    drivers.pack,
  );
  const packaged = clock();
  await writeFile(
    join(binding.directory, "execution.json"),
    JSON.stringify(spec),
    { flag: "wx", mode: 0o400 },
  );
  const manifestPath = join(binding.directory, "image/manifest.json");
  const manifest = verificationManifestSchema.parse(
    await readSpecification(manifestPath),
  );
  if (
    canonicalDigest(manifest.emulator) !==
      canonicalDigest(spec.package.emulator) ||
    canonicalDigest(manifest.kernel) !== canonicalDigest(spec.package.kernel) ||
    manifest.wallSeconds !== spec.package.wallSeconds ||
    manifest.outputBytes !== spec.package.outputBytes
  )
    throw new Error("Verification runtime binding mismatch");
  if (
    manifest.candidateSha256 !== expectedSource ||
    manifest.testSha256 !== expectedTest
  )
    throw new Error("Verification package binding mismatch");
  const run =
    drivers.run ??
    ((path: string, output: string) => verificationCli(["run", path, output]));
  assertGoalWork(coding.read(id).request);
  const runStarted = clock();
  const exit = await run(manifestPath, join(binding.directory, "run"));
  const runFinished = clock();
  assertGoalWork(coding.read(id).request);
  const report = verificationReportSchema.parse(
    await readSpecification(join(binding.directory, "run/report.json")),
  );
  const assessment = assessVerification(
    manifest,
    report,
    expectedSource,
    expectedTest,
  );
  const state = workflows.read(id);
  if (
    state.phase !== "verification_required" ||
    state.reviewedCheckpointSha256 !== binding.checkpointSha256 ||
    digest(JSON.stringify(coding.read(id))) !== binding.checkpointSha256
  )
    throw new Error("Verified checkpoint is stale");
  const result = {
    timing: verificationTiming(
      [started, packaged, runStarted, runFinished, clock()],
      report.elapsedSeconds,
    ),
    ...assessment,
    accepted: assessment.accepted && exit === 0,
    reason:
      exit !== 0 && assessment.accepted
        ? "supervisor_failed"
        : assessment.reason,
    supervisorExitCode: exit,
    checkpointSha256: binding.checkpointSha256,
    specificationSha256: canonicalDigest(spec),
    reportSha256: canonicalDigest(report),
    acceptance: spec.acceptance,
  };
  await writeVerificationJson(
    binding.directory,
    "supervisor",
    supervisorReceiptSchema.parse({
      version: 1,
      checkpointSha256: result.checkpointSha256,
      specificationSha256: result.specificationSha256,
      reportSha256: result.reportSha256,
      supervisorExitCode: exit,
    }),
  );
  await writeVerificationJson(binding.directory, "assessment", result);
  workflows.recordVerification(
    id,
    coding,
    {
      packageSha256: binding.specificationSha256,
      timing: result.timing,
      checkpointSha256: result.checkpointSha256,
      specificationSha256: result.specificationSha256,
      reportSha256: result.reportSha256,
      accepted: result.accepted,
      outcome:
        exit !== 0 && report.outcome === "executed"
          ? "invalid_evidence"
          : report.outcome,
      directory: binding.directory,
      feedback:
        report.outcome === "test_process_failed"
          ? (
              await readVerificationText(
                join(binding.directory, "run/output.log"),
                true,
              )
            ).slice(0, 8000)
          : "",
    },
    drivers.commitFence,
  );
  return result;
}

const bindingSchema = z.strictObject({
  codingId: z.string(),
  revision: z.number().int().positive(),
  checkpointSha256: sha,
  specificationSha256: sha,
  packageRequestSha256: sha,
  directory: z.string(),
  acceptance: z.literal("not_assessed"),
});
const savedAssessmentSchema = z.strictObject({
  timing: verificationTimingSchema.optional(),
  accepted: z.boolean(),
  reason: z.string(),
  supervisorExitCode: z.number().int(),
  checkpointSha256: sha,
  specificationSha256: sha,
  reportSha256: sha,
  acceptance: executionSchema.shape.acceptance,
});

/** Recover only from complete, revalidated evidence; never replays the VM. */
export async function inspectVerification(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  directory: string,
  expectedExecution?: unknown,
) {
  const root = resolve(directory);
  const spec = executionSchema.parse(
    await readSpecification(join(root, "execution.json")),
  );
  if (
    expectedExecution !== undefined &&
    canonicalDigest(spec) !==
      canonicalDigest(executionSchema.parse(expectedExecution))
  )
    throw new Error(
      "Saved verification differs from expected execution contract",
    );
  const contract = workflows.read(id).verificationContractSha256;
  if (contract && contract !== canonicalDigest(spec))
    throw new Error("Verification contract changed");
  const binding = bindingSchema.parse(
    await readSpecification(join(root, "binding.json")),
  );
  const manifest = verificationManifestSchema.parse(
    await readSpecification(join(root, "image/manifest.json")),
  );
  const report = verificationReportSchema.parse(
    await readSpecification(join(root, "run/report.json")),
  );
  const expectedTest = canonicalDigest({
    entrypoint: spec.package.entrypoint,
    files: Object.entries(spec.package.tests)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, file]) => ({ path, sha256: file.sha256 })),
  });
  const expectedReceipt = {
    checkpointSha256: binding.checkpointSha256,
    specificationSha256: canonicalDigest(spec),
    reportSha256: canonicalDigest(report),
  };
  const receipt = await optionalSpecification(join(root, "supervisor.json"));
  const saved = await optionalSpecification(join(root, "assessment.json"));
  const recovered =
    receipt === undefined
      ? undefined
      : recoverSupervisorDecision(
          receipt,
          expectedReceipt,
          assessVerification(
            manifest,
            report,
            manifest.candidateSha256,
            expectedTest,
          ),
        );
  const assessment = savedAssessmentSchema.parse(
    saved === undefined
      ? recovered
        ? {
            ...recovered,
            ...expectedReceipt,
            acceptance: spec.acceptance,
          }
        : undefined
      : saved,
  );
  if (
    recovered &&
    (assessment.supervisorExitCode !== recovered.supervisorExitCode ||
      assessment.accepted !== recovered.accepted ||
      assessment.reason !== recovered.reason)
  )
    throw new Error("Supervisor receipt and assessment mismatch");
  if (
    binding.codingId !== id ||
    binding.directory !== root ||
    binding.checkpointSha256 !== assessment.checkpointSha256 ||
    binding.specificationSha256 !== digest(JSON.stringify(spec.package)) ||
    binding.packageRequestSha256 !==
      digest(await readVerificationText(join(root, "package.json"))) ||
    assessment.specificationSha256 !== canonicalDigest(spec) ||
    assessment.reportSha256 !== canonicalDigest(report) ||
    canonicalDigest(assessment.acceptance) !==
      canonicalDigest(spec.acceptance) ||
    canonicalDigest(manifest.emulator) !==
      canonicalDigest(spec.package.emulator) ||
    canonicalDigest(manifest.kernel) !== canonicalDigest(spec.package.kernel) ||
    manifest.wallSeconds !== spec.package.wallSeconds ||
    manifest.outputBytes !== spec.package.outputBytes
  )
    throw new Error("Saved verification binding mismatch");
  const decision = assessVerification(
    manifest,
    report,
    manifest.candidateSha256,
    expectedTest,
  );
  const accepted = decision.accepted && assessment.supervisorExitCode === 0;
  const reason =
    decision.accepted && assessment.supervisorExitCode !== 0
      ? "supervisor_failed"
      : decision.reason;
  if (assessment.accepted !== accepted || assessment.reason !== reason)
    throw new Error("Saved assessment decision mismatch");
  if (
    assessment.timing &&
    assessment.timing.vmMs !==
      verificationTiming([], report.elapsedSeconds).vmMs
  )
    throw new Error("Saved VM timing mismatch");
  const reserved = workflows
    .read(id)
    .verificationAttempts?.find((a) => a.directory === root);
  if (
    reserved?.packageSha256 &&
    reserved.packageSha256 !== binding.specificationSha256
  )
    throw new Error("Verification reservation package mismatch");
  const proof = {
    ...(reserved?.packageSha256
      ? { packageSha256: binding.specificationSha256 }
      : {}),
    ...(assessment.timing ? { timing: assessment.timing } : {}),
    checkpointSha256: assessment.checkpointSha256,
    specificationSha256: assessment.specificationSha256,
    reportSha256: assessment.reportSha256,
    accepted,
    outcome:
      assessment.supervisorExitCode !== 0 && report.outcome === "executed"
        ? ("invalid_evidence" as const)
        : report.outcome,
    directory: root,
    feedback:
      report.outcome === "test_process_failed"
        ? (
            await readVerificationText(join(root, "run/output.log"), true)
          ).slice(0, 8000)
        : "",
  };
  const currentGoal = assertGoalWork(
    coding.read(id).request,
    undefined,
    "coder",
    Date.now(),
    undefined,
    { codingId: id, checkpointSha256: proof.checkpointSha256 },
  );
  if (
    currentGoal &&
    currentGoal.specificationSha256 !== proof.specificationSha256
  )
    throw new Error("Goal verification contract changed");
  const recorded = workflows.read(id).verification;
  if (!recorded || canonicalDigest(recorded) !== canonicalDigest(proof)) {
    const snapshot = coding.read(id);
    assertGoalWork(snapshot.request);
    if (
      snapshot.revision !== binding.revision ||
      digest(JSON.stringify(snapshot)) !== binding.checkpointSha256
    )
      throw new Error("Verification checkpoint is stale");
    const source = canonicalDigest(
      Object.entries(snapshot.files)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, file]) => ({ path, sha256: digest(file.current) })),
    );
    if (source !== manifest.candidateSha256)
      throw new Error("Saved source binding mismatch");
  }
  if (
    workflows.read(id).phase === "verified" &&
    digest(JSON.stringify(coding.read(id))) !== binding.checkpointSha256
  )
    throw new Error("Verified checkpoint is stale");
  return proof;
}

export async function reconcileVerification(
  workflows: CodingWorkflows,
  coding: CodingJournal,
  id: string,
  directory: string,
  expectedExecution?: unknown,
  commitFence?: <T>(commit: () => T) => T,
) {
  const proof = await inspectVerification(
    workflows,
    coding,
    id,
    directory,
    expectedExecution,
  );
  return workflows.recordVerification(id, coding, proof, commitFence);
}

export async function workflowReconcileCli(
  args: string[],
  root = process.cwd(),
) {
  const [id, directory, ...extra] = args;
  if (!id || !directory || extra.length)
    throw new Error(
      "Usage: workflow reconcile-verification <coding-id> <directory>",
    );
  const codingPath = join(root, ".harness/coding.sqlite"),
    workflowPath = join(root, ".harness/workflows.sqlite");
  if (!existsSync(codingPath) || !existsSync(workflowPath))
    throw new Error("Missing project journal");
  const coding = new CodingJournal(codingPath);
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(workflowPath);
    return await reconcileVerification(workflows, coding, id, directory);
  } finally {
    workflows?.close();
    coding.close();
  }
}

async function optionalSpecification(path: string): Promise<unknown> {
  try {
    return await readSpecification(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}
async function writeVerificationJson(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  const temporary = join(directory, `${name}.tmp`);
  const file = await open(temporary, "wx", 0o400);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, join(directory, `${name}.json`));
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

export async function readSpecification(path: string): Promise<unknown> {
  return JSON.parse(await readVerificationText(path)) as unknown;
}
async function readVerificationText(
  path: string,
  prefix = false,
): Promise<string> {
  if (!(await lstat(path)).isFile())
    throw new Error("Specification must be a regular file");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Specification must be a regular file");
    if (!prefix && stat.size > 65536)
      throw new Error("Specification exceeds 64 KiB");
    const buffer = Buffer.alloc(prefix ? 16000 : 65537);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (!prefix && offset > 65536)
      throw new Error("Specification exceeds 64 KiB");
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    await file.close();
  }
}

export async function workflowPackageCli(
  args: string[],
  root = process.cwd(),
  mode: "package" | "verify" = "package",
): Promise<unknown> {
  const [id, specification, directory, ...extra] = args;
  if (!id || !specification || !directory || extra.length)
    throw new Error(
      "Usage: workflow package|verify <coding-id> <specification.json> <new-directory>",
    );
  const codingPath = join(root, ".harness", "coding.sqlite");
  const workflowPath = join(root, ".harness", "workflows.sqlite");
  if (!existsSync(codingPath) || !existsSync(workflowPath))
    throw new Error("Missing project journal");
  const input = await readSpecification(specification);
  const coding = new CodingJournal(codingPath);
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(workflowPath);
    return mode === "verify"
      ? await verifyWorkflow(workflows, coding, id, input, directory)
      : await prepareVerification(workflows, coding, id, input, directory);
  } finally {
    workflows?.close();
    coding.close();
  }
}
