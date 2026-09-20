import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Explicit experimental execution; successful execution does not grant acceptance. */
export async function verificationCli(
  args: string[],
  signal?: AbortSignal,
): Promise<number> {
  if (!(
    (["run", "package"].includes(args[0] ?? "") && args.length === 3) ||
    (args[0] === "status" && args.length === 2)
  ))
    throw new Error(
      "Usage: verify-vm run|package <manifest.json> <new-directory> | verify-vm status <directory>",
    );
  if (signal?.aborted) return 130;
  const child = spawn(
    "python3",
    [
      fileURLToPath(
        new URL(
          args[0] === "package"
            ? "../scripts/package_vm.py"
            : "../scripts/verify_vm.py",
          import.meta.url,
        ),
      ),
      ...(args[0] === "package" ? args.slice(1) : args),
    ],
    { stdio: "inherit" },
  );
  const interrupt = (): void => {
    child.kill("SIGINT");
  };
  const terminate = (): void => {
    child.kill("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const abort = (): void => {
    child.kill("SIGTERM");
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve(code ?? 1);
      });
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
