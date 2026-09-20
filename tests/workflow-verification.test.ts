import { promoteWorkflow } from "../src/workflow-promotion.js";
import { reconcileVerification } from "../src/workflow-verification.js";
import { createHash } from "node:crypto";
import { verificationManifestSchema } from "../src/verification-assessment.js";
import { canonicalDigest } from "../src/verification-assessment.js";
import { verifyWorkflow } from "../src/workflow-verification.js";
import { chmod, mkdir } from "node:fs/promises";
import { prepareVerification } from "../src/workflow-verification.js";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
const roots: string[] = [];
const handles: { close(): void }[] = [];
afterEach(() => {
  for (const h of handles) h.close();
  for (const p of roots) rmSync(p, { recursive: true, force: true });
  handles.length = 0;
  roots.length = 0;
});
const c = (provider: string) => ({
  name: provider,
  provider,
  model: provider,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
});
function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "relentless-workflow-")),
  );
  roots.push(root);
  const coding = new CodingJournal(join(root, "coding.sqlite"));
  handles.push(coding);
  const task = {
    id: "fix",
    prompt: "Export x equal to 2",
    minQuality: 1,
    effort: "low",
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true, requiredExports: ["x"] }],
      maxAttempts: 3,
    },
    { candidates: [c("author")] },
    { "x.ts": "export const x = ;" },
  );
  const path = join(root, "workflows.sqlite");
  const workflows = new CodingWorkflows(path);
  handles.push(workflows);
  workflows.create(
    id,
    coding,
    {
      task: { ...task, id: "review" },
      config: { candidates: [c("a"), c("b")] },
    },
    2,
  );
  return { root, coding, id, workflows, path };
}
import { z } from "zod";
const packageInput = z.object({
  sources: z.record(z.string(), z.object({ path: z.string() })),
});

const spec = {
  version: 1,
  emulator: { path: "/emulator", sha256: "a".repeat(64) },
  kernel: { path: "/kernel", sha256: "b".repeat(64) },
  baseImage: { path: "/base", sha256: "c".repeat(64) },
  tests: { "tests/check.mjs": { path: "/tests", sha256: "d".repeat(64) } },
  entrypoint: "tests/check.mjs",
  wallSeconds: 30,
  outputBytes: 65536,
};
async function reviewed() {
  const f = fixture();
  const result = await f.workflows.resume(f.id, f.coding, (_task, selection) =>
    Promise.resolve(
      JSON.stringify(
        selection.candidate.provider === "author"
          ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
          : { verdict: "no_findings", findings: [] },
      ),
    ),
  );
  roots.push(...result.artifactDirectories);
  return f;
}
test("packages exact reviewed journal source, never the modified working tree", async () => {
  const { root, coding, id, workflows } = await reviewed();
  await writeFile(join(root, "x.ts"), "export const x = 999;");
  let contents = "";
  const result = await prepareVerification(
    workflows,
    coding,
    id,
    spec,
    join(root, "verification"),
    async (path) => {
      const raw: unknown = JSON.parse(await readFile(path, "utf8"));
      const parsed = packageInput.parse(raw);
      contents = await readFile(parsed.sources["x.ts"]?.path ?? "", "utf8");
      return 0;
    },
  );
  expect(contents).toBe("export const x = 2;");
  expect(result.checkpointSha256).toBe(
    workflows.read(id).reviewedCheckpointSha256,
  );
  expect(result.acceptance).toBe("not_assessed");
  expect(workflows.read(id).phase).toBe("verification_required");
});
test("rejects unreviewed and stale checkpoints without packaging", async () => {
  const f = fixture();
  let calls = 0;
  const runner = () => {
    calls++;
    return Promise.resolve(0);
  };
  await expect(
    prepareVerification(
      f.workflows,
      f.coding,
      f.id,
      spec,
      join(f.root, "v"),
      runner,
    ),
  ).rejects.toThrow(/reviewed/);
  const r = await reviewed();
  r.coding.revisePrompt(r.id, 1, "New requirements", Date.now());
  await expect(
    prepareVerification(
      r.workflows,
      r.coding,
      r.id,
      spec,
      join(r.root, "v"),
      runner,
    ),
  ).rejects.toThrow(/stale/);
  expect(calls).toBe(0);
});
test("a revision during packaging prevents publishing a current binding", async () => {
  const f = await reviewed();
  await expect(
    prepareVerification(
      f.workflows,
      f.coding,
      f.id,
      spec,
      join(f.root, "v"),
      () => {
        f.coding.revisePrompt(f.id, 1, "Changed during packaging", Date.now());
        return Promise.resolve(0);
      },
    ),
  ).rejects.toThrow(/stale/);
  await expect(readFile(join(f.root, "v/binding.json"))).rejects.toThrow();
});
test("caller cannot replace candidate sources or collide tests with them", async () => {
  const f = await reviewed();
  let calls = 0;
  const runner = () => {
    calls++;
    return Promise.resolve(0);
  };
  await expect(
    prepareVerification(
      f.workflows,
      f.coding,
      f.id,
      { ...spec, sources: {} },
      join(f.root, "v"),
      runner,
    ),
  ).rejects.toThrow();
  await expect(
    prepareVerification(
      f.workflows,
      f.coding,
      f.id,
      {
        ...spec,
        tests: { "x.ts": spec.tests["tests/check.mjs"] },
        entrypoint: "x.ts",
      },
      join(f.root, "w"),
      runner,
    ),
  ).rejects.toThrow(/collision/);
  expect(calls).toBe(0);
});

