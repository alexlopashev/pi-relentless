import { expect, test } from "vitest";
import {
  managedLocalSchema,
  managedLocalArgs,
} from "../src/managed-local-config.js";
const config = {
  executable: { path: "/runtime/llama-server", sha256: "a".repeat(64) },
  model: { path: "/models/model.gguf", sha256: "b".repeat(64) },
  libraries: {},
  startupMs: 30000,
};
test("managed runtime config requires explicit absolute pinned artifacts and bounded startup", () => {
  expect(managedLocalSchema.parse(config)).toEqual(config);
  for (const invalid of [
    { ...config, libraries: {}, startupMs: 0 },
    { ...config, libraries: {}, startupMs: 120001 },
    { ...config, shell: "sh" },
    { ...config, executable: { ...config.executable, path: "relative" } },
    { ...config, model: { ...config.model, sha256: "bad" } },
  ])
    expect(managedLocalSchema.safeParse(invalid).success).toBe(false);
});
test("launch arguments constrain inference to loopback and CPU with an ephemeral key", () => {
  expect(
    managedLocalArgs(managedLocalSchema.parse(config), "test-key"),
  ).toEqual([
    "-m",
    "/models/model.gguf",
    "--alias",
    "qwen3.5-4b",
    "--host",
    "127.0.0.1",
    "--port",
    "18080",
    "-c",
    "8192",
    "-np",
    "1",
    "-t",
    "2",
    "-ngl",
    "0",
    "--device",
    "none",
    "--no-op-offload",
    "--jinja",
    "--reasoning",
    "off",
    "-n",
    "512",
    "--api-key",
    "test-key",
  ]);
});
