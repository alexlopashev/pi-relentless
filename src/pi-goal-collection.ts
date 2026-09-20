import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { CodingJournal } from "./coding-journal.js";
import { syncPiGoalWork } from "./pi-goal-progress.js";

export async function collectPiGoalProgress(
  id: string,
  context: Parameters<typeof syncPiGoalWork>[1],
): Promise<"recorded" | "not_goal_bound" | "pending" | "inactive"> {
  const trusted = (): boolean => {
    try {
      return context.isProjectTrusted();
    } catch {
      return false;
    }
  };
  const inactive = (): boolean =>
    Boolean(context.signal?.aborted) || !trusted();

  if (context.signal?.aborted || !trusted()) return "inactive";

  try {
    const root = await realpath(context.cwd);
    if (inactive()) return "inactive";

    const codingPath = join(root, ".harness/coding.sqlite");
    if (!existsSync(codingPath)) return "pending";

    let journal: CodingJournal | undefined;
    try {
      journal = new CodingJournal(codingPath, { readOnly: true });
      const snapshot = journal.read(id);
      if (!snapshot.request.goalOrigin) return "not_goal_bound";
    } finally {
      journal?.close();
    }

    await syncPiGoalWork(id, {
      ...context,
      cwd: root,
      isProjectTrusted: () => context.isProjectTrusted(),
    });
    return "recorded";
  } catch {
    try {
      if (context.signal?.aborted || !context.isProjectTrusted())
        return "inactive";
    } catch {
      return "inactive";
    }
    return "pending";
  }
}