test("failed packaging leaves no binding and output directories are never reused", async () => {
  const f = await reviewed();
  const directory = join(f.root, "failed");
  await expect(
    prepareVerification(f.workflows, f.coding, f.id, spec, directory, () =>
      Promise.resolve(1),
    ),
  ).rejects.toThrow("packaging failed");
  await expect(readFile(join(directory, "binding.json"))).rejects.toThrow();
  let calls = 0;
  await expect(
    prepareVerification(f.workflows, f.coding, f.id, spec, directory, () => {
      calls++;
      return Promise.resolve(0);
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

const acceptance = { kind: "test_process_exit", expected: 0 };
function verificationDrivers(mutate?: () => void, fail = false) {
  return {
    pack: async (path: string, output: string) => {
      const parsed = packageInput.parse(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      const sources = [];
      for (const [name, artifact] of Object.entries(parsed.sources).sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        const content = await readFile(artifact.path, "utf8");
        sources.push({
          path: name,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      }
      const manifest = {
        version: 1,
        emulator: spec.emulator,
        kernel: spec.kernel,
        image: spec.baseImage,
        wallSeconds: spec.wallSeconds,
        outputBytes: spec.outputBytes,
        candidateSha256: canonicalDigest(sources),
        testSha256: canonicalDigest({
          entrypoint: spec.entrypoint,
          files: [
            {
              path: "tests/check.mjs",
              sha256: spec.tests["tests/check.mjs"].sha256,
            },
          ],
        }),
      };
      await mkdir(output);
      await writeFile(join(output, "manifest.json"), JSON.stringify(manifest));
      return 0;
    },
    run: async (path: string, output: string) => {
      const manifest = verificationManifestSchema.parse(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      await mkdir(output);
      const report = {
        version: 1,
        outcome: fail ? "test_process_failed" : "executed",
        acceptance: "not_assessed",
        inputs: manifest,
        manifestSha256: canonicalDigest(manifest),
        controller: {
          exitCode: fail ? 1 : 0,
          candidateSha256: manifest.candidateSha256,
          testSha256: manifest.testSha256,
        },
        emulatorExitCode: 0,
        reaped: true,
        elapsedSeconds: 1,
        outputBytes: 0,
        hostMemoryBound: false,
      };
      await writeFile(join(output, "report.json"), JSON.stringify(report));
      await writeFile(
        join(output, "output.log"),
        fail ? "Assertion failed" : "Passed",
      );
      mutate?.();
      return fail ? 1 : 0;
    },
  };
}
test("workflow verifies a declared rule and retains a failed result without promotion", async () => {
  for (const failed of [false, true]) {
    const f = await reviewed();
    const result = await verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      join(f.root, "verified"),
      verificationDrivers(undefined, failed),
    );
    expect(result.accepted).toBe(!failed);
    expect(f.workflows.read(f.id).verification?.timing).toEqual(result.timing);
    expect(f.workflows.read(f.id).phase).toBe(failed ? "repair" : "verified");
    expect(
      JSON.parse(
        await readFile(join(f.root, "verified/assessment.json"), "utf8"),
      ),
    ).toMatchObject({ accepted: !failed });
  }
});
test("a changed checkpoint during VM execution cannot acquire an assessment", async () => {
  const f = await reviewed();
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      join(f.root, "verified"),
      verificationDrivers(() => {
        f.coding.revisePrompt(f.id, 1, "New requirement", Date.now());
      }),
    ),
  ).rejects.toThrow(/stale/);
  await expect(
    readFile(join(f.root, "verified/assessment.json")),
  ).rejects.toThrow();
});
test("an acceptance rule must be declared before packaging or execution", async () => {
  const f = await reviewed();
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec },
      join(f.root, "verified"),
      verificationDrivers(),
    ),
  ).rejects.toThrow();
  await expect(
    readFile(join(f.root, "verified/package.json")),
  ).rejects.toThrow();
});

test("a package cannot substitute the operator's runtime or execution limits", async () => {
  const f = await reviewed();
  const drivers = verificationDrivers();
  const pack = drivers.pack;
  let calls = 0;
  drivers.pack = async (request, output) => {
    const code = await pack(request, output);
    const path = join(output, "manifest.json");
    const manifest = verificationManifestSchema.parse(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
    manifest.kernel.sha256 = "f".repeat(64);
    await writeFile(path, JSON.stringify(manifest));
    return code;
  };
  drivers.run = () => {
    calls++;
    return Promise.resolve(0);
  };
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      join(f.root, "verified"),
      drivers,
    ),
  ).rejects.toThrow(/runtime/);
  expect(calls).toBe(0);
});

test("large failed-test output is truncated as feedback and still schedules repair", async () => {
  const f = await reviewed();
  const drivers = verificationDrivers(undefined, true);
  const run = drivers.run;
  drivers.run = async (path, output) => {
    const code = await run(path, output);
    await writeFile(join(output, "output.log"), "x".repeat(70000));
    return code;
  };
  await verifyWorkflow(
    f.workflows,
    f.coding,
    f.id,
    { package: spec, acceptance },
    join(f.root, "large"),
    drivers,
  );
  expect(f.workflows.read(f.id).phase).toBe("repair");
  expect(f.workflows.read(f.id).verification?.feedback.length).toBe(8000);
});

test("saved assessment reconciles after a crash before journal commit without another VM run", async () => {
  const f = await reviewed();
  const directory = join(f.root, "recover");
  const failure = vi
    .spyOn(f.workflows, "recordVerification")
    .mockImplementationOnce(() => {
      throw Error("simulated commit interruption");
    });
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      directory,
      verificationDrivers(),
    ),
  ).rejects.toThrow("commit interruption");
  failure.mockRestore();
  expect(f.workflows.read(f.id).phase).toBe("verification_required");
  expect(
    (await reconcileVerification(f.workflows, f.coding, f.id, directory)).phase,
  ).toBe("verified");
  expect(
    (await reconcileVerification(f.workflows, f.coding, f.id, directory)).phase,
  ).toBe("verified");
  const path = join(directory, "execution.json");
  const changed = { package: { ...spec, wallSeconds: 60 }, acceptance };
  await chmod(path, 0o600);
  await writeFile(path, JSON.stringify(changed));
  await expect(
    reconcileVerification(f.workflows, f.coding, f.id, directory),
  ).rejects.toThrow(/binding/);
});

