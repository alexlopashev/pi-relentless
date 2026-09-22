import { writeFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  proposePiConfig,
  applyPiConfigProposal,
  readPiConfigProposal,
} from "../src/pi-config-proposal.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const config = {
  version: 1,
  routing: {
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
  roles: { coder: ["a"] },
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-proposal-"));
  roots.push(root);
  await mkdir(join(root, ".pi"));
  const path = join(root, ".pi/settings.json");
  const original = JSON.stringify({
    theme: "dark",
    privateSetting: "do-not-copy",
    relentless: config,
  });
  await writeFile(path, original);
  const confirm = vi.fn<(title: string, body: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  );
  const context = { cwd: root, isProjectTrusted: () => true, ui: { confirm } };
  const next = {
    ...config,
    routing: { ...config.routing, allowMetered: true },
  };
  return { root, path, original, confirm, context, next };
}
test("managed runtime opt-in confirmation describes startup without granting inference", async () => {
  const f = await fixture();
  const next = {
    ...f.next,
    routing: {
      ...f.next.routing,
      managedLocal: {
        executable: { path: "/runtime/server", sha256: "a".repeat(64) },
        model: { path: "/model.gguf", sha256: "b".repeat(64) },
        libraries: {},
        startupMs: 1000,
      },
    },
  };
  const proposal = await proposePiConfig(JSON.stringify(next), f.context);
  await applyPiConfigProposal(proposal.id, f.context);
  expect(f.confirm.mock.calls[0]?.[1]).toContain(
    "separately authorized local dispatches",
  );
  expect(f.confirm.mock.calls[0]?.[1]).toContain("does not start now");
});
test("proposal is durable and only confirmed exact namespace changes apply", async () => {
  const f = await fixture();
  const p = await proposePiConfig(JSON.stringify(f.next), f.context);
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(f.confirm).not.toHaveBeenCalled();
  const result = await applyPiConfigProposal(p.id, f.context);
  expect(result.status).toBe("applied");
  expect(f.confirm).toHaveBeenCalledTimes(1);
  expect(f.confirm.mock.calls[0]?.[1]).toContain('"allowMetered": true');
  expect(f.confirm.mock.calls[0]?.[1]).not.toContain("do-not-copy");
  expect(JSON.parse(await readFile(f.path, "utf8"))).toMatchObject({
    theme: "dark",
    privateSetting: "do-not-copy",
    relentless: { routing: { allowMetered: true } },
  });
  expect((await applyPiConfigProposal(p.id, f.context)).status).toBe(
    "already_matches",
  );
  expect(f.confirm).toHaveBeenCalledTimes(1);
});
test("denial and missing interactive approval never change settings", async () => {
  const f = await fixture();
  const p = await proposePiConfig(JSON.stringify(f.next), f.context);
  f.confirm.mockResolvedValue(false);
  expect((await applyPiConfigProposal(p.id, f.context)).status).toBe(
    "declined",
  );
  await expect(
    applyPiConfigProposal(p.id, { ...f.context, ui: {} }),
  ).rejects.toThrow();
  expect(await readFile(f.path, "utf8")).toBe(f.original);
});
test("settings changes before or during confirmation invalidate the proposal", async () => {
  const f = await fixture();
  const p = await proposePiConfig(JSON.stringify(f.next), f.context);
  f.confirm.mockImplementation(async () => {
    await writeFile(f.path, f.original + " ");
    return true;
  });
  await expect(applyPiConfigProposal(p.id, f.context)).rejects.toThrow();
  expect(await readFile(f.path, "utf8")).toBe(f.original + " ");
  f.confirm.mockClear();
  await expect(applyPiConfigProposal(p.id, f.context)).rejects.toThrow();
  expect(f.confirm).not.toHaveBeenCalled();
});
test("session cancellation and trust loss revoke a pending approval", async () => {
  for (const mode of ["cancel", "trust"]) {
    const f = await fixture();
    const controller = new AbortController();
    let trusted = true;
    const context = {
      ...f.context,
      signal: controller.signal,
      isProjectTrusted: () => trusted,
    };
    const p = await proposePiConfig(JSON.stringify(f.next), context);
    f.confirm.mockImplementation(() => {
      if (mode === "cancel") controller.abort();
      else trusted = false;
      return Promise.resolve(true);
    });
    await expect(applyPiConfigProposal(p.id, context)).rejects.toThrow();
    expect(await readFile(f.path, "utf8")).toBe(f.original);
  }
});
test("tampered proposals and other project identities fail before approval", async () => {
  const f = await fixture();
  const p = await proposePiConfig(JSON.stringify(f.next), f.context);
  const path = join(f.root, ".harness/config-proposals", p.id + ".json");
  const raw = structuredClone(p);
  raw.after.routing.allowMetered = false;
  await writeFile(path, JSON.stringify(raw));
  await expect(applyPiConfigProposal(p.id, f.context)).rejects.toThrow();
  expect(f.confirm).not.toHaveBeenCalled();
  const g = await fixture();
  await mkdir(join(g.root, ".harness/config-proposals"), { recursive: true });
  await writeFile(
    join(g.root, ".harness/config-proposals", p.id + ".json"),
    JSON.stringify(p),
  );
  await expect(applyPiConfigProposal(p.id, g.context)).rejects.toThrow();
  expect(g.confirm).not.toHaveBeenCalled();
});
test("existing Pi settings lock rejects publication without deleting its owner", async () => {
  const f = await fixture();
  const p = await proposePiConfig(JSON.stringify(f.next), f.context);
  f.confirm.mockImplementation(async () => {
    await mkdir(f.path + ".lock");
    return true;
  });
  await expect(applyPiConfigProposal(p.id, f.context)).rejects.toThrow();
  expect(await readdir(f.path + ".lock")).toEqual([]);
  expect(await readFile(f.path, "utf8")).toBe(f.original);
});
test("redirected settings and proposal directories are rejected", async () => {
  const f = await fixture();
  await rm(f.path);
  await writeFile(join(f.root, "target"), f.original);
  await symlink(join(f.root, "target"), f.path);
  await expect(
    proposePiConfig(JSON.stringify(f.next), f.context),
  ).rejects.toThrow();
  await rm(f.path);
  await writeFile(f.path, f.original);
  await mkdir(join(f.root, ".harness"));
  await symlink(join(f.root, ".pi"), join(f.root, ".harness/config-proposals"));
  await expect(
    proposePiConfig(JSON.stringify(f.next), f.context),
  ).rejects.toThrow();
});

