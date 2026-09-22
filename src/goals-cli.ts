import { nodeExecutable } from "./node-runtime.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Ledger } from "./ledger.js";
import { Supervisor } from "./supervisor.js";
import { fileURLToPath } from "node:url";
import { launchAgent, serviceLabel } from "./service.js";
import { processWorker } from "./process-worker.js";
async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
export async function goalsCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const path = resolve(".harness", "ledger.sqlite");
  if (command === "service" && !rest.length) {
    if (process.platform !== "darwin")
      throw new Error(
        "Service template currently supports macOS; run goal run under your service manager",
      );
    const destination = resolve(
      ".harness",
      "service",
      `${serviceLabel(process.cwd())}.plist`,
    );
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(
      destination,
      launchAgent(
        nodeExecutable(),
        fileURLToPath(new URL("./cli.js", import.meta.url)),
        process.cwd(),
      ),
      { mode: 0o600 },
    );
    console.log(
      `Service definition: ${destination} (generated, not installed)`,
    );
    return;
  }
  if (command === "restore" && rest.length === 1 && rest[0]) {
    await Ledger.restore(resolve(rest[0]), path);
    console.log("Ledger restored; review status before starting supervision");
    return;
  }
  const ledger = new Ledger(path);
  try {
    if (command === "create" && rest.length === 1 && rest[0]) {
      console.log(ledger.create(await json(rest[0])));
      return;
    }
    if (command === "status" && rest.length <= 1) {
      console.log(
        JSON.stringify(
          rest[0] ? ledger.goal(rest[0]) : ledger.read().goals,
          null,
          2,
        ),
      );
      return;
    }
    if (command === "events" && !rest.length) {
      console.log(JSON.stringify(ledger.events(), null, 2));
      return;
    }
    if (
      command === "revise" &&
      rest.length === 3 &&
      rest[0] &&
      rest[1] &&
      rest[2]
    ) {
      ledger.revise(
        rest[0],
        Number(rest[1]),
        await json(rest[2]),
        `local user file: ${resolve(rest[2])}`,
      );
      return;
    }
    if (
      (command === "cancel" || command === "supersede") &&
      rest.length === 2 &&
      rest[0] &&
      rest[1]
    ) {
      ledger.cancel(
        rest[0],
        Number(rest[1]),
        "local user command",
        Date.now(),
        command === "supersede",
      );
      return;
    }
    if (command === "backup" && rest.length === 1 && rest[0]) {
      if (ledger.read().lease)
        throw new Error("Stop supervisor before offline backup");
      ledger.backup(resolve(rest[0]));
      console.log("Backup verified on restore; original ledger retained");
      return;
    }
    if ((command === "run" || command === "once") && !rest.length) {
      const supervisor = new Supervisor(ledger, processWorker);
      const shutdown = new AbortController();
      const stop = (): void => {
        shutdown.abort();
        supervisor.requestStop();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        while (!shutdown.signal.aborted) {
          const worked = await supervisor.tick();
          if (command === "once") break;
          // Process remains available for CLI contract updates even when all goals are blocked.
          if (!worked)
            await sleep(1000, undefined, { signal: shutdown.signal }).catch(
              () => undefined,
            );
        }
      } finally {
        supervisor.close();
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
      return;
    }
    throw new Error(
      "Usage: relentless goal create <contract.json> | status [id] | events | revise <id> <revision> <contract.json> | cancel|supersede <id> <revision> | run | once | backup|restore <file>",
    );
  } finally {
    ledger.close();
  }
}