test("promotion installs only the verified snapshot, recovers idempotently and preserves later edits", async () => {
  const f = await reviewed();
  await writeFile(join(f.root, "x.ts"), "export const x = ;");
  await verifyWorkflow(
    f.workflows,
    f.coding,
    f.id,
    { package: spec, acceptance },
    join(f.root, "verified"),
    verificationDrivers(),
  );
  const output = join(f.root, "promotion");
  expect(
    promoteStatus.parse(
      await promoteWorkflow(f.workflows, f.coding, f.id, output),
    ).status,
  ).toBe("applied");
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe(
    "export const x = 2;",
  );
  expect(
    promoteStatus.parse(
      await promoteWorkflow(f.workflows, f.coding, f.id, output),
    ).status,
  ).toBe("applied");
  await writeFile(join(f.root, "x.ts"), "developer edit");
  await expect(
    promoteWorkflow(f.workflows, f.coding, f.id, output),
  ).rejects.toThrow();
  expect(await readFile(join(f.root, "x.ts"), "utf8")).toBe("developer edit");
});
const promoteStatus = z.object({ status: z.literal("applied") });
test("promotion refuses an unverified candidate before filesystem writes", async () => {
  const f = await reviewed();
  await expect(
    promoteWorkflow(f.workflows, f.coding, f.id, join(f.root, "promotion")),
  ).rejects.toThrow(/verified/);
  await expect(
    readFile(join(f.root, "promotion/request.json")),
  ).rejects.toThrow();
});

