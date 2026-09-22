import type { Config } from "./router.js";
export interface CatalogEntry {
  provider: string;
  model: string;
  efforts: string[] | null;
}
export interface InventoryEntry extends CatalogEntry {
  name: string;
  enabled: boolean;
  billing: string;
  catalogPresent: boolean;
  authentication: "present" | "missing" | "unverified";
  billingAllowed: boolean;
  cooldownUntil: number | null;
  capacity: "unverified";
  supportedEfforts: string[];
}

export async function inventory(
  config: Config,
  catalog: CatalogEntry[],
  auth: (provider: string) => Promise<boolean>,
  health: Record<string, { until: number }>,
  now: number,
): Promise<InventoryEntry[]> {
  if (!Number.isFinite(now) || !Number.isInteger(now) || now < 0) {
    throw new Error("Invalid now");
  }

  const authCache = new Map<string, "present" | "missing" | "unverified">();
  const nativeCli = (provider: string) =>
    ["relentless-local", "claude-code", "codex-cli"].includes(provider);

  const getAuth = async (provider: string) => {
    const cached = authCache.get(provider);
    if (cached) return cached;
    let result: "present" | "missing" | "unverified";
    if (provider === "relentless-local" || nativeCli(provider)) {
      result = "unverified";
    } else {
      try {
        result = (await auth(provider)) ? "present" : "missing";
      } catch {
        result = "unverified";
      }
    }
    authCache.set(provider, result);
    return result;
  };

  const result: InventoryEntry[] = [];
  for (const candidate of config.candidates) {
    const found = catalog.find(
      (entry) =>
        entry.provider === candidate.provider &&
        entry.model === candidate.model,
    );
    const authentication = await getAuth(candidate.provider);
    const supported = found?.efforts;
    const until = health[`provider:${candidate.provider}`]?.until;
    result.push({
      provider: candidate.provider,
      model: candidate.model,
      efforts: found?.efforts ?? null,
      name: candidate.name,
      enabled: candidate.enabled,
      billing: candidate.billing,
      catalogPresent: found !== undefined,
      authentication:
        !found && nativeCli(candidate.provider) ? "unverified" : authentication,
      billingAllowed: candidate.billing !== "metered" || config.allowMetered,
      cooldownUntil:
        typeof until === "number" && Number.isFinite(until) && until > now
          ? until
          : null,
      capacity: "unverified",
      supportedEfforts: supported
        ? candidate.efforts.filter((effort) => supported.includes(effort))
        : [],
    });
  }
  return result;
}
