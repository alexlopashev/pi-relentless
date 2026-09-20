import type { CodingSnapshot } from "./coding-journal.js";
import type { WorkflowState } from "./coding-workflow.js";
import { createHash } from "node:crypto";

export type TrialStatus =
  | "cancelled"
  | "ambiguous"
  | "running"
  | "creation_incomplete"
  | "inconsistent"
  | "verified_unadmitted"
  | "blocked"
  | "exhausted"
  | "waiting"
  | "coding"
  | "review"
  | "repair"
  | "verification_required";

export function classifyCalibrationTrial(
  snapshot: CodingSnapshot,
  workflow: WorkflowState | null,
  now: number,
): { status: TrialStatus; terminal: boolean } {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError("now must be a non-negative safe integer");
  }

  if (snapshot.status === "cancelled")
    return { status: "cancelled", terminal: true };
  if (snapshot.status === "ambiguous")
    return { status: "ambiguous", terminal: false };
  if (
    snapshot.status === "running" &&
    (!snapshot.lease || snapshot.lease.until <= now)
  )
    return { status: "ambiguous", terminal: false };
  if (snapshot.status === "running")
    return { status: "running", terminal: false };
  if (workflow === null)
    return { status: "creation_incomplete", terminal: false };

  const checkpoint = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  if (workflow.phase === "verified") {
    if (
      workflow.reviewedCheckpointSha256 !== checkpoint ||
      workflow.verification?.accepted !== true ||
      workflow.verification.checkpointSha256 !== checkpoint
    )
      return { status: "inconsistent", terminal: false };
    return { status: "verified_unadmitted", terminal: true };
  }

  if (
    workflow.expectedRevision !== snapshot.revision &&
    !(
      workflow.phase === "repair" &&
      snapshot.revision === workflow.expectedRevision + 1
    )
  )
    return { status: "inconsistent", terminal: false };

  if (workflow.reason === "ambiguous_review")
    return { status: "ambiguous", terminal: false };
  if (workflow.phase === "blocked" || snapshot.status === "blocked") {
    return { status: "blocked", terminal: true };
  }
  if (snapshot.status === "exhausted") {
    return { status: "exhausted", terminal: true };
  }
  if (workflow.phase === "reviewing")
    return { status: "ambiguous", terminal: false };
  if (
    snapshot.status === "waiting_retry" ||
    (workflow.retryAt !== null && workflow.retryAt > now)
  ) {
    return { status: "waiting", terminal: false };
  }

  switch (workflow.phase) {
    case "coding":
      return { status: "coding", terminal: false };
    case "review":
      return { status: "review", terminal: false };
    case "repair":
      return { status: "repair", terminal: false };
    case "verification_required":
      return { status: "verification_required", terminal: false };
    default: {
      const unreachable: never = workflow.phase;
      return unreachable;
    }
  }
}
