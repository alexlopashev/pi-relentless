import { z } from "zod";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { contractSchema } from "./goal-types.js";
import { Ledger } from "./ledger.js";
import { loadPiProjectConfig } from "./pi-project-config.js";

export async function createPiGoal(
  text: string,
  context: { cwd: string; signal?: AbortSignal; isProjectTrusted(): boolean },
): Promise<{ goalId: string; revision: number }> {
  const check = (): void => {
    if (context.signal?.aborted) throw new Error("Operation aborted");
    if (!context.isProjectTrusted()) throw new Error("Untrusted project");
  };

  check();
  const parsed = JSON.parse(text) as unknown;
  const input = z
    .strictObject(contractSchema.shape)
    .omit({ config: true })
    .parse(parsed);

  const root = await realpath(context.cwd);
  check();
  const project = await loadPiProjectConfig(root, true);
  check();
  if (!project) throw new Error("Missing project policy");

  const contract = contractSchema.parse({ ...input, config: project.routing });
  check();
  const ledger = new Ledger(join(root, ".harness/ledger.sqlite"));
  try {
    check();
    const goalId = ledger.create(contract);
    return { goalId, revision: 1 };
  } finally {
    ledger.close();
  }
}
