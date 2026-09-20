import { createHash } from "node:crypto";
import type { CodingJournal } from "./coding-journal.js";
import type { CodingWorkflows, WorkflowState } from "./coding-workflow.js";
import type { SavedPiCreation } from "./pi-creation-intent.js";

const hashSnapshot = (snapshot: unknown): string =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

export function attachPiCreation(
  saved: SavedPiCreation,
  coding: CodingJournal,
  workflows: CodingWorkflows,
): WorkflowState {
  const snapshot = coding.read(saved.id);
  const currentHash = hashSnapshot(snapshot);
  return coding.withCheckpoint(saved.id, currentHash, () => {
    if (snapshot.request.sourceRoot !== saved.intent.root)
      throw new Error("Source root mismatch");
    if (workflows.has(saved.id)) {
      const state = workflows.read(saved.id);
      if (
        JSON.stringify(state.review) !== JSON.stringify(saved.intent.review) ||
        state.maxReviewPairs !== saved.intent.maxReviewPairs
      )
        throw new Error("Workflow contract mismatch");
      return state;
    }
    if (currentHash !== saved.checkpointSha256)
      throw new Error("Checkpoint mismatch");
    if (
      snapshot.revision !== 1 ||
      snapshot.attempts !== 0 ||
      snapshot.status !== "ready"
    )
      throw new Error("Invalid coding state");
    workflows.create(
      saved.id,
      coding,
      saved.intent.review,
      saved.intent.maxReviewPairs,
    );
    return workflows.read(saved.id);
  });
}
