import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { z } from "zod";
import { proposePiConfig } from "./pi-config-proposal.js";
import { join } from "node:path";
import { projectPiInventory } from "./pi-inventory.js";
import { catalogEfforts, readInventoryHealth } from "./inventory-runtime.js";

const parameters = Type.Object(
  { configuration: Type.Record(Type.String(), Type.Unknown()) },
  { additionalProperties: false },
);

const paramsSchema = z.strictObject({
  configuration: z.record(z.string(), z.unknown()),
});

type ConfigParams = z.infer<typeof paramsSchema>;

export function registerRelentlessConfigTool(
  pi: Pick<ExtensionAPI, "registerTool" | "on">,
): void {
  let generation = 0;
  let open = true;

  pi.on("session_shutdown", () => {
    generation++;
    open = false;
  });
  pi.on("session_start", () => {
    generation++;
    open = true;
  });

  pi.registerTool({
    name: "relentless_config_propose",
    label: "Propose Relentless configuration",
    description:
      "Draft a Relentless configuration proposal only. A human must explicitly use config-apply to confirm it; this tool never applies or dispatches changes.",
    promptSnippet:
      "Draft configuration only; a human must confirm with /relentless config-apply.",
    parameters,
    execute: async (_toolCallId, rawParams, signal, _onUpdate, context) => {
      const current = generation;
      const controller = new AbortController();
      const signals: AbortSignal[] = [controller.signal];
      if (signal) signals.push(signal);
      if (context.signal) signals.push(context.signal);
      const combined = AbortSignal.any(signals);
      const active = () =>
        open &&
        current === generation &&
        !combined.aborted &&
        context.isProjectTrusted();

      try {
        const params: ConfigParams = paramsSchema.parse(rawParams);
        if (!active()) throw new Error("Configuration session is not active");
        const proposal = await proposePiConfig(
          JSON.stringify(params.configuration),
          {
            cwd: context.cwd,
            signal: combined,
            isProjectTrusted: active,
          },
        );
        if (!active()) throw new Error("Configuration session is not active");
        const models = {
          available: context.modelRegistry.getAvailable().map((model) => ({
            provider: model.provider,
            model: model.id,
            efforts: catalogEfforts(model),
          })),
          scoped: context.scopedModels.map(({ model, thinkingLevel }) => ({
            provider: model.provider,
            model: model.id,
            ...(thinkingLevel === undefined ? {} : { effort: thinkingLevel }),
          })),
        };
        const health = readInventoryHealth(
          join(context.cwd, ".harness/ledger.sqlite"),
          join(context.cwd, ".harness/coding.sqlite"),
        ).health;
        const reviewCoverage = projectPiInventory(
          proposal.after,
          models,
          health,
          Date.now(),
        ).reviewCoverage;
        if (!active()) throw new Error("Configuration session is not active");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...proposal,
                reviewCoverage,
                applied: false,
                dispatched: false,
                applyCommand: `/relentless config-apply ${proposal.id}`,
              }),
            },
          ],
          details: null,
        };
      } catch {
        throw new Error("Relentless configuration proposal unavailable");
      }
    },
  });
}
