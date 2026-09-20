import type {
  ModelRuntime,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
export const metaProvider = "meta";
/** Direct Meta API. Limits are conservative harness caps, not provider maxima. */
export function metaCatalog(): ProviderConfig {
  return {
    name: "Meta Model API",
    baseUrl: "https://api.meta.ai/v1",
    api: "openai-responses",
    models: [
      {
        id: "muse-spark-1.3-contributor",
        name: "Muse Spark 1.3 Contributor",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
        contextWindow: 65536,
        maxTokens: 8192,
        thinkingLevelMap: {
          off: null,
          minimal: "minimal",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: null,
        },
      },
    ],
  };
}
export function registerMetaProvider(runtime: ModelRuntime): void {
  runtime.registerProvider(metaProvider, metaCatalog());
}
