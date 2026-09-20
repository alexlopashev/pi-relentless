import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, expect, vi } from "vitest";
import { clankerCommand } from "../src/pi-extension.js";
test.each([undefined, "high"])(
  "evidence explanation enumerates permitted efforts with session pin %s and never dispatches",
  async (effortPin) => {
    const root = await mkdtemp(join(tmpdir(), "pi-explain-"));
    try {
      await mkdir(join(root, ".pi"));
      const candidate = (name: string, billing: string) => ({
        name,
        provider: name,
        model: name,
        billing,
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low", "high"],
      });
      await writeFile(
        join(root, ".pi/settings.json"),
        JSON.stringify({
          clanker: {
            version: 1,
            routing: {
              candidates: [
                candidate("a", "subscription"),
                candidate("b", "metered"),
              ],
              allowMetered: false,
            },
            roles: { coder: ["a", "b"] },
          },
        }),
      );
      const notify = vi.fn(),
        execute = vi.fn();
      const context = {
        cwd: root,
        isProjectTrusted: () => true,
        models: () => ({
          available: [
            { provider: "a", model: "a", efforts: ["low", "high"] },
            { provider: "b", model: "b", efforts: ["low", "high"] },
          ],
          scoped:
            effortPin === undefined
              ? []
              : [{ provider: "a", model: "a", effort: effortPin }],
        }),
        ui: { notify },
      };
      const task = {
        id: "x",
        prompt: "private task",
        minQuality: 1,
        effort: "low",
        optimization: {
          workload: "x",
          suiteHash: "a".repeat(64),
          caseIds: ["one", "two"],
          metric: "cost",
        },
      };
      await clankerCommand(
        "explain coder " + JSON.stringify(task),
        context,
        execute,
      );
      expect(notify).toHaveBeenLastCalledWith(
        expect.stringContaining('"case_samples"'),
        "info",
      );
      const message = String(notify.mock.calls.at(-1)?.[0]);
      expect(message).toContain(
        `"eligibleRoutes": ${effortPin === undefined ? "2" : "1"}`,
      );
      expect(message).toContain('"effort": "high"');
      expect(message).not.toContain("private task");
      expect(execute).not.toHaveBeenCalled();
      await clankerCommand(
        "explain coder " + JSON.stringify({ ...task, provider: "b" }),
        context,
        execute,
      );
      expect(notify).toHaveBeenLastCalledWith(
        expect.stringContaining('"eligibleRoutes": 0'),
        "info",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
