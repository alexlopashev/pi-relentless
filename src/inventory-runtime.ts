import { registerXaiCatalog } from "./xai-catalog.js";
import { CodingWorkflows } from "./coding-workflow.js";
import { dirname, join } from "node:path";
import { readCodingHealth } from "./coding-inventory.js";
import { mergeCodingHealth } from "./coding-health.js";
import { existsSync } from "node:fs";
import { DatabaseSync } from "./sqlite.js";
import { oauthFreshness } from "./oauth-freshness.js";
import {
  readStoredCredential,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { stateSchema } from "./goal-types.js";
import { digest } from "./ledger.js";
import { readonlyCredentials } from "./pi-worker.js";
import { registerMetaProvider } from "./meta-provider.js";
import { registerPersonalCatalog } from "./personal-catalog.js";
import { registerLocalProvider } from "./local-provider.js";
import { inventory, type InventoryEntry } from "./model-inventory.js";
import { efforts, type Config } from "./router.js";
/** Pi 0.85.1 partial-map semantics: baseline levels inherit; xhigh/max opt in. */
export function catalogEfforts(model: {
  reasoning: boolean;
  thinkingLevelMap?: Partial<Record<string, string | null>>;
}): string[] {
  if (!model.reasoning) return ["off"];
  return efforts.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === "xhigh" || level === "max" ? mapped !== undefined : true;
  });
}
export function readHealth(path: string): {
  health: Record<string, { until: number }>;
  source: "ledger" | "no_ledger";
} {
  if (!existsSync(path)) return { health: {}, source: "no_ledger" };
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare("SELECT body,hash FROM checkpoint WHERE id=1").get();
    if (
      typeof row?.["body"] !== "string" ||
      digest(row["body"]) !== row["hash"]
    )
      throw new Error("Corrupt inventory checkpoint");
    return {
      health: stateSchema.parse(JSON.parse(row["body"]) as unknown).health,
      source: "ledger",
    };
  } finally {
    db.close();
  }
}
/** Observational union; these independent ledgers are not one atomic snapshot. */
export function readInventoryHealth(
  ledgerPath: string,
  codingPath: string,
  workflowPath = join(dirname(codingPath), "workflows.sqlite"),
): {
  source: string;
  health: Record<string, { until: number }>;
} {
  const ledger = readHealth(ledgerPath);
  const coding = readCodingHealth(codingPath);
  let workflowHealth: Record<string, { until: number }> = {};
  const workflowsPresent = existsSync(workflowPath);
  if (workflowsPresent) {
    const workflows = new CodingWorkflows(workflowPath, { readOnly: true });
    try {
      workflowHealth = workflows.reviewHealth();
    } finally {
      workflows.close();
    }
  }
  const sources = [
    ...(ledger.source === "ledger" ? ["ledger"] : []),
    ...(coding.source === "coding_journal" ? ["coding_journal"] : []),
    ...(workflowsPresent ? ["workflow_journal"] : []),
  ];
  return {
    source: sources.join("+") || "none",
    health: mergeCodingHealth([ledger.health, coding.health, workflowHealth]),
  };
}
export async function inventoryRuntime(
  config: Config,
  ledgerPath: string,
  codingPath?: string,
): Promise<{
  cooldownSource: string;
  models: (InventoryEntry & {
    oauthFreshness: ReturnType<typeof oauthFreshness>;
  })[];
}> {
  const snapshot = codingPath
    ? readInventoryHealth(ledgerPath, codingPath)
    : readHealth(ledgerPath);
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: readonlyCredentials(),
  });
  registerMetaProvider(runtime);
  registerPersonalCatalog(runtime);
  registerXaiCatalog(runtime);
  registerLocalProvider(runtime);
  const catalog = runtime.getModels().map((m) => ({
    provider: m.provider,
    model: m.id,
    efforts: catalogEfforts(m),
  }));
  return {
    cooldownSource: snapshot.source,
    models: (
      await inventory(
        config,
        catalog,
        async (provider) =>
          Boolean(
            await runtime.checkAuth(provider, {
              signal: AbortSignal.timeout(5000),
            }),
          ),
        snapshot.health,
        Date.now(),
      )
    ).map((model) => {
      const credential = readStoredCredential(model.provider);
      return {
        ...model,
        oauthFreshness: oauthFreshness(
          credential?.type,
          credential?.type === "oauth" ? credential.expires : undefined,
          Date.now(),
        ),
      };
    }),
  };
}
