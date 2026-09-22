import * as nodeModule from "node:module";
import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import process from "node:process";
let selected: string | undefined;
/** A standalone Pi binary is not a Node worker executable. Never fork it. */
export function nodeExecutable(): string {
  if (process.versions["bun"] === undefined) return process.execPath;
  if (selected) return selected;
  try {
    const path = execFileSync(
      "node",
      [
        "--input-type=commonjs",
        "-e",
        "if(process.versions.bun)process.exit(1);require('node:sqlite');if(typeof require('node:module').stripTypeScriptTypes!=='function')process.exit(1);process.stdout.write(process.execPath)",
      ],
      {
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
        timeout: 5000,
        maxBuffer: 4096,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (!isAbsolute(path) || path.includes("\n"))
      throw new Error("Invalid Node path");
    selected = path;
    return path;
  } catch {
    throw new Error(
      "Relentless workers require Node with SQLite and TypeScript support on PATH (tested on Node 24.21.0). Install Node, then restart Pi; no alternate Pi launch command is needed.",
    );
  }
}

/** Erase types without executing project code, using Node in either Pi host. */
export function stripTypes(source: string): string {
  if (process.versions["bun"] === undefined)
    return nodeModule.stripTypeScriptTypes(source, { mode: "transform" });
  return execFileSync(
    nodeExecutable(),
    [
      "--input-type=commonjs",
      "-e",
      "process.stdout.write(require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync(0,'utf8'),{mode:'transform'}))",
    ],
    {
      input: source,
      encoding: "utf8",
      env: {},
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    },
  );
}
