import { expect, it, vi } from "vitest";
import { inventory } from "../src/model-inventory.js";
import { configSchema } from "../src/router.js";
const config = configSchema.parse({
  candidates: [
    {
      name: "a",
      provider: "one",
      model: "model",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low", "high"],
    },
    {
      name: "b",
      provider: "one",
      model: "missing",
      billing: "metered",
      enabled: false,
      quality: 1,
      preference: 2,
      efforts: ["low"],
    },
  ],
});
it("distinguishes configured/authenticated/catalog/cooldown from actual capacity", async () => {
  const auth = vi.fn().mockResolvedValue(true);
  const report = await inventory(
    config,
    [{ provider: "one", model: "model", efforts: ["low"] }],
    auth,
    { "provider:one": { until: 2000 } },
    1000,
  );
  expect(report[0]).toMatchObject({
    catalogPresent: true,
    authentication: "present",
    capacity: "unverified",
    cooldownUntil: 2000,
    supportedEfforts: ["low"],
  });
  expect(report[1]).toMatchObject({
    catalogPresent: false,
    enabled: false,
    billingAllowed: false,
  });
  expect(auth).toHaveBeenCalledTimes(1);
});
it("handles missing credentials and auth read failures without emitting their text", async () => {
  const missing = await inventory(
    config,
    [],
    () => Promise.resolve(false),
    {},
    1000,
  );
  expect(missing[0]?.authentication).toBe("missing");
  const failed = await inventory(
    config,
    [],
    () => Promise.reject(new Error("secret diagnostic")),
    {},
    1000,
  );
  expect(failed[0]?.authentication).toBe("unverified");
  expect(JSON.stringify(failed)).not.toContain("secret diagnostic");
});
it("identifies native adapters exactly without guessing from provider name", async () => {
  const first = config.candidates[0];
  if (!first) throw new Error("Missing fixture");
  const c = configSchema.parse({
    ...config,
    candidates: [
      { ...first, name: "native", provider: "claude-code" },
      { ...first, name: "cloud", provider: "client-cloud" },
    ],
  });
  const auth = vi.fn().mockResolvedValue(false);
  const rows = await inventory(c, [], auth, {}, 1000);
  expect(rows[0]?.authentication).toBe("unverified");
  expect(rows[1]?.authentication).toBe("missing");
  expect(auth).toHaveBeenCalledExactlyOnceWith("client-cloud");
});
