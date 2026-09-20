import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import { relentlessCommand, registerRelentless } from "../src/pi-extension.js";

test("registration does not start work", () => {
  const registerCommand = vi.fn();
  registerRelentless({ registerCommand, on: vi.fn() });
  expect(registerCommand).toHaveBeenCalledTimes(1);
  expect(registerCommand.mock.calls[0]?.[0]).toBe("relentless");
});

test("commands use the active Pi project and bounded workflow resume", async () => {
  const execute = vi.fn(() =>
    Promise.resolve({ phase: "verification_required" }),
  );
  const notify = vi.fn();
  await relentlessCommand(
    "resume task-id",
    { cwd: "/project-b", isProjectTrusted: () => true, ui: { notify } },
    execute,
  );
  expect(execute).toHaveBeenCalledWith(["resume", "task-id"], "/project-b");
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining("verification_required"),
    "info",
  );
});

test("unsupported and malformed commands never execute", async () => {
  const execute = vi.fn();
  const notify = vi.fn();
  for (const args of ["", "run id", "resume id extra", "promote id", "resume"])
    await relentlessCommand(
      args,
      { cwd: "/project", isProjectTrusted: () => true, ui: { notify } },
      execute,
    );
  expect(execute).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledTimes(5);
});

test("command errors stay in Pi without exposing exception contents", async () => {
  const notify = vi.fn();
  await relentlessCommand(
    "status id",
    { cwd: "/project", isProjectTrusted: () => true, ui: { notify } },
    () => Promise.reject(new Error("private details")),
  );
  expect(notify).toHaveBeenCalledWith(
    "Relentless command failed; inspect the project journal using the CLI.",
    "error",
  );
});

test("untrusted project commands cannot read or dispatch work", async () => {
  const execute = vi.fn();
  const notify = vi.fn();
  await relentlessCommand(
    "resume id",
    { cwd: "/project", isProjectTrusted: () => false, ui: { notify } },
    execute,
  );
  expect(execute).not.toHaveBeenCalled();
});

test("Pi role preview uses project policy and session scope without dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-role-command-"));
  await mkdir(join(root, ".pi"));
  await writeFile(
    join(root, ".pi/settings.json"),
    JSON.stringify({
      relentless: {
        version: 1,
        routing: {
          candidates: [
            {
              name: "local",
              provider: "relentless-local",
              model: "qwen3.5-4b",
              billing: "local",
              enabled: true,
              quality: 1,
              preference: 1,
              efforts: ["off"],
            },
          ],
          maxConcurrency: 1,
        },
        roles: { scheduler: ["local"] },
      },
    }),
  );
  const notify = vi.fn();
  const execute = vi.fn();
  const context = {
    cwd: root,
    isProjectTrusted: () => true,
    ui: { notify },
    models: () => ({
      available: [
        { provider: "relentless-local", model: "qwen3.5-4b", efforts: ["off"] },
      ],
      scoped: [],
    }),
  };
  await relentlessCommand(
    'route scheduler {"id":"schedule","prompt":"plan retries","minQuality":1,"effort":"off"}',
    context,
    execute,
  );
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('"model": "qwen3.5-4b"'),
    "info",
  );
  expect(execute).not.toHaveBeenCalled();
  notify.mockClear();
  await relentlessCommand(
    'route scheduler {"id":"schedule","prompt":"plan retries","minQuality":1,"effort":"low"}',
    context,
    execute,
  );
  expect(notify).toHaveBeenCalledWith(
    "No permitted role route; check project policy, Pi scope, availability and evidence.",
    "error",
  );
});

test("explicit continuous verification command preserves execution path", async () => {
  const execute = vi.fn(() => Promise.resolve({ phase: "verified" }));
  await relentlessCommand(
    "run-verified task-id checks.json",
    { cwd: "/project", isProjectTrusted: () => true, ui: { notify: vi.fn() } },
    execute,
  );
  expect(execute).toHaveBeenCalledWith(
    ["run-verified", "task-id", "checks.json"],
    "/project",
  );
});