test("calibration reconciliation rejects evidence from a different saved execution contract", async () => {
  const f = await reviewed();
  const directory = join(f.root, "expected-contract");
  const execution = { package: spec, acceptance };
  await verifyWorkflow(
    f.workflows,
    f.coding,
    f.id,
    execution,
    directory,
    verificationDrivers(),
  );
  await expect(
    reconcileVerification(f.workflows, f.coding, f.id, directory, {
      ...execution,
      package: { ...spec, wallSeconds: 31 },
    }),
  ).rejects.toThrow();
});

test("verification timing survives receipt reconciliation without running or refreshing clocks", async () => {
  const f = await reviewed();
  let clock = 0;
  await verifyWorkflow(
    f.workflows,
    f.coding,
    f.id,
    { package: spec, acceptance },
    join(f.root, "timed"),
    { ...verificationDrivers(), monotonicClock: () => (clock += 10) },
  );
  const original = f.workflows.read(f.id).verification;
  expect(original).toHaveProperty("timing.activeMs", 40);
  expect(original).toHaveProperty("timing.packagingMs", 10);
  expect(original).toHaveProperty("timing.supervisorMs", 10);
  expect(original).toHaveProperty("timing.assessmentAndSetupMs", 20);
  expect(original).toHaveProperty("timing.scope", "prepare_to_assessment");
  const recovered = await reconcileVerification(
    f.workflows,
    f.coding,
    f.id,
    join(f.root, "timed"),
  );
  expect(recovered.verification).toEqual(original);
  expect(clock).toBe(50);
  const assessmentPath = join(f.root, "timed/assessment.json");
  const saved = z
    .looseObject({ timing: z.looseObject({ vmMs: z.number() }) })
    .parse(JSON.parse(await readFile(assessmentPath, "utf8")) as unknown);
  saved.timing.vmMs += 1;
  await chmod(assessmentPath, 0o600);
  await writeFile(assessmentPath, JSON.stringify(saved));
  await expect(
    reconcileVerification(f.workflows, f.coding, f.id, join(f.root, "timed")),
  ).rejects.toThrow(/timing mismatch/);
});

