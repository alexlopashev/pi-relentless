import { createRequire } from "node:module";
import process from "node:process";

const diagnostic =
  "Relentless requires Node with node:sqlite (tested on Node 24.21.0). " +
  "The standalone Bun-based Pi executable is not supported. " +
  "For a project-local Git installation, run from your project: " +
  "node .pi/git/github.com/alexlopashev/pi-relentless/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";

export function assertPiNodeRuntime(
  versions: { node: string; bun?: string } = process.versions,
  loadSqlite: () => unknown = () =>
    createRequire(import.meta.url)("node:sqlite") as unknown,
): void {
  if (versions.bun !== undefined) throw new Error(diagnostic);
  try {
    loadSqlite();
  } catch {
    throw new Error(diagnostic);
  }
}
