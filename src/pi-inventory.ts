import type { CatalogEntry } from "./model-inventory.js";
import { piRoleCandidates } from "./pi-role-routing.js";
import { type PiProjectConfig, projectRoles } from "./pi-project-config.js";

export interface ReviewCoverageAuthor {
  name: string;
  provider: string;
  reviewerProviders: string[];
  sufficient: boolean;
}

export interface ReviewCoverage {
  scope: "current_role_pools";
  requiredIndependentProviders: 2;
  byAuthor: ReviewCoverageAuthor[];
  allEligibleAuthors: {
    providers: string[];
    reviewerProviders: string[];
    sufficient: boolean;
  };
}

export interface PiInventoryEntry {
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
  billing: string;
  billingAllowed: boolean;
  catalogPresent: boolean | null;
  sessionAvailable: boolean;
  roles: string[];
  eligibleRoles: string[];
  cooldownUntil: number | null;
  capacity: "unverified";
  capability: "unverified";
}

export interface PiInventory {
  observedAt: number;
  configured: PiInventoryEntry[];
  unconfiguredAvailable: CatalogEntry[];
  reviewCoverage: ReviewCoverage;
}

const emptyReviewCoverage = (): ReviewCoverage => ({
  scope: "current_role_pools",
  requiredIndependentProviders: 2,
  byAuthor: [],
  allEligibleAuthors: {
    providers: [],
    reviewerProviders: [],
    sufficient: false,
  },
});

export function projectPiInventory(
  project: PiProjectConfig | null,
  models: {
    available: readonly CatalogEntry[];
    scoped: readonly { provider: string; model: string; effort?: string }[];
    catalog?: readonly CatalogEntry[];
  },
  health: Record<string, { until: number }>,
  now: number,
): PiInventory {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid now");
  if (project === null) {
    return {
      observedAt: now,
      configured: [],
      unconfiguredAvailable: [...models.available],
      reviewCoverage: emptyReviewCoverage(),
    };
  }

  const eligibleByCandidate = new Map<string, string[]>();
  const eligibleByRole = new Map<string, ReturnType<typeof piRoleCandidates>>();
  for (const role of projectRoles.options) {
    const candidates = piRoleCandidates(
      project,
      role,
      models.available,
      models.scoped,
      health,
      now,
    );
    eligibleByRole.set(role, candidates);
    for (const candidate of candidates) {
      const roles = eligibleByCandidate.get(candidate.name) ?? [];
      roles.push(role);
      eligibleByCandidate.set(candidate.name, roles);
    }
  }

  const reviewers = eligibleByRole.get("reviewer") ?? [];
  const reviewerProviders = new Set(
    reviewers.map((candidate) => candidate.provider),
  );
  const coders = eligibleByRole.get("coder") ?? [];
  const byAuthor = coders.map((author) => {
    const providers = [...reviewerProviders]
      .filter((provider) => provider !== author.provider)
      .sort();
    return {
      name: author.name,
      provider: author.provider,
      reviewerProviders: providers,
      sufficient: providers.length >= 2,
    };
  });
  const authorProviders = [
    ...new Set(coders.map((candidate) => candidate.provider)),
  ].sort();
  const allReviewers = [...reviewerProviders]
    .filter((provider) => !authorProviders.includes(provider))
    .sort();
  const reviewCoverage: ReviewCoverage = {
    scope: "current_role_pools",
    requiredIndependentProviders: 2,
    byAuthor,
    allEligibleAuthors: {
      providers: authorProviders,
      reviewerProviders: allReviewers,
      sufficient: coders.length > 0 && allReviewers.length >= 2,
    },
  };

  const configured = project.routing.candidates.map((candidate) => {
    const catalogEntry = models.catalog?.find(
      (entry) =>
        entry.provider === candidate.provider &&
        entry.model === candidate.model,
    );
    const sessionAvailable = models.available.some(
      (entry) =>
        entry.provider === candidate.provider &&
        entry.model === candidate.model,
    );
    const roles = projectRoles.options.filter((role) =>
      project.roles[role]?.includes(candidate.name),
    );
    const until = health[`provider:${candidate.provider}`]?.until;
    return {
      name: candidate.name,
      provider: candidate.provider,
      model: candidate.model,
      enabled: candidate.enabled,
      billing: candidate.billing,
      billingAllowed:
        candidate.billing !== "metered" || project.routing.allowMetered,
      catalogPresent:
        models.catalog === undefined ? null : catalogEntry !== undefined,
      sessionAvailable,
      roles,
      eligibleRoles: eligibleByCandidate.get(candidate.name) ?? [],
      cooldownUntil:
        typeof until === "number" && Number.isFinite(until) && until > now
          ? until
          : null,
      capacity: "unverified" as const,
      capability: "unverified" as const,
    };
  });
  const configuredIdentities = new Set(
    project.routing.candidates.map(
      (candidate) => `${candidate.provider}\u0000${candidate.model}`,
    ),
  );
  const unconfiguredAvailable = models.available.filter(
    (entry) =>
      !configuredIdentities.has(`${entry.provider}\u0000${entry.model}`),
  );
  return { observedAt: now, configured, unconfiguredAvailable, reviewCoverage };
}
