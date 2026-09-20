import { join } from "node:path";
import { expect, test } from "vitest";
import { planCodingCalibration } from "../src/coding-calibration-plan.js";
import { c, artifact, fixture } from "./fixtures/coding-calibration.js";
test("predeclares every route/case/repetition deterministically and keeps an immutable contract hash", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const plan = planCodingCalibration(input);

  expect(plan.trials).toHaveLength(8);
  expect(planCodingCalibration(input)).toEqual(plan);
  expect(JSON.stringify(input)).toBe(before);
});
test("changing test/runtime/source/prompt bytes changes the suite identity; cohort id changes only contract identity", () => {
  const input = fixture();
  const base = planCodingCalibration(input);
  const second = { ...input, id: "another-cohort" };
  expect(planCodingCalibration(second)).toMatchObject({
    suiteHash: base.suiteHash,
  });
  for (const change of ["test", "source", "prompt"]) {
    const changed = structuredClone(input);
    const first = changed.cases[0];
    if (!first) throw new Error("Missing case");
    if (change === "test")
      first.execution.package.tests["test.mjs"].sha256 = "c".repeat(64);
    if (change === "source") first.sourceHashes["x.ts"] = "c".repeat(64);
    if (change === "prompt")
      first.request.task.prompt = "Different requirement";
    expect(planCodingCalibration(changed).suiteHash).not.toBe(base.suiteHash);
  }
});
test("rejects incomplete source pins, duplicate cases, unreviewable authors and excess trial budget", () => {
  const missing = fixture();
  const first = missing.cases[0];
  if (!first) throw new Error("Missing case");
  Reflect.deleteProperty(first.sourceHashes, "x.ts");
  expect(() => planCodingCalibration(missing)).toThrow();
  const duplicate = fixture();
  const firstDuplicate = duplicate.cases[0];
  if (!firstDuplicate) throw new Error("Missing case");
  duplicate.cases[1] = structuredClone(firstDuplicate);
  expect(() => planCodingCalibration(duplicate)).toThrow();
  const unreviewable = fixture();
  unreviewable.review.config.candidates = [c("a"), c("review-b")];
  expect(() => planCodingCalibration(unreviewable)).toThrow();
  const large = fixture();
  large.config.candidates = Array.from({ length: 10 }, (_, i) =>
    c(`m${String(i)}`),
  );
  expect(() => planCodingCalibration(large)).toThrow();
});

test("runtime timeouts affect suite identity and task-ineligible authors do not constrain reviewers", () => {
  const input = fixture();
  const original = planCodingCalibration(input);
  expect(
    planCodingCalibration({
      ...input,
      config: { ...input.config, timeoutMs: 500 },
    }).suiteHash,
  ).not.toBe(original.suiteHash);
  const pinned = fixture();
  pinned.config.candidates.push(c("review-a"));
  for (const item of pinned.cases)
    Object.assign(item.request.task, { provider: "a" });
  expect(planCodingCalibration(pinned).trials).toHaveLength(4);
});

test("Pi plans from project roles and scope without accepting request-supplied routing permissions", async () => {
  const { mkdtemp, mkdir, writeFile, realpath } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { clankerCommand } = await import("../src/pi-extension.js");
  const root = await mkdtemp(join(tmpdir(), "pi-calibration-"));
  await mkdir(join(root, ".pi"));
  const contract = fixture();
  const candidates = [
    ...contract.config.candidates,
    ...contract.review.config.candidates,
  ];
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      clanker: {
        version: 1,
        routing: { candidates, allowMetered: false },
        roles: { coder: ["a", "b"], reviewer: ["review-a", "review-b"] },
      },
    }),
  );
  const request = {
    version: contract.version,
    id: contract.id,
    workload: contract.workload,
    repeats: contract.repeats,
    cases: contract.cases,
    maxReviewPairs: contract.maxReviewPairs,
  };
  const canonicalRoot = await realpath(root);
  const input = {
    ...request,
    reviewTask: contract.review.task,
    cases: request.cases.map((item) => ({
      ...item,
      request: { ...item.request, sourceRoot: canonicalRoot },
    })),
  };
  const notices: { message: string; type: string }[] = [];
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({
      available: candidates.map((c) => ({
        provider: c.provider,
        model: c.model,
        efforts: c.efforts,
      })),
      scoped: [],
    }),
    ui: {
      notify: (message: string, type: "info" | "error") => {
        notices.push({ message, type });
      },
    },
  };
  await clankerCommand("calibration-plan " + JSON.stringify(input), context);
  const result: unknown = JSON.parse(notices[0]?.message ?? "null");
  expect(result).toMatchObject({ dispatched: false, persisted: false });
  expect(result).toHaveProperty("trials.length", 8);
  notices.length = 0;
  await clankerCommand(
    "calibration-plan " +
      JSON.stringify({ ...input, config: { candidates, allowMetered: true } }),
    context,
  );
  expect(notices[0]?.type).toBe("error");
  notices.length = 0;
  await clankerCommand(
    "calibration-plan " +
      JSON.stringify({
        ...input,
        cases: input.cases.map((item) => ({
          ...item,
          request: { ...item.request, sourceRoot: "/another-project" },
        })),
      }),
    context,
  );
  expect(notices[0]?.type).toBe("error");
  notices.length = 0;
  await clankerCommand("calibration-plan " + JSON.stringify(input), {
    ...context,
    models: () => ({
      ...context.models(),
      scoped: [{ provider: "a", model: "a", effort: "low" }],
    }),
  });
  expect(notices[0]?.type).toBe("error");
});

