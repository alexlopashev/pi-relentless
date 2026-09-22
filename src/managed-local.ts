import { nodeExecutable } from "./node-runtime.js";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  managedLocalSchema,
  type ManagedLocalConfig,
} from "./managed-local-config.js";
import { Failure } from "./failures.js";

export interface ManagedLocalLease {
  headers: { Authorization: string };
  close(): Promise<void>;
}
/** Only the supervisor owns the server; IPC disconnect requests cleanup after parent death. */
export async function startManagedLocal(
  input: ManagedLocalConfig,
  signal?: AbortSignal,
): Promise<ManagedLocalLease> {
  const config = managedLocalSchema.parse(input);
  if (signal?.aborted) throw new Failure("interrupted");
  const key = randomBytes(32).toString("hex");
  const child = fork(
    new URL("../dist/managed-local-entry.js", import.meta.url),
    [],
    {
      execPath: nodeExecutable(),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: [],
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
    },
  );
  let stopping = false,
    ready = false,
    closed = false;
  let resolveClosed: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const stop = (): void => {
    if (stopping || closed) return;
    stopping = true;
    if (child.connected) child.send({ command: "stop" }, () => undefined);
  };
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, config.startupMs + 5000);
  return new Promise<ManagedLocalLease>((resolve, reject) => {
    child.on("message", (message: unknown) => {
      if (
        !z.strictObject({ status: z.literal("ready") }).safeParse(message)
          .success ||
        ready
      ) {
        stop();
        return;
      }
      if (stopping || signal?.aborted) {
        stop();
        return;
      }
      ready = true;
      clearTimeout(timer);
      resolve({
        headers: { Authorization: `Bearer ${key}` },
        close: async () => {
          stop();
          await settled;
        },
      });
    });
    child.on("error", stop);
    child.on("close", () => {
      closed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolveClosed();
      if (!ready)
        reject(new Failure(signal?.aborted ? "interrupted" : "unavailable"));
    });
    child.send({ config, key }, (error) => {
      if (error) stop();
    });
    if (signal?.aborted) stop();
  });
}