test("a broken measurement clock cannot change verification acceptance or invent zero time", async () => {
  const f = await reviewed();
  const result = await verifyWorkflow(
    f.workflows,
    f.coding,
    f.id,
    { package: spec, acceptance },
    join(f.root, "unknown-clock"),
    {
      ...verificationDrivers(),
      monotonicClock: () => {
        throw new Error("clock unavailable");
      },
    },
  );
  expect(result.accepted).toBe(true);
  expect(result.timing).toMatchObject({
    activeMs: null,
    packagingMs: null,
    supervisorMs: null,
    assessmentAndSetupMs: null,
    vmMs: 1000,
  });
});

test("verification intent survives failed packaging and prevents replay under the same directory", async () => {
  const f = await reviewed();
  const directory = join(f.root, "pending");
  let calls = 0;
  const pack = () => {
    calls++;
    return Promise.resolve(1);
  };
  await expect(
    prepareVerification(f.workflows, f.coding, f.id, spec, directory, pack),
  ).rejects.toThrow();
  expect(f.workflows.read(f.id)).toHaveProperty(
    "verificationAttempts.0.directory",
    directory,
  );
  expect(f.workflows.read(f.id)).toHaveProperty(
    "verificationAttempts.0.proof",
    null,
  );
  await expect(
    prepareVerification(f.workflows, f.coding, f.id, spec, directory, pack),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  expect(f.workflows.read(f.id).verificationAttempts).toHaveLength(1);
});

test("a committed intent before directory creation remains non-replayable after reopen", async () => {
  const f = await reviewed();
  const directory = join(f.root, "intent-only");
  f.workflows.beginVerification(
    f.id,
    f.coding,
    directory,
    createHash("sha256").update(JSON.stringify(spec)).digest("hex"),
  );
  f.workflows.close();
  const reopened = new CodingWorkflows(f.path);
  handles.push(reopened);
  let calls = 0;
  await expect(
    prepareVerification(reopened, f.coding, f.id, spec, directory, () => {
      calls++;
      return Promise.resolve(0);
    }),
  ).rejects.toThrow(/already reserved/);
  expect(calls).toBe(0);
  expect(reopened.read(f.id).verificationAttempts).toHaveLength(1);
  await expect(readFile(join(directory, "binding.json"))).rejects.toThrow();
});

test("a pending reservation rejects a proof for another package", async () => {
  const f = await reviewed();
  const directory = join(f.root, "wrong-package");
  f.workflows.beginVerification(f.id, f.coding, directory, "a".repeat(64));
  expect(() =>
    f.workflows.recordVerification(f.id, f.coding, {
      checkpointSha256: f.workflows.read(f.id).reviewedCheckpointSha256,
      packageSha256: "b".repeat(64),
      specificationSha256: "c".repeat(64),
      reportSha256: "d".repeat(64),
      accepted: true,
      outcome: "executed",
      directory,
      feedback: "",
    }),
  ).toThrow(/attempt changed/);
  expect(f.workflows.read(f.id).verificationAttempts?.[0]?.proof).toBeNull();
});

test("continuous verification binds its contract before work and cannot change it", async () => {
  const f = await reviewed();
  const execution = { package: spec, acceptance };
  const hash = canonicalDigest(execution);
  f.workflows.bindVerificationContract(f.id, hash);
  f.workflows.bindVerificationContract(f.id, hash);
  expect(() => {
    f.workflows.bindVerificationContract(f.id, "e".repeat(64));
  }).toThrow(/contract/);
  let packs = 0;
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: { ...spec, wallSeconds: spec.wallSeconds + 1 }, acceptance },
      join(f.root, "changed"),
      {
        ...verificationDrivers(),
        pack: () => {
          packs++;
          return Promise.resolve(0);
        },
      },
    ),
  ).rejects.toThrow(/contract/);
  expect(packs).toBe(0);
  const { stepWorkflowVerification } =
    await import("../src/workflow-verification-step.js");
  const first = await stepWorkflowVerification(
    f.workflows,
    f.coding,
    f.id,
    execution,
    f.root,
    new AbortController().signal,
    verificationDrivers(),
  );
  expect(first.phase).toBe("verified");
  const noReplay = {
    pack: () => {
      throw Error("replayed pack");
    },
    run: () => {
      throw Error("replayed VM");
    },
  };
  expect(
    (
      await stepWorkflowVerification(
        f.workflows,
        f.coding,
        f.id,
        execution,
        f.root,
        new AbortController().signal,
        noReplay,
      )
    ).phase,
  ).toBe("verified");
});

