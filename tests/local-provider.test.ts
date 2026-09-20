import { expect, test } from "vitest";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { localCatalog, registerLocalProvider } from "../src/local-provider.js";

test("Pi extension and workers share the same loopback-only local catalog", async () => {
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
      modify: () => Promise.reject(new Error("immutable")),
      delete: () => Promise.reject(new Error("immutable")),
    },
  });
  registerLocalProvider(runtime);
  const first = runtime.getModel("relentless-local", "qwen3.5-4b");
  runtime.registerProvider("relentless-local", localCatalog());
  expect(runtime.getModel("relentless-local", "qwen3.5-4b")).toEqual(first);
  expect(first?.baseUrl).toBe("http://127.0.0.1:18080/v1");
  expect(first?.reasoning).toBe(false);
});