test("Pi command exposes review and uses confirmation rather than an approved argument", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const f = await fixture();
  const notify = vi.fn();
  const context = { ...f.context, ui: { notify, confirm: f.confirm } };
  await relentlessCommand("config-propose " + JSON.stringify(f.next), context);
  const message: unknown = notify.mock.calls[0]?.[0];
  if (typeof message !== "string") throw Error("Missing proposal result");
  const parsed: unknown = JSON.parse(message);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    typeof parsed.id !== "string"
  )
    throw Error("Missing proposal ID");
  await relentlessCommand("config-apply " + parsed.id, context);
  expect(f.confirm).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenLastCalledWith(
    expect.stringContaining("applied"),
    "info",
  );
});

test("a replaced or expired settings lock cannot publish the reviewed change", async () => {
  for (const mode of ["replaced", "expired"]) {
    const f = await fixture();
    const p = await proposePiConfig(JSON.stringify(f.next), f.context);
    const fs = await import("node:fs");
    let reviewed = false,
      checks = 0;
    const now = Date.now;
    f.confirm.mockImplementation(() => {
      reviewed = true;
      return Promise.resolve(true);
    });
    const context = {
      ...f.context,
      isProjectTrusted: () => {
        if (reviewed && ++checks === 3) {
          if (mode === "replaced") {
            fs.renameSync(f.path + ".lock", f.path + ".old-lock");
            fs.mkdirSync(f.path + ".lock");
          } else vi.spyOn(Date, "now").mockImplementation(() => now() + 11000);
        }
        return true;
      },
    };
    try {
      await expect(applyPiConfigProposal(p.id, context)).rejects.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
    expect(await readFile(f.path, "utf8")).toBe(f.original);
    if (mode === "replaced")
      expect(await readdir(f.path + ".lock")).toEqual([]);
  }
});

test("resume opt-in confirmation explicitly authorizes future session execution", async () => {
  const f = await fixture();
  const proposal = await proposePiConfig(
    JSON.stringify({ ...config, resumeGoal: { id: "goal", revision: 2 } }),
    f.context,
  );
  await applyPiConfigProposal(proposal.id, f.context);
  expect(f.confirm.mock.calls[0]?.[1]).toContain(
    "future trusted Pi session starts",
  );
  expect(f.confirm.mock.calls[0]?.[1]).toContain(
    "existing attempt, billing, verification and source-integration permissions",
  );
});
test("proposed routing evidence can be explained without approval or settings mutation", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const f = await fixture();
  const next = {
    ...f.next,
    routing: {
      ...f.next.routing,
      candidates: f.next.routing.candidates.map((c) => ({
        ...c,
        efforts: ["low", "high"],
      })),
    },
  };
  const proposal = await proposePiConfig(JSON.stringify(next), f.context);
  const notify = vi.fn(),
    execute = vi.fn();
  const context = {
    ...f.context,
    models: () => ({
      available: [{ provider: "a", model: "a", efforts: ["low", "high"] }],
      scoped: [],
    }),
    ui: { ...f.context.ui, notify },
  };
  const task = {
    id: "preview",
    prompt: "private task",
    minQuality: 1,
    effort: "low",
    optimization: {
      workload: "fixture",
      suiteHash: "a".repeat(64),
      caseIds: ["x", "y"],
      metric: "activeTime",
    },
  };
  const command = `explain-proposal ${proposal.id} coder ${JSON.stringify(task)}`;
  await relentlessCommand(command, context, execute);
  expect(notify).toHaveBeenLastCalledWith(
    expect.stringContaining('"proposed": true'),
    "info",
  );
  expect(String(notify.mock.calls.at(-1)?.[0])).toContain(
    '"eligibleRoutes": 2',
  );
  expect(String(notify.mock.calls.at(-1)?.[0])).toContain(proposal.id);
  expect(String(notify.mock.calls.at(-1)?.[0])).not.toContain("private task");
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(execute).not.toHaveBeenCalled();
  expect(f.confirm).not.toHaveBeenCalled();
  await relentlessCommand(
    command,
    {
      ...context,
      models: () => {
        writeFileSync(f.path, f.original + " ");
        return context.models();
      },
    },
    execute,
  );
  expect(notify.mock.calls.at(-1)?.[1]).toBe("error");
  await relentlessCommand(command, context, execute);
  expect(notify.mock.calls.at(-1)?.[1]).toBe("error");
  expect(execute).not.toHaveBeenCalled();
  expect(f.confirm).not.toHaveBeenCalled();
});

test("proposal inspection is read-only and rejects foreign roots and untrusted callers", async () => {
  const a = await fixture(),
    b = await fixture();
  const proposal = await proposePiConfig(JSON.stringify(a.next), a.context);
  expect(await readPiConfigProposal(proposal.id, a.context)).toEqual(proposal);
  const directory = join(b.root, ".harness/config-proposals");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, proposal.id + ".json"),
    JSON.stringify(proposal),
  );
  await expect(readPiConfigProposal(proposal.id, b.context)).rejects.toThrow(
    "project mismatch",
  );
  await expect(
    readPiConfigProposal(proposal.id, {
      ...a.context,
      isProjectTrusted: () => false,
    }),
  ).rejects.toThrow();
  await expect(readPiConfigProposal("../outside", a.context)).rejects.toThrow(
    "Invalid proposal ID",
  );
  expect(await readFile(a.path, "utf8")).toBe(a.original);
  expect(await readFile(b.path, "utf8")).toBe(b.original);
  expect(a.confirm).not.toHaveBeenCalled();
  expect(b.confirm).not.toHaveBeenCalled();
});
