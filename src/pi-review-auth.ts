import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { CodingJournal } from "./coding-journal.js";
import { CodingWorkflows } from "./coding-workflow.js";
interface Context {
  cwd: string;
  signal?: AbortSignal;
  isProjectTrusted(): boolean;
}
/** Explicit recovery only changes workflow state; normal dispatch rechecks all permissions. */
export async function piReviewAuthentication(
  id: string,
  context: Context,
  expectedDigest?: string,
) {
  const check = () => {
    if (!context.isProjectTrusted() || context.signal?.aborted)
      throw new Error("Project no longer active");
  };
  check();
  if (!id || id.length > 200) throw new Error("Invalid coding ID");
  const root = await realpath(context.cwd);
  check();
  const codingPath = join(root, ".harness/coding.sqlite"),
    workflowPath = join(root, ".harness/workflows.sqlite");
  if (!existsSync(codingPath) || !existsSync(workflowPath))
    throw new Error("Missing project journals");
  const readOnly = expectedDigest === undefined;
  const coding = new CodingJournal(codingPath, { readOnly });
  let workflows: CodingWorkflows | undefined;
  try {
    workflows = new CodingWorkflows(workflowPath, { readOnly });
    if (coding.read(id).request.sourceRoot !== root)
      throw new Error("Wrong project");
    check();
    const state =
      expectedDigest === undefined
        ? workflows.read(id)
        : workflows.retryReviewAuthentication(
            id,
            coding,
            expectedDigest,
            (action) => {
              check();
              return action();
            },
          );
    check();
    return {
      codingId: id,
      workflowDigest: workflows.storageDigest(id),
      phase: state.phase,
      reason: state.reason,
      reviewPairsUsed: state.reviewPairsUsed,
      maxReviewPairs: state.maxReviewPairs,
      credentialReadiness: "unverified",
      dispatched: false,
      reopened: expectedDigest !== undefined,
    };
  } finally {
    workflows?.close();
    coding.close();
  }
}
