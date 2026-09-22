import { mkdtemp, writeFile, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fixture } from "./coding-calibration.js";
import { CodingCalibrationJournal } from "../../src/coding-calibration-journal.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function setup() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "calibration-prepare-")),
  );
  await mkdir(join(root, ".pi"));
  const source = "export const x = 1;\n",
    path = join(root, "artifact");
  await writeFile(path, "test artifact");
  await writeFile(join(root, "x.ts"), source);
  const input = fixture(),
    artifact = { path, sha256: hash("test artifact") };
  for (const item of input.cases) {
    item.request.sourceRoot = root;
    item.sourceHashes["x.ts"] = hash(source);
    Object.assign(item.execution.package, {
      emulator: artifact,
      kernel: artifact,
      baseImage: artifact,
      tests: { "test.mjs": artifact },
    });
  }
  const candidates = [
    ...input.config.candidates,
    ...input.review.config.candidates,
  ];
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: { candidates },
        roles: { coder: ["a", "b"], reviewer: ["review-a", "review-b"] },
      },
    }),
  );
  const journal = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
  );
  const state = journal.register(input);
  journal.close();
  const trial = state.plan.trials[0];
  if (!trial) throw new Error("Missing trial");
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
  };
  return { root, input, context, trial };
}
