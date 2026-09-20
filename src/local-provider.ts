import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Dedicated loopback provider: no ambient endpoint, auth or model discovery. */
export function localCatalog(): Parameters<
  ModelRuntime["registerProvider"]
>[1] {
  return {
    baseUrl: "http://127.0.0.1:18080/v1",
    api: "openai-completions",
    apiKey: "local-placeholder",
    authHeader: false,
    models: [
      {
        id: "qwen3.5-4b",
        name: "Local Qwen3.5 4B",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        // Pi reserves 4096 context tokens; a 4K context would clamp output to one token.
        contextWindow: 8192,
        maxTokens: 512,
        samplingParams: {
          temperature: 0,
          chat_template_kwargs: { enable_thinking: false },
        },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          supportsStrictMode: false,
          supportsUsageInStreaming: true,
          maxTokensField: "max_tokens",
        },
      },
    ],
  };
}

export function registerLocalProvider(runtime: ModelRuntime): void {
  runtime.registerProvider("relentless-local", localCatalog());
}