test("continuous coding verification repairs within saved budgets and retains failed proof", async () => {
  const f = await reviewed();
  const execution = { package: spec, acceptance };
  f.workflows.bindVerificationContract(f.id, canonicalDigest(execution));
  const { runWorkflow } = await import("../src/workflow-runner.js");
  const { stepWorkflowVerification } =
    await import("../src/workflow-verification-step.js");
  let verifications = 0;
  let now = 0;
  const result = await runWorkflow(
    () =>
      f.workflows.resume(f.id, f.coding, (_task, selection) =>
        Promise.resolve(
          JSON.stringify(
            selection.candidate.provider === "author"
              ? { edits: [{ path: "x.ts", content: "export const x = 2;" }] }
              : { verdict: "no_findings", findings: [] },
          ),
        ),
      ),
    new AbortController().signal,
    (ms) => {
      now += ms;
      return Promise.resolve();
    },
    () => now,
    (signal) =>
      stepWorkflowVerification(
        f.workflows,
        f.coding,
        f.id,
        execution,
        f.root,
        signal,
        verificationDrivers(undefined, verifications++ === 0),
      ),
  );
  if (result) roots.push(...result.artifactDirectories);
  expect(result?.phase).toBe("verified");
  expect(verifications).toBe(2);
  expect(f.coding.read(f.id).attempts).toBe(2);
  expect(result?.reviewPairsUsed).toBe(2);
  expect(result?.verificationAttempts?.map((a) => a.proof?.accepted)).toEqual([
    false,
    true,
  ]);
});

