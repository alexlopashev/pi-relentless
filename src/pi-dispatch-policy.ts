import { Failure } from "./failures.js";
import { loadPiProjectConfig } from "./pi-project-config.js";
import { piRoleCandidates } from "./pi-role-routing.js";
import type { Route, Config } from "./router.js";
import { canonicalDigest } from "./verification-assessment.js";
import type { CatalogEntry } from "./model-inventory.js";
export interface PiDispatchContext {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
  models?(): {
    available: readonly CatalogEntry[];
    scoped: readonly { provider: string; model: string; effort?: string }[];
  };
}
export async function assertPiDispatch(
  context: PiDispatchContext,
  role: "coder" | "reviewer",
  selection: Route,
  dispatchConfig?: Config,
): Promise<void> {
  const check = () => {
    if (
      context.signal?.aborted ||
      !context.isProjectTrusted() ||
      !context.models
    )
      throw new Failure("permission");
  };
  check();
  const project = await loadPiProjectConfig(context.cwd, true);
  check();
  if (!project || !context.models) throw new Failure("permission");
  if (
    selection.candidate.billing === "local" &&
    canonicalDigest(project.routing.managedLocal ?? null) !==
      canonicalDigest(dispatchConfig?.managedLocal ?? null)
  )
    throw new Failure("permission");
  const models = context.models();
  const eligible = piRoleCandidates(
    project,
    role,
    models.available,
    models.scoped,
    {},
    Date.now(),
  );
  check();
  if (
    !eligible.some(
      (candidate) =>
        candidate.name === selection.candidate.name &&
        candidate.provider === selection.candidate.provider &&
        candidate.model === selection.candidate.model &&
        candidate.billing === selection.candidate.billing &&
        candidate.quality >= selection.candidate.quality &&
        candidate.efforts.includes(selection.effort),
    )
  )
    throw new Failure("permission");
}
