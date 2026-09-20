import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { CodingWorkflows } from "../src/coding-workflow.js";
import { piCreationIntentSchema } from "../src/pi-creation-intent.js";
import { attachPiCreation } from "../src/pi-creation-recovery.js";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-intent-"));
  const coding = new CodingJournal(join(root, "coding.sqlite"));
  const workflows = new CodingWorkflows(join(root, "workflows.sqlite"));
  const task = { id: "task", prompt: "fix", minQuality: 1, effort: "low" };
  const config = {
    candidates: [
      {
        name: "author",
        provider: "author",
        model: "one",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  };
  const id = coding.create(
    {
      sourceRoot: root,
      task,
      files: [{ path: "x.ts", writable: true }],
      maxAttempts: 2,
    },
    config,
    { "x.ts": "export const x=1;" },
  );
  const saved = {
    id,
    checkpointSha256: digest(coding.read(id)),
    intent: piCreationIntentSchema.parse({
      key: "task",
      inputSha256: "a".repeat(64),
      root,
      review: { task, config },
      maxReviewPairs: 2,
    }),
  };
  return {
    coding,
    workflows,
    saved,
    close: () => {
      coding.close();
      workflows.close();
    },
  };
}
test("attachment is idempotent and rejects a conflicting persisted review contract", () => {
  const f = fixture();
  try {
    const state = attachPiCreation(f.saved, f.coding, f.workflows);
    expect(state.phase).toBe("coding");
    expect(attachPiCreation(f.saved, f.coding, f.workflows)).toEqual(state);
    expect(() =>
      attachPiCreation(
        { ...f.saved, intent: { ...f.saved.intent, maxReviewPairs: 1 } },
        f.coding,
        f.workflows,
      ),
    ).toThrow();
  } finally {
    f.close();
  }
});
test("missing workflow is never attached to modified, cancelled or wrong-root source state", () => {
  for (const mode of ["cancel", "hash", "root"]) {
    const f = fixture();
    try {
      if (mode === "cancel") f.coding.cancel(f.saved.id);
      if (mode === "hash") f.saved.checkpointSha256 = "b".repeat(64);
      if (mode === "root") f.saved.intent.root = "/elsewhere";
      expect(() => attachPiCreation(f.saved, f.coding, f.workflows)).toThrow();
      expect(() => f.workflows.read(f.saved.id)).toThrow();
    } finally {
      f.close();
    }
  }
});

test("repeating creation preserves an already progressed workflow and consumed attempts", async () => {
  const f = fixture();
  try {
    attachPiCreation(f.saved, f.coding, f.workflows);
    const state = await f.workflows.resume(f.saved.id, f.coding, () =>
      Promise.resolve(
        JSON.stringify({
          edits: [{ path: "x.ts", content: "export const x=2;" }],
        }),
      ),
    );
    expect(state.phase).not.toBe("coding");
    const attempts = f.coding.read(f.saved.id).attempts;
    expect(attempts).toBeGreaterThan(0);
    expect(attachPiCreation(f.saved, f.coding, f.workflows)).toEqual(state);
    expect(f.coding.read(f.saved.id).attempts).toBe(attempts);
  } finally {
    f.close();
  }
});

test("an old coding task without an intent cannot be silently duplicated by Pi creation", () => {
  const f = fixture();
  try {
    expect(() =>
      f.coding.findPiCreation("task", "a".repeat(64), f.saved.intent.root),
    ).toThrow();
  } finally {
    f.close();
  }
});
