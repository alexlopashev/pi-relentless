import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { snapshotLocalRuntime } from "./local-runtime-snapshot.js";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  managedLocalArgs,
  managedLocalSchema,
} from "./managed-local-config.js";

const requestSchema = z.strictObject({
  config: managedLocalSchema,
  key: z.string().regex(/^[a-f0-9]{64}$/u),
});
let server: ChildProcess | undefined;
let stopping = false,
  started = false;
let killTimer: ReturnType<typeof setTimeout> | undefined;
const abort = new AbortController();
let snapshotDirectory: string | undefined;
let initialization: Promise<void> | undefined;
const finish = async (code: number): Promise<void> => {
  await initialization?.catch(() => undefined);
  if (snapshotDirectory)
    await rm(snapshotDirectory, { recursive: true, force: true });
  process.exit(code);
};
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  abort.abort();
  if (!server) {
    void finish(1);
    return;
  }
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  killTimer = setTimeout(() => {
    if (server?.exitCode === null && server.signalCode === null)
      server.kill("SIGKILL");
  }, 2500);
};
process.on("disconnect", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("error", stop);

async function portUnused(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 18080 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      socket.destroy();
      resolve("code" in error && error.code === "ECONNREFUSED");
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function isReady(key: string): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:18080/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1000)]),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return false;
    }
    const reader = response.body.getReader();
    let text = "",
      size = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 16384) return false;
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const parsed = z
      .object({ data: z.array(z.object({ id: z.string() })).max(16) })
      .safeParse(JSON.parse(text) as unknown);
    return (
      parsed.success &&
      parsed.data.data.some((model) => model.id === "qwen3.5-4b")
    );
  } catch {
    return false;
  }
}
process.on("message", (input: unknown) => {
  if (started) {
    stop();
    return;
  }
  started = true;
  initialization = (async () => {
    const { config, key } = requestSchema.parse(input);
    const startup = setTimeout(stop, config.startupMs);
    const snapshot = await snapshotLocalRuntime(config, abort.signal);
    snapshotDirectory = snapshot.directory;
    if (!(await portUnused())) throw new Error("Local endpoint occupied");
    abort.signal.throwIfAborted();
    server = spawn(
      snapshot.config.executable.path,
      managedLocalArgs(snapshot.config, key),
      {
        stdio: "ignore",
        shell: false,
        env: { PATH: "/usr/bin:/bin", LANG: "C" },
      },
    );
    server.once("error", stop);
    server.once("close", () => {
      clearTimeout(killTimer);
      abort.abort();
      void finish(stopping ? 0 : 1);
    });
    const serverAlive = (): boolean =>
      server?.exitCode === null && server.signalCode === null;
    while (!stopping && serverAlive()) {
      if (await isReady(key)) {
        await delay(100, undefined, { signal: abort.signal });
        if (!serverAlive() || !process.connected)
          throw new Error("Server exited");
        clearTimeout(startup);
        process.send?.({ status: "ready" });
        return;
      }
      await delay(100, undefined, { signal: abort.signal });
    }
    stop();
  })();
  void initialization.catch(stop);
});