test("rejects declared file namespaces and entrypoints that cannot be packaged", () => {
  for (const path of ["x.ts", "x.ts/test.mjs", "test.json"]) {
    const input = fixture();
    const item = input.cases[0];
    if (!item) throw new Error("Missing case");
    Object.assign(item.execution.package, {
      tests: { [path]: artifact },
      entrypoint: path,
    });
    expect(() => planCodingCalibration(input)).toThrow();
  }
});

test("Pi can persist a cohort without inference and read it after the model registry is unavailable", async () => {
  const { mkdtemp, mkdir, writeFile, realpath } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { clankerCommand } = await import("../src/pi-extension.js");
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "pi-cohort-create-")),
  );
  await mkdir(join(root, ".pi"));
  const contract = fixture();
  const candidates = [
    ...contract.config.candidates,
    ...contract.review.config.candidates,
  ];
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      clanker: {
        version: 1,
        routing: { candidates },
        roles: { coder: ["a", "b"], reviewer: ["review-a", "review-b"] },
      },
    }),
  );
  const input = {
    version: 1,
    id: contract.id,
    workload: contract.workload,
    repeats: contract.repeats,
    maxReviewPairs: contract.maxReviewPairs,
    reviewTask: contract.review.task,
    cases: contract.cases.map((item) => ({
      ...item,
      request: { ...item.request, sourceRoot: root },
    })),
  };
  const notices: { message: string; type: string }[] = [];
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    models: () => ({
      available: candidates.map((c) => ({
        provider: c.provider,
        model: c.model,
        efforts: c.efforts,
      })),
      scoped: [],
    }),
    ui: {
      notify: (message: string, type: "info" | "error") => {
        notices.push({ message, type });
      },
    },
  };
  await clankerCommand("calibration-create " + JSON.stringify(input), context);
  expect(notices[0]?.type).toBe("info");
  const created: unknown = JSON.parse(notices[0]?.message ?? "null");
  expect(created).toMatchObject({
    persisted: true,
    dispatched: false,
    artifactsVerified: false,
    bindings: {},
  });
  notices.length = 0;
  await clankerCommand("calibration-status " + input.id, {
    ...context,
    models: () => {
      throw new Error("offline");
    },
  });
  expect(JSON.parse(notices[0]?.message ?? "null") as unknown).toEqual(created);
  notices.length = 0;
  await clankerCommand(
    "calibration-create " + JSON.stringify({ ...input, repeats: 1 }),
    context,
  );
  expect(notices[0]?.type).toBe("error");
});

test("calibration pins distinguish declared absence from existing source hashes", () => {
  const input = fixture();
  const absent = {
    ...input,
    cases: input.cases.map((item) => ({
      ...item,
      request: {
        ...item.request,
        files: item.request.files.map((file) => ({ ...file, create: true })),
      },
      sourceHashes: { "x.ts": null },
    })),
  };
  expect(planCodingCalibration(absent).suiteHash).not.toBe(
    planCodingCalibration(input).suiteHash,
  );
  expect(() =>
    planCodingCalibration({
      ...absent,
      cases: absent.cases.map((item) => ({
        ...item,
        sourceHashes: { "x.ts": "a".repeat(64) },
      })),
    }),
  ).toThrow();
  expect(() =>
    planCodingCalibration({
      ...input,
      cases: input.cases.map((item) => ({
        ...item,
        sourceHashes: { "x.ts": null },
      })),
    }),
  ).toThrow();
});
