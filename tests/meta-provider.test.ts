import { expect, it, vi } from "vitest";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { registerMetaProvider } from "../src/meta-provider.js";
import { verifyAccess } from "../src/pi-worker.js";
it("registers direct Meta Contributor with isolated saved-key auth and exact reasoning levels", async () => {
  const reads: string[] = [];
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: (provider) => {
        reads.push(provider);
        return Promise.resolve(
          provider === "meta"
            ? { type: "api_key", key: "fixture-not-a-key" }
            : undefined,
        );
      },
      list: () => Promise.resolve([]),
      modify: () => Promise.reject(new Error("immutable")),
      delete: () => Promise.reject(new Error("immutable")),
    },
  });
  const other = runtime.getModel(
    "openrouter",
    "meta/muse-spark-1.3-contributor",
  );
  registerMetaProvider(runtime);
  expect(runtime.getModel("meta", "muse-spark-1.3-contributor")).toMatchObject({
    baseUrl: "https://api.meta.ai/v1",
    api: "openai-responses",
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      high: "high",
      xhigh: "xhigh",
      max: null,
    },
  });
  const auth = runtime.getProvider("meta")?.auth.apiKey;
  if (!auth?.login) throw new Error("Missing Meta login");
  const credential = await auth.login({
    signal: new AbortController().signal,
    prompt: (prompt) => {
      expect(prompt.type).toBe("secret");
      return Promise.resolve("fixture-not-a-key");
    },
    notify: vi.fn(),
  });
  expect(credential.type).toBe("api_key");
  await expect(runtime.checkAuth("meta")).resolves.toMatchObject({
    type: "api_key",
  });
  expect(reads).toContain("meta");
  expect(
    runtime.getModel("openrouter", "meta/muse-spark-1.3-contributor"),
  ).toEqual(other);
  registerMetaProvider(runtime);
  expect(runtime.getModels().filter((m) => m.provider === "meta")).toHaveLength(
    1,
  );
  expect(() => {
    verifyAccess("meta", "subscription", "api_key", false);
  }).toThrow("subscription");
  expect(() => {
    verifyAccess("meta", "metered", "api_key", false);
  }).toThrow("Metered");
});
