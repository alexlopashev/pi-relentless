import { expect, it } from "vitest";
import { configSchema, route } from "../src/router.js";
const local = {
  name: "local",
  provider: "relentless-local",
  model: "qwen3.5-4b",
  billing: "local",
  enabled: true,
  quality: 1,
  preference: 10,
  efforts: ["off"],
};
it("routes local work without cloud spending and preserves effort floors", () => {
  const config = configSchema.parse({ candidates: [local], maxConcurrency: 1 });
  const task = {
    id: "x",
    prompt: "Classify",
    minQuality: 1,
    effort: "off",
  } as const;
  expect(route(task, config.candidates, false).candidate.billing).toBe("local");
  expect(() =>
    route({ ...task, effort: "low" }, config.candidates, false),
  ).toThrow();
});
it("rejects mislabeled cloud access and unsupported local concurrency or models", () => {
  for (const candidates of [
    [{ ...local, provider: "xai" }],
    [{ ...local, billing: "subscription" }],
    [{ ...local, model: "other" }],
    [{ ...local, efforts: ["high"] }],
  ]) {
    expect(
      configSchema.safeParse({ candidates, maxConcurrency: 1 }).success,
    ).toBe(false);
  }
  expect(
    configSchema.safeParse({ candidates: [local], maxConcurrency: 2 }).success,
  ).toBe(false);
});

it("registers a fixed loopback endpoint with bounded context and output", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { registerLocalProvider } = await import("../src/local-provider.js");
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
  });
  registerLocalProvider(runtime);
  const model = runtime.getModel("relentless-local", "qwen3.5-4b");
  expect(model).toMatchObject({
    baseUrl: "http://127.0.0.1:18080/v1",
    contextWindow: 8192,
    maxTokens: 512,
    reasoning: false,
  });
});

it("Pi preserves the output budget after its context safety reserve", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { registerLocalProvider } = await import("../src/local-provider.js");
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
      modify: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(),
    },
  });
  registerLocalProvider(runtime);
  const model = runtime.getModel("relentless-local", "qwen3.5-4b");
  if (!model) throw new Error("Missing model");
  let body = "";
  await runtime.completeSimple(
    model,
    { messages: [{ role: "user", content: "Reply hello", timestamp: 0 }] },
    {
      fetch: (_url, init) => {
        if (typeof init?.body !== "string")
          throw new Error("Expected JSON request body");
        body = init.body;
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );
      },
    },
  );
  expect(JSON.parse(body) as unknown).toMatchObject({
    max_tokens: 512,
    model: "qwen3.5-4b",
  });
});
