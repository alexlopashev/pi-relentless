import { expect, it } from "vitest";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { registerXaiCatalog } from "../src/xai-catalog.js";
import { catalogEfforts } from "../src/inventory-runtime.js";
it("adds Grok 4.7 to older workers without replacing existing model pins or other providers", async () => {
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
      modify: () => Promise.reject(Error("no writes")),
      delete: () => Promise.reject(Error("no writes")),
    },
  });
  const old = runtime.getModel("xai", "grok-4.6");
  const other = runtime.getModel("openai-codex", "gpt-6-astra");
  const oauth = runtime.getProvider("xai")?.auth.oauth;
  expect(oauth).toBeDefined();
  registerXaiCatalog(runtime);
  expect(runtime.getProvider("xai")?.auth.oauth).toMatchObject({
    ...oauth,
    toAuth: expect.any(Function) as unknown,
  });
  const added = runtime.getModel("xai", "grok-4.7");
  expect(added).toBeDefined();
  expect(added?.api).toBe(old?.api);
  expect(added?.baseUrl).toBe(old?.baseUrl);
  expect(catalogEfforts(added ?? { reasoning: false })).toEqual([
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  expect(runtime.getModel("xai", "grok-4.6")).toEqual(old);
  expect(runtime.getModel("openai-codex", "gpt-6-astra")).toEqual(other);
  registerXaiCatalog(runtime);
  expect(
    runtime
      .getModels()
      .filter((m) => m.provider === "xai" && m.id === "grok-4.7"),
  ).toHaveLength(1);
  expect(runtime.getModel("xai", "grok-4.7")).toEqual(added);
});
