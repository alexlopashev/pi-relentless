import { expect, test } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CodingJournal } from "../src/coding-journal.js";
import { preparePiCalibrationTrial } from "../src/pi-calibration-prepare.js";
import { setup } from "./fixtures/pi-calibration.js";
test("prepares exactly one pinned author workflow and recovers it without reading changed source or model registry", async () => {
  const { root, input, context, trial } = await setup();
  const result = await preparePiCalibrationTrial(input.id, trial.id, context);
  expect(result).toMatchObject({
    phase: "coding",
    dispatched: false,
    sourcePinsVerified: true,
    artifactPinsVerified: true,
  });
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const snapshot = coding.read(result.codingId);
  expect(snapshot.attempts).toBe(0);
  expect(snapshot.config.candidates).toHaveLength(1);
  expect(snapshot.request.task).toMatchObject({
    provider: "a",
    model: "a",
    effort: "low",
  });
  coding.close();
  await writeFile(join(root, "x.ts"), "changed after snapshot");
  expect(
    await preparePiCalibrationTrial(input.id, trial.id, {
      ...context,
      models: () => {
        throw new Error("offline");
      },
    }),
  ).toEqual(result);
});
test("rejects incorrect source and runtime pins before creating coding work", async () => {
  const { root, input, context, trial } = await setup();
  await writeFile(join(root, "x.ts"), "changed");
  await expect(
    preparePiCalibrationTrial(input.id, trial.id, context),
  ).rejects.toThrow();
  await writeFile(join(root, "x.ts"), "export const x = 1;\n");
  await writeFile(join(root, "artifact"), "stale artifact");
  await expect(
    preparePiCalibrationTrial(input.id, trial.id, context),
  ).rejects.toThrow();
});
test("rejects unavailable scoped authors and untrusted projects", async () => {
  const { input, context, trial } = await setup();
  await expect(
    preparePiCalibrationTrial(input.id, trial.id, {
      ...context,
      isProjectTrusted: () => false,
    }),
  ).rejects.toThrow();
  await expect(
    preparePiCalibrationTrial(input.id, trial.id, {
      ...context,
      models: () => ({
        ...context.models(),
        scoped: [{ provider: "b", model: "b", effort: "low" }],
      }),
    }),
  ).rejects.toThrow();
});

test("Pi exposes preparation without invoking a worker", async () => {
  const { input, context, trial } = await setup();
  const { clankerCommand } = await import("../src/pi-extension.js");
  const notices: { message: string; type: string }[] = [];
  await clankerCommand(
    "calibration-prepare " +
      JSON.stringify({ cohortId: input.id, trialId: trial.id }),
    {
      ...context,
      ui: {
        notify: (message: string, type: "info" | "error") => {
          notices.push({ message, type });
        },
      },
    },
  );
  expect(notices[0]?.type).toBe("info");
  expect(JSON.parse(notices[0]?.message ?? "null") as unknown).toMatchObject({
    phase: "coding",
    dispatched: false,
  });
});

test("prepared workflow runs its assigned author once and preparation preserves the completed attempt", async () => {
  const { root, input, context, trial } = await setup();
  const prepared = await preparePiCalibrationTrial(input.id, trial.id, context);
  const { resumeCoding } = await import("../src/durable-coding.js");
  const coding = new CodingJournal(join(root, ".harness/coding.sqlite"));
  const authors: string[] = [];
  const result = await resumeCoding(
    prepared.codingId,
    coding,
    (_task, selection) => {
      authors.push(selection.candidate.provider);
      return Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x = 2;\n" }],
        }),
      );
    },
  );
  expect(result.status).toBe("ready_for_review");
  expect(authors).toEqual(["a"]);
  expect(coding.read(prepared.codingId).attempts).toBe(1);
  coding.close();
  expect(await preparePiCalibrationTrial(input.id, trial.id, context)).toEqual(
    prepared,
  );
  const reopened = new CodingJournal(join(root, ".harness/coding.sqlite"));
  expect(reopened.read(prepared.codingId).attempts).toBe(1);
  reopened.close();
});
