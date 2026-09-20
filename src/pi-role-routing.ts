import { z } from "zod";
import { mergeCodingHealth } from "./coding-health.js";
import type { PiProjectConfig, projectRoles } from "./pi-project-config.js";
import type { CatalogEntry } from "./model-inventory.js";
import type { Candidate } from "./router.js";

export function piRoleCandidates(
  project: PiProjectConfig,
  role: z.infer<typeof projectRoles>,
  available: readonly CatalogEntry[],
  scoped: readonly {
    provider: string;
    model: string;
    effort?: string;
  }[],
  health: Record<string, { until: number }>,
  now: number,
): Candidate[] {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Invalid now");
  }

  const mergedHealth = mergeCodingHealth([health]);
  const identities = new Map<string, Set<string>>();
  for (const entry of scoped) {
    const models = identities.get(entry.provider);
    if (models === undefined) {
      identities.set(entry.provider, new Set([entry.model]));
    } else if (models.has(entry.model)) {
      throw new Error("Duplicate scoped provider/model identity");
    } else {
      models.add(entry.model);
    }
  }

  const names = project.roles[role];
  if (names === undefined || names.length === 0) return [];

  return project.routing.candidates
    .filter((candidate) => {
      if (
        !names.includes(candidate.name) ||
        !candidate.enabled ||
        (candidate.billing === "metered" && !project.routing.allowMetered)
      ) {
        return false;
      }

      const catalog = available.find(
        (entry) =>
          entry.provider === candidate.provider &&
          entry.model === candidate.model,
      );
      if (!catalog?.efforts) return false;

      const cooldown = mergedHealth[`provider:${candidate.provider}`];
      if ((cooldown?.until ?? 0) > now) return false;

      const pins = scoped.filter(
        (entry) =>
          entry.provider === candidate.provider &&
          entry.model === candidate.model,
      );
      if (scoped.length > 0 && pins.length === 0) return false;

      const efforts = candidate.efforts.filter(
        (effort) =>
          catalog.efforts !== null &&
          catalog.efforts.includes(effort) &&
          (pins.length === 0 ||
            pins[0]?.effort === undefined ||
            pins[0].effort === effort),
      );
      return efforts.length > 0;
    })
    .map((candidate) => {
      const catalog = available.find(
        (entry) =>
          entry.provider === candidate.provider &&
          entry.model === candidate.model,
      );
      const pin = scoped.find(
        (entry) =>
          entry.provider === candidate.provider &&
          entry.model === candidate.model,
      );
      const efforts = candidate.efforts.filter(
        (effort) =>
          catalog !== undefined &&
          catalog.efforts !== null &&
          catalog.efforts.includes(effort) &&
          (pin?.effort === undefined || pin.effort === effort),
      );
      return { ...candidate, efforts };
    });
}
