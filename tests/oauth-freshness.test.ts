import { test, expect } from "vitest";
import { oauthFreshness } from "../src/oauth-freshness.js";
test("read-only OAuth requires known validity beyond Pi's refresh window", () => {
  expect(oauthFreshness("oauth", 400001, 100000)).toBe("fresh");
  for (const expiry of [400000, 99999, undefined, NaN, Infinity, -1])
    expect(oauthFreshness("oauth", expiry, 100000)).toBe("refresh_required");
  expect(oauthFreshness("api_key", undefined, 100000)).toBe("not_oauth");
  expect(oauthFreshness(undefined, undefined, 100000)).toBe("not_oauth");
  expect(oauthFreshness("oauth", 101, 100, 0)).toBe("fresh");
});
test("invalid clock/window cannot authorize dispatch", () => {
  for (const now of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER])
    expect(() => oauthFreshness("oauth", Number.MAX_VALUE, now)).toThrow();
  expect(() => oauthFreshness("oauth", 1000, 0, -1)).toThrow();
});
