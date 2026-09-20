import process from "node:process";
import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
let sourceInstall = true;
try {
  await access(new URL("tsconfig.build.json", root));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  sourceInstall = false;
}
if (sourceInstall) {
  // Pi runs npm install in Git clones. Use the installed compiler, not global pnpm.
  const require = createRequire(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
    { cwd: fileURLToPath(root), stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Relentless worker build failed");
}
// Packed installs already contain these outputs and require no compiler run.
for (const entry of ["worker-entry.js", "managed-local-entry.js", "cli.js"]) {
  await access(new URL(`dist/${entry}`, root));
}