test("continuous verification cancellation and pending intents cannot trigger a new execution", async () => {
  const f = await reviewed();
  const execution = { package: spec, acceptance };
  const { stepWorkflowVerification } =
    await import("../src/workflow-verification-step.js");
  const controller = new AbortController();
  controller.abort();
  await expect(
    stepWorkflowVerification(
      f.workflows,
      f.coding,
      f.id,
      execution,
      f.root,
      controller.signal,
    ),
  ).rejects.toThrow(/interrupted/);
  expect(f.workflows.read(f.id).verificationContractSha256).toBeUndefined();
  f.workflows.bindVerificationContract(f.id, canonicalDigest(execution));
  const state = f.workflows.read(f.id);
  if (!state.reviewedCheckpointSha256) throw Error("Missing checkpoint");
  const directory = join(
    f.root,
    ".harness/workflow-verification",
    canonicalDigest(f.id),
    state.reviewedCheckpointSha256,
  );
  f.workflows.beginVerification(
    f.id,
    f.coding,
    directory,
    createHash("sha256").update(JSON.stringify(spec)).digest("hex"),
  );
  let calls = 0;
  await expect(
    stepWorkflowVerification(
      f.workflows,
      f.coding,
      f.id,
      execution,
      f.root,
      new AbortController().signal,
      {
        pack: () => {
          calls++;
          return Promise.resolve(0);
        },
        run: () => {
          calls++;
          return Promise.resolve(0);
        },
      },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  expect(f.workflows.read(f.id).verificationAttempts).toHaveLength(1);
});

test("continuous verification rechecks trust after packaging before VM launch", async () => {
  const f = await reviewed();
  const { stepWorkflowVerification } =
    await import("../src/workflow-verification-step.js");
  let trusted = true;
  let runs = 0;
  const drivers = verificationDrivers();
  await expect(
    stepWorkflowVerification(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      f.root,
      new AbortController().signal,
      {
        beforeEffect: () =>
          trusted ? Promise.resolve() : Promise.reject(Error("trust revoked")),
        pack: async (path, output) => {
          const result = await drivers.pack(path, output);
          trusted = false;
          return result;
        },
        run: () => {
          runs++;
          return Promise.resolve(0);
        },
      },
    ),
  ).rejects.toThrow(/trust revoked/);
  expect(runs).toBe(0);
  expect(f.workflows.read(f.id).verificationAttempts?.[0]?.proof).toBeNull();
});

test("continuous CLI rejects special and oversized execution files before opening journals", async () => {
  const f = fixture();
  const { workflowCli } = await import("../src/workflow-cli.js");
  const { execFileSync } = await import("node:child_process");
  await mkdir(join(f.root, ".harness"));
  await writeFile(join(f.root, ".harness/coding.sqlite"), "");
  await writeFile(join(f.root, ".harness/workflows.sqlite"), "");
  const fifo = join(f.root, "fifo");
  execFileSync("mkfifo", [fifo]);
  await expect(
    workflowCli(["run-verified", f.id, fifo], f.root),
  ).rejects.toThrow(/regular file/);
  const huge = join(f.root, "huge.json");
  await writeFile(huge, " ".repeat(65537));
  await expect(
    workflowCli(["run-verified", f.id, huge], f.root),
  ).rejects.toThrow(/64 KiB/);
});

test("supervisor receipt recovers a crash before assessment without replay or fabricated timing", async () => {
  const f = await reviewed();
  const directory = join(f.root, "receipt-recovery");
  const drivers = verificationDrivers();
  const run = drivers.run;
  drivers.run = async (path, output) => {
    const code = await run(path, output);
    await mkdir(join(directory, "assessment.json"));
    return code;
  };
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      directory,
      drivers,
    ),
  ).rejects.toThrow();
  expect(f.workflows.read(f.id).phase).toBe("verification_required");
  rmSync(join(directory, "assessment.json"), { recursive: true });
  const receiptPath = join(directory, "supervisor.json");
  const receipt = await readFile(receiptPath, "utf8");
  rmSync(receiptPath);
  await expect(
    reconcileVerification(f.workflows, f.coding, f.id, directory),
  ).rejects.toThrow();
  expect(f.workflows.read(f.id).phase).toBe("verification_required");
  await writeFile(receiptPath, receipt, { flag: "wx", mode: 0o400 });
  await writeFile(join(directory, "assessment.json"), "null");
  await expect(
    reconcileVerification(f.workflows, f.coding, f.id, directory),
  ).rejects.toThrow();
  rmSync(join(directory, "assessment.json"));
  const result = await reconcileVerification(
    f.workflows,
    f.coding,
    f.id,
    directory,
  );
  expect(result.phase).toBe("verified");
  expect(result.verification?.timing).toBeUndefined();
  expect(result.verificationAttempts).toHaveLength(1);
  expect(
    (await reconcileVerification(f.workflows, f.coding, f.id, directory))
      .verification,
  ).toEqual(result.verification);
});

test("recovered supervisor failure cannot turn a successful VM report into acceptance", async () => {
  const f = await reviewed();
  const directory = join(f.root, "supervisor-failed");
  const drivers = verificationDrivers();
  const run = drivers.run;
  drivers.run = async (path, output) => {
    await run(path, output);
    await mkdir(join(directory, "assessment.json"));
    return 1;
  };
  await expect(
    verifyWorkflow(
      f.workflows,
      f.coding,
      f.id,
      { package: spec, acceptance },
      directory,
      drivers,
    ),
  ).rejects.toThrow();
  rmSync(join(directory, "assessment.json"), { recursive: true });
  const state = await reconcileVerification(
    f.workflows,
    f.coding,
    f.id,
    directory,
  );
  expect(state.verification?.accepted).toBe(false);
  expect(state.verification?.outcome).toBe("invalid_evidence");
  expect(state.phase).not.toBe("verified");
});
