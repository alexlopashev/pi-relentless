import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { configSchema, tasksSchema, route } from "./router.js";
import { runSwarm } from "./swarm.js";

async function readJson(path: string): Promise<unknown> {
  const input = await readFile(path, "utf8");
  if (Buffer.byteLength(input) > 8_000_000)
    throw new Error("JSON input exceeds 8 MB");
  return JSON.parse(input) as unknown;
}
async function main(): Promise<void> {
  if (process.argv[2] === "verify-vm") {
    const { verificationCli } = await import("./verification-cli.js");
    process.exitCode = await verificationCli(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "evaluation") {
    const [mode, directory, ...extra] = process.argv.slice(3);
    if (!directory || extra.length || (mode !== "resume" && mode !== "status"))
      throw new Error("Usage: evaluation resume|status <directory>");
    const { evaluationDirectory } = await import("./evaluation-runtime.js");
    const state = await evaluationDirectory(directory, mode);
    console.log(JSON.stringify(state, null, 2));
    if (
      state.pending ||
      state.report?.stopped ||
      state.report?.observations.some((o) => !o.accepted)
    )
      process.exitCode = 1;
    return;
  }
  if (process.argv[2] === "workflow" && process.argv[3] === "promote") {
    const { workflowPromotionCli } = await import("./workflow-promotion.js");
    console.log(
      JSON.stringify(
        await workflowPromotionCli(process.argv.slice(4)),
        null,
        2,
      ),
    );
    return;
  }
  if (
    process.argv[2] === "workflow" &&
    process.argv[3] === "reconcile-verification"
  ) {
    const { workflowReconcileCli } = await import("./workflow-verification.js");
    const state = await workflowReconcileCli(process.argv.slice(4));
    console.log(JSON.stringify(state, null, 2));
    if (state.phase !== "verified" && state.phase !== "repair")
      process.exitCode = 1;
    return;
  }
  if (
    process.argv[2] === "workflow" &&
    ["package", "verify"].includes(process.argv[3] ?? "")
  ) {
    const { workflowPackageCli } = await import("./workflow-verification.js");
    const result = await workflowPackageCli(
      process.argv.slice(4),
      process.cwd(),
      process.argv[3] === "verify" ? "verify" : "package",
    );
    console.log(JSON.stringify(result, null, 2));
    if (
      process.argv[3] === "verify" &&
      !(
        typeof result === "object" &&
        result !== null &&
        "accepted" in result &&
        result.accepted === true
      )
    )
      process.exitCode = 1;
    return;
  }
  if (process.argv[2] === "workflow") {
    const { workflowCli } = await import("./workflow-cli.js");
    const state = await workflowCli(process.argv.slice(3));
    console.log(JSON.stringify(state, null, 2));
    if (
      ["resume", "run"].includes(process.argv[3] ?? "") &&
      !["verification_required", "verified"].includes(state.phase)
    )
      process.exitCode = 1;
    return;
  }
  if (process.argv[2] === "coding") {
    const { codingCli } = await import("./coding-cli.js");
    const result = await codingCli(process.argv.slice(3));
    console.log(JSON.stringify(result, null, 2));
    if (process.argv[3] === "resume" && result.status !== "ready_for_review")
      process.exitCode = 1;
    return;
  }
  if (process.argv[2] === "goal") {
    const { goalsCli } = await import("./goals-cli.js");
    await goalsCli(process.argv.slice(3));
    return;
  }
  const [command, configPath, tasksPath, ...extra] = process.argv.slice(2);
  if (extra.length > 0) throw new Error("Unexpected arguments");
  if (command === "inventory" && configPath && !tasksPath) {
    const { inventoryRuntime } = await import("./inventory-runtime.js");
    const config = configSchema.parse(await readJson(configPath));
    console.log(
      JSON.stringify(
        await inventoryRuntime(
          config,
          join(process.cwd(), ".harness", "ledger.sqlite"),
          join(process.cwd(), ".harness", "coding.sqlite"),
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "evaluate" && configPath && tasksPath) {
    const { evaluationSchema } = await import("./evaluation.js");
    const config = configSchema.parse(await readJson(configPath));
    const suite = evaluationSchema.parse(await readJson(tasksPath));
    const directory = join(
      process.cwd(),
      ".harness",
      "evaluations",
      randomUUID(),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify({ config, suite }, null, 2),
      { mode: 0o600 },
    );
    console.log(`Evaluation: ${directory}`);
    const { evaluationDirectory } = await import("./evaluation-runtime.js");
    const state = await evaluationDirectory(directory, "create");
    const report = state.report;
    if (!report) throw new Error("Missing evaluation report");
    console.log(JSON.stringify(report, null, 2));
    if (report.stopped || report.observations.some((o) => !o.accepted))
      process.exitCode = 1;
    return;
  }
  if (command === "code" && configPath && tasksPath) {
    const { runCoding } = await import("./coding-worker.js");
    const { processWorker } = await import("./process-worker.js");
    const config = configSchema.parse(await readJson(configPath));
    const goalId = randomUUID();
    const result = await runCoding(
      await readJson(tasksPath),
      config,
      (task, selection) =>
        processWorker(
          {
            goalId,
            revision: 1,
            attemptId: randomUUID(),
            task,
            selection,
            config,
          },
          new AbortController().signal,
        ),
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "ready_for_review") process.exitCode = 1;
    return;
  }
  if (command === "models" && !configPath) {
    const { catalog } = await import("./pi-worker.js");
    console.log(JSON.stringify(await catalog(), null, 2));
    return;
  }
  if (command === "demo" && !configPath) {
    const config = configSchema.parse({
      candidates: [
        {
          name: "demo",
          provider: "fixture",
          model: "offline",
          billing: "subscription",
          enabled: true,
          quality: 1,
          preference: 1,
          efforts: ["low"],
        },
      ],
    });
    const tasks = tasksSchema.parse(
      ["architecture", "testing", "operations"].map((id) => ({
        id,
        prompt: `Review ${id}`,
        minQuality: 1,
        effort: "low",
      })),
    );
    console.log(
      JSON.stringify(
        await runSwarm(tasks, config, (task) =>
          Promise.resolve(`OFFLINE FIXTURE: ${task.prompt}`),
        ),
        null,
        2,
      ),
    );
    return;
  }
  if ((command === "plan" || command === "swarm") && configPath && tasksPath) {
    const config = configSchema.parse(await readJson(configPath));
    const tasks = tasksSchema.parse(await readJson(tasksPath));
    const selections = tasks.map((task) =>
      route(task, config.candidates, config.allowMetered, config.observations),
    );
    if (command === "plan") {
      console.log(JSON.stringify(selections, null, 2));
      return;
    }
    const { createPiWorker } = await import("./pi-worker.js");
    const worker = await createPiWorker(config, selections);
    const directory = join(process.cwd(), ".harness", "runs", randomUUID());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify({ config, tasks }, null, 2),
      { mode: 0o600 },
    );
    console.log(`Run: ${directory}`);
    const results = await runSwarm(tasks, config, worker);
    await writeFile(
      join(directory, "results.json"),
      JSON.stringify(results, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => result.status === "failed"))
      process.exitCode = 1;
    return;
  }
  throw new Error(
    "Usage: pnpm clanker demo | models | inventory <config.json> | plan <config.json> <tasks.json> | swarm <config.json> <tasks.json> | code <config.json> <coding.json> | evaluate <config.json> <suite.json>",
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Harness failed");
  process.exitCode = 1;
});
