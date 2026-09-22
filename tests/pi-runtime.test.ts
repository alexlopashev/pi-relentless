import { expect, test, vi } from "vitest";
import { assertPiNodeRuntime } from "../src/pi-runtime.js";

test("standalone Bun gets the Node launch instruction before loading SQLite", () => {
  const load = vi.fn();
  expect(() => {
    assertPiNodeRuntime({ node: "24.3.0", bun: "1.3.14" }, load);
  }).toThrow(
    "node .pi/git/github.com/alexlopashev/pi-relentless/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
  );
  expect(load).not.toHaveBeenCalled();
});
test("missing SQLite produces a runtime diagnostic without exposing loader errors", () => {
  expect(() => {
    assertPiNodeRuntime({ node: "24.21.0" }, () => {
      throw new Error("PRIVATE loader details");
    });
  }).toThrow("Relentless requires Node");
  try {
    assertPiNodeRuntime({ node: "24.21.0" }, () => {
      throw new Error("PRIVATE loader details");
    });
  } catch (error) {
    expect(String(error)).not.toContain("PRIVATE");
  }
});
test("the supported Node runtime can load its built-in SQLite", () => {
  expect(() => {
    assertPiNodeRuntime();
  }).not.toThrow();
});
