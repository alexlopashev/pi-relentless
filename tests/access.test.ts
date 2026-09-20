import { expect, it } from "vitest";
import { verifyAccess } from "../src/pi-worker.js";
it("permits verified supported subscriptions", () => {
  expect(() => {
    verifyAccess("openai-codex", "subscription", "oauth", false);
  }).not.toThrow();
  expect(() => {
    verifyAccess("xai", "subscription", "oauth", false);
  }).not.toThrow();
});
it("rejects missing auth, mislabeled API keys, and Claude extra usage", () => {
  expect(() => {
    verifyAccess("xai", "subscription", undefined, false);
  }).toThrow("Login");
  expect(() => {
    verifyAccess("xai", "subscription", "api_key", false);
  }).toThrow("subscription");
  expect(() => {
    verifyAccess("anthropic", "subscription", "oauth", false);
  }).toThrow("subscription");
  expect(() => {
    verifyAccess("unknown", "subscription", "oauth", false);
  }).toThrow("subscription");
});
it("requires explicit opt-in for metered calls even with OAuth", () => {
  expect(() => {
    verifyAccess("anthropic", "metered", "oauth", false);
  }).toThrow("Metered");
  expect(() => {
    verifyAccess("anthropic", "metered", "oauth", true);
  }).not.toThrow();
});
it("permits keyless local inference only for the dedicated local provider", () => {
  expect(() => {
    verifyAccess("relentless-local", "local", undefined, false);
  }).not.toThrow();
  expect(() => {
    verifyAccess("xai", "local", undefined, false);
  }).toThrow("Invalid local");
});
it("accepts Personal subscription API keys only on the dedicated plan endpoint", () => {
  const endpoint =
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
  expect(() => {
    verifyAccess(
      "qwen-token-plan-individual",
      "subscription",
      "api_key",
      false,
      endpoint,
    );
  }).not.toThrow();
  for (const base of [
    undefined,
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    endpoint + ".evil",
  ]) {
    expect(() => {
      verifyAccess(
        "qwen-token-plan-individual",
        "subscription",
        "api_key",
        false,
        base,
      );
    }).toThrow("subscription");
  }
  expect(() => {
    verifyAccess(
      "qwen-token-plan-individual",
      "subscription",
      "oauth",
      false,
      endpoint,
    );
  }).toThrow("subscription");
  expect(() => {
    verifyAccess("qwen-token-plan", "subscription", "api_key", false, endpoint);
  }).toThrow("subscription");
});
