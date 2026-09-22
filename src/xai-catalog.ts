import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
/** Compatibility for worker SDKs predating Grok 4.7; never replace an upstream entry. */
export function registerXaiCatalog(runtime: ModelRuntime): void {
  const existing = runtime
    .getModels()
    .filter((model) => model.provider === "xai");
  if (existing.some((model) => model.id === "grok-4.7")) return;
  const base = existing.find((model) => model.id === "grok-4.6");
  if (!base) return;
  runtime.registerProvider("xai", {
    baseUrl: base.baseUrl,
    api: base.api,
    models: [
      ...existing,
      {
        ...base,
        id: "grok-4.7",
        name: "Grok 4.7",
        contextWindow: 500000,
        maxTokens: 8192,
        cost: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
        thinkingLevelMap: {
          off: null,
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: null,
        },
      },
    ],
  });
}
