import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CodingJournal } from "../src/coding-journal.js";
import { Failure } from "../src/failures.js";

test.each([1, 2])(
  "expired dispatch stays ambiguous with maxAttempts=%s",
  (maxAttempts) => {
    const root = mkdtempSync(join(tmpdir(), "coding-ambiguous-"));
    const path = join(root, "coding.sqlite");
    const journal = new CodingJournal(path);
    const id = journal.create(
      {
        sourceRoot: root,
        task: { id: "x", prompt: "x", minQuality: 1, effort: "low" },
        files: [{ path: "x.ts", writable: true }],
        maxAttempts,
      },
      {
        candidates: [
          {
            name: "a",
            provider: "a",
            model: "a",
            billing: "subscription",
            enabled: true,
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      },
      { "x.ts": "export {};" },
    );
    const token = journal.start(id, "original", 100, 10);
    if (!token) throw Error("Missing token");
    expect(journal.start(id, "other", 109, 10)).toBeNull();
    expect(journal.read(id).status).toBe("running");
    journal.close();
    const recovered = new CodingJournal(path);
    try {
      expect(recovered.start(id, "replacement", 110, 10)).toBeNull();
      const state = recovered.read(id);
      expect(state.status).toBe("ambiguous");
      expect(state.attempts).toBe(1);
      expect(state.epoch).toBe(1);
      expect(state.lease).toBeNull();
      expect(state.dispatches).toHaveLength(1);
      expect(recovered.start(id, "again", 1000, 10)).toBeNull();
      expect(recovered.read(id)).toEqual(state);
      expect(
        recovered.finish(
          id,
          token,
          { "x.ts": "late" },
          "ready_for_review",
          1001,
        ),
      ).toBe(false);
      expect(recovered.fail(id, token, new Failure("outage"), 1001)).toBe(
        false,
      );
      expect(recovered.read(id).status).toBe("ambiguous");
      expect(recovered.fail(id, token, new Failure("policy"), 1002)).toBe(true);
      expect(recovered.read(id).status).toBe("blocked");
      expect(recovered.read(id).failures[0]?.kind).toBe("policy");
    } finally {
      recovered.close();
    }
  },
);
