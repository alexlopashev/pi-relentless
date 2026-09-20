import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Ledger } from "../src/ledger.js";
import { readHealth } from "../src/inventory-runtime.js";
it("reads only recorded ledger cooldowns without creating a missing ledger", () => {
  const directory = mkdtempSync(join(tmpdir(), "inventory-"));
  const path = join(directory, "ledger.sqlite");
  try {
    expect(readHealth(path).source).toBe("no_ledger");
    expect(existsSync(path)).toBe(false);
    const ledger = new Ledger(path);
    ledger.transaction("test", 1000, (s) => {
      s.health["provider:meta"] = { until: 2000, failures: 1, reason: "quota" };
    });
    ledger.close();
    expect(readHealth(path)).toEqual({
      source: "ledger",
      health: {
        "provider:meta": { until: 2000, failures: 1, reason: "quota" },
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("resolves partial Pi effort maps instead of hiding default low/medium/high", async () => {
  const { catalogEfforts } = await import("../src/inventory-runtime.js");
  expect(
    catalogEfforts({
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: "low",
        xhigh: "high",
        max: "high",
      },
    }),
  ).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
  expect(catalogEfforts({ reasoning: true })).toEqual([
    "off",
    "minimal",
    "low",
    "medium",
    "high",
  ]);
  expect(catalogEfforts({ reasoning: false })).toEqual(["off"]);
});

it("combines both persisted health sources and fails closed if either is corrupt", async () => {
  const { readInventoryHealth } = await import("../src/inventory-runtime.js");
  const { CodingJournal } = await import("../src/coding-journal.js");
  const { Failure } = await import("../src/failures.js");
  const { DatabaseSync } = await import("node:sqlite");
  const root = mkdtempSync(join(tmpdir(), "combined-inventory-"));
  const ledgerPath = join(root, "ledger.sqlite");
  const codingPath = join(root, "coding.sqlite");
  try {
    expect(readInventoryHealth(ledgerPath, codingPath)).toEqual({
      source: "none",
      health: {},
    });
    const ledger = new Ledger(ledgerPath);
    ledger.transaction("test", 1000, (s) => {
      s.health["provider:meta"] = { until: 2000, failures: 1, reason: "quota" };
    });
    ledger.close();
    const coding = new CodingJournal(codingPath);
    const id = coding.create(
      {
        sourceRoot: root,
        task: { id: "a", prompt: "a", minQuality: 1, effort: "low" },
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 2,
      },
      {
        candidates: [
          {
            name: "a",
            provider: "meta",
            model: "x",
            enabled: true,
            billing: "subscription",
            quality: 1,
            preference: 1,
            efforts: ["low"],
          },
        ],
      },
      { "x.ts": "x" },
    );
    const token = coding.start(id, "a", 100, 100);
    if (!token) throw new Error("No lease");
    coding.fail(id, token, new Failure("quota", 90000), 101);
    coding.close();
    expect(readInventoryHealth(ledgerPath, codingPath)).toEqual({
      source: "ledger+coding_journal",
      health: { "provider:meta": { until: 90101 } },
    });
    expect(readInventoryHealth(join(root, "missing"), codingPath).source).toBe(
      "coding_journal",
    );
    const db = new DatabaseSync(codingPath);
    db.exec("UPDATE runs SET hash='corrupt'");
    db.close();
    expect(() => readInventoryHealth(ledgerPath, codingPath)).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
