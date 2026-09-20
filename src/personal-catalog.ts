import type {
  ModelRuntime,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
export const personalProvider = "qwen-token-plan-individual";
/** Project catalog supplement; limits are conservative harness caps, not provider maxima. */
export function personalCatalog(
  runtime: Pick<ModelRuntime, "getModels">,
): ProviderConfig {
  const existing = runtime
    .getModels()
    .filter((m) => m.provider === personalProvider);
  const additions: NonNullable<ProviderConfig["models"]> = [
    {
      id: "deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 65536,
      maxTokens: 8192,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: null,
        max: "max",
      },
      compat: {
        thinkingFormat: "qwen",
        supportsDeveloperRole: false,
        supportsStore: false,
        supportsReasoningEffort: true,
      },
    },
    {
      id: "glm-5.3",
      name: "GLM-5.3",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 65536,
      maxTokens: 8192,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: null,
        high: "high",
        xhigh: null,
        max: "max",
      },
      compat: {
        thinkingFormat: "qwen",
        supportsDeveloperRole: false,
        supportsStore: false,
        supportsReasoningEffort: true,
      },
    },
  ];
  return {
    baseUrl:
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    api: "openai-completions",
    models: [
      ...existing,
      ...additions.filter((a) => !existing.some((m) => m.id === a.id)),
    ],
  };
}
export function registerPersonalCatalog(runtime: ModelRuntime): void {
  runtime.registerProvider(personalProvider, personalCatalog(runtime));
}
