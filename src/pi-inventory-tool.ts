import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { z } from "zod";
import { relentlessCommand } from "./pi-extension.js";
import { catalogEfforts } from "./inventory-runtime.js";

const parameters = Type.Object(
  {
    offset: Type.Optional(
      Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    ),
  },
  { additionalProperties: false },
);

const paramsSchema = z.strictObject({
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

type InventoryParams = z.infer<typeof paramsSchema>;

export function registerRelentlessInventory(
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
    name: "relentless_inventory",
    label: "Relentless inventory",
    description:
      "Discovery only: list native session models; not quota, capability, billing, or permission.",
    promptSnippet: "Discovery only, not quota/capability/billing/permission.",
    parameters,
    execute: async (_toolCallId, rawParams, signal, _onUpdate, context) => {
      const params: InventoryParams = paramsSchema.parse(rawParams);
      const current = generation;
      const signals: AbortSignal[] = [];
      if (signal) signals.push(signal);
      if (context.signal) signals.push(context.signal);
      const combined = AbortSignal.any(signals);
      const active = () =>
        open &&
        current === generation &&
        !combined.aborted &&
        context.isProjectTrusted();
      if (!active()) throw new Error("Inventory session is not active");

      const captured: string[] = [];
      try {
        await relentlessCommand(
          `inventory${params.offset === undefined ? "" : ` ${String(params.offset)}`}`,
          {
            cwd: context.cwd,
            signal: combined,
            isProjectTrusted: active,
            ui: {
              notify: (message, type) => {
                if (!active()) return;
                if (type === "error") throw new Error("Inventory unavailable");
                captured.push(message);
              },
            },
            models: () => ({
              catalog: context.modelRegistry.getAll().map((model) => ({
                provider: model.provider,
                model: model.id,
                efforts: catalogEfforts(model),
              })),
              available: context.modelRegistry.getAvailable().map((model) => ({
                provider: model.provider,
                model: model.id,
                efforts: catalogEfforts(model),
              })),
              scoped: context.scopedModels.map(({ model, thinkingLevel }) => ({
                provider: model.provider,
                model: model.id,
                ...(thinkingLevel === undefined
                  ? {}
                  : { effort: thinkingLevel }),
              })),
            }),
          },
        );
      } catch {
        throw new Error("Relentless inventory unavailable");
      }
      if (!active() || captured.length === 0)
        throw new Error("Relentless inventory unavailable");
      return {
        content: [{ type: "text", text: captured.join("\n") }],
        details: null,
      };
    },
  });
}
