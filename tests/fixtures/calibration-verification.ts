import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { executionSchema } from "../../src/workflow-verification.js";
import {
  canonicalDigest,
  verificationManifestSchema,
} from "../../src/verification-assessment.js";
export function verificationDrivers(input: unknown, fail = false) {
  const spec = executionSchema.parse(input).package;
  return {
    pack: async (path: string, output: string) => {
      const request = z
        .object({
          sources: z.record(z.string(), z.object({ path: z.string() })),
        })
        .parse(JSON.parse(await readFile(path, "utf8")) as unknown);
      const sources = [];
      for (const [name, artifact] of Object.entries(request.sources).sort(
        ([a], [b]) => a.localeCompare(b),
      ))
        sources.push({
          path: name,
          sha256: createHash("sha256")
            .update(await readFile(artifact.path))
            .digest("hex"),
        });
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
          files: Object.entries(spec.tests)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([path, artifact]) => ({ path, sha256: artifact.sha256 })),
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
      await writeFile(
        join(output, "report.json"),
        JSON.stringify({
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
        }),
      );
      await writeFile(
        join(output, "output.log"),
        fail ? "Assertion failed" : "Passed",
      );
      return fail ? 1 : 0;
    },
  };
}
