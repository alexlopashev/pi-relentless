import { expect, it } from "vitest";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  registerPersonalCatalog,
  personalProvider,
} from "../src/personal-catalog.js";
it("adds current Personal models while preserving older pins, subscription auth and other providers", async () => {
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: () => Promise.resolve({ type: "api_key", key: "test-only" }),
      list: () => Promise.resolve([]),
      modify: () => Promise.reject(new Error("no writes")),
      delete: () => Promise.reject(new Error("no writes")),
    },
  });
  const other = runtime.getModel("xai", "grok-4.6");
  registerPersonalCatalog(runtime);
  for (const id of [
    "qwen3.8-max",
    "qwen3.8-flash",
    "qwen3.6-flash",
    "deepseek-v4.1-flash",
    "glm-5.3",
    "glm-5.2",
  ]) {
    expect(runtime.getModel(personalProvider, id)?.baseUrl).toBe(
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
  }
  expect(runtime.getModel("xai", "grok-4.6")).toEqual(other);
  expect(runtime.getModel(personalProvider, "kimi-k2.7-code")).toBeUndefined();
  expect(
    runtime.getModel(personalProvider, "glm-5.3")?.thinkingLevelMap,
  ).toMatchObject({ off: null, low: "low", high: "high", max: "max" });
  expect(
    runtime.getModel(personalProvider, "deepseek-v4.1-flash")?.thinkingLevelMap,
  ).toMatchObject({ high: "high", max: "max" });
  await expect(runtime.checkAuth(personalProvider)).resolves.toMatchObject({
    type: "api_key",
  });
  registerPersonalCatalog(runtime);
  expect(
    runtime
      .getModels()
      .filter((m) => m.provider === personalProvider && m.id === "glm-5.3"),
  ).toHaveLength(1);
});
