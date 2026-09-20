import { realpath } from "node:fs/promises";
import { z } from "zod";
import { readGoalDocument } from "./goal-work.js";
import { piProjectConfigSchema } from "./pi-project-config.js";
import { readPiSettingsSnapshot } from "./pi-config-proposal.js";
import { planGoalResume } from "./goal-resume-plan.js";
import { runPiGoal } from "./pi-goal-run.js";
type Context = Parameters<typeof runPiGoal>[1];
/** Resume saved opt-in only while exact settings and goal revision remain current. */
export async function resumePiGoal(context: Context, run = runPiGoal) {
  if (context.signal?.aborted || !context.isProjectTrusted()) return null;
  const root = await realpath(context.cwd);
  if (context.signal?.aborted || !context.isProjectTrusted()) return null;
  const source = readPiSettingsSnapshot(root);
  if (source === undefined) return null;
  const project = z
    .looseObject({ clanker: piProjectConfigSchema.optional() })
    .parse(JSON.parse(source) as unknown).clanker;
  const intent = project?.resumeGoal;
  if (!intent) return null;

  const goal = readGoalDocument(root, intent.id);
  const reason = planGoalResume(
    intent,
    {
      id: goal.id,
      revision: goal.revision,
      status: goal.status,
      ...(goal.contract.deadlineAt === undefined
        ? {}
        : { deadlineAt: goal.contract.deadlineAt }),
    },
    Date.now(),
  );
  if (reason !== "resume")
    return { goalId: intent.id, reason, actions: 0, last: null };
  return await run(intent.id, {
    ...context,
    cwd: root,
    isProjectTrusted: () => {
      if (context.signal?.aborted || !context.isProjectTrusted()) return false;
      try {
        const current = readGoalDocument(root, intent.id);
        return (
          readPiSettingsSnapshot(root) === source &&
          current.revision === intent.revision &&
          ["active", "completed"].includes(current.status) &&
          (current.contract.deadlineAt === undefined ||
            current.contract.deadlineAt > Date.now())
        );
      } catch {
        return false;
      }
    },
  });
}
