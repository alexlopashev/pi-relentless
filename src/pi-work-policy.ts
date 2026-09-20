import { piRoleCandidates } from "./pi-role-routing.js";
import type { PiProjectConfig } from "./pi-project-config.js";
import type { CatalogEntry } from "./model-inventory.js";
import { configSchema, route, type Config, type Task } from "./router.js";

export function piWorkPolicy(
  project: PiProjectConfig,
  available: readonly CatalogEntry[],
  scoped: readonly { provider: string; model: string; effort?: string }[],
  task: Task,
  reviewTask: Task,
): { coding: Config; review: Config } {
  const codingCandidates = piRoleCandidates(
    project,
    "coder",
    available,
    scoped,
    {},
    Date.now(),
  );
  const coding = configSchema.parse({
    ...project.routing,
    candidates: codingCandidates.filter((candidate) => {
      try {
        route(
          task,
          [candidate],
          project.routing.allowMetered,
          project.routing.observations,
        );
        return true;
      } catch {
        return false;
      }
    }),
  });

  route(task, coding.candidates, coding.allowMetered, coding.observations);

  const coderProviders = new Set(
    coding.candidates.map((candidate) => candidate.provider),
  );
  const reviewCandidates = piRoleCandidates(
    project,
    "reviewer",
    available,
    scoped,
    {},
    Date.now(),
  );
  const review = configSchema.parse({
    ...project.routing,
    candidates: reviewCandidates,
  });

  for (const author of coderProviders) {
    const independent = review.candidates.filter((c) => c.provider !== author);
    const firstReview = route(
      reviewTask,
      independent,
      review.allowMetered,
      review.observations,
    );
    route(
      reviewTask,
      independent.filter(
        (candidate) => candidate.provider !== firstReview.candidate.provider,
      ),
      review.allowMetered,
      review.observations,
    );
  }
  return { coding, review };
}
