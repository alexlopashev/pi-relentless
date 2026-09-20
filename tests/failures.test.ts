import { expect, it } from "vitest";
import { fromProviderError, fromProviderMessage } from "../src/failures.js";
it("classifies structured outages and honors retry-after without persisting error text", () => {
  expect(
    fromProviderError({
      status: 429,
      headers: { "retry-after": "60" },
      message: "secret",
    }),
  ).toMatchObject({ kind: "quota", retryAfterMs: 60000 });
  expect(fromProviderError({ status: 503 }).kind).toBe("outage");
  expect(fromProviderError({ code: "cyberPolicy", status: 503 }).kind).toBe(
    "policy",
  );
  expect(fromProviderError({ status: 401 }).kind).toBe("auth");
  expect(fromProviderError({ status: 403 }).kind).toBe("permission");
  expect(fromProviderError({ code: "unknown" }).kind).toBe("unknown");
});
it("does not reinterpret policy, approval or ambiguous flags as retryable failures", () => {
  expect(fromProviderMessage("cyberPolicy: request flagged").kind).toBe(
    "policy",
  );
  expect(fromProviderMessage("Waiting for approval").kind).toBe("approval");
  expect(fromProviderMessage("Request flagged").kind).toBe("unknown");
  expect(fromProviderMessage("Connection error.").kind).toBe("outage");
});
it("gives policy evidence precedence over a conflicting retryable code", () => {
  expect(
    fromProviderError({
      code: "rateLimitExceeded",
      message: "cyberPolicy: request denied",
    }).kind,
  ).toBe("policy");
});
it("recognizes HTTP authentication and access denials flattened by Pi", () => {
  expect(fromProviderMessage('403 {"error":"access denied"}').kind).toBe(
    "permission",
  );
  expect(fromProviderMessage("HTTP 401 Unauthorized").kind).toBe("auth");
  expect(fromProviderMessage("403 cyberPolicy").kind).toBe("policy");
});
it("preserves access-denial HTTP status over transient provider codes", () => {
  expect(
    fromProviderError({ status: 403, code: "rateLimitExceeded" }).kind,
  ).toBe("permission");
  expect(
    fromProviderError({ status: 401, code: "serverOverloaded" }).kind,
  ).toBe("auth");
});
it("does not weaken policy or permission evidence to approval prose", () => {
  expect(
    fromProviderError({ code: "cyberPolicy", message: "approval required" })
      .kind,
  ).toBe("policy");
  expect(
    fromProviderError({ status: 403, message: "approval required" }).kind,
  ).toBe("permission");
});
it("recognizes wrapped Pi HTTP errors and Grok Build balance exhaustion", () => {
  expect(
    fromProviderMessage(
      'OpenAI API error (402): 402 "Grok Build usage balance exhausted"',
    ).kind,
  ).toBe("quota");
  expect(
    fromProviderMessage('OpenAI API error (403): 403 "Access denied"').kind,
  ).toBe("permission");
  expect(
    fromProviderMessage("OpenAI API error (429): 429 rate limited").kind,
  ).toBe("quota");
  expect(
    fromProviderMessage("OpenAI API error (402): payment required").kind,
  ).toBe("unknown");
  expect(
    fromProviderMessage(
      "OpenAI API error (402): Grok Build usage balance exhausted; cyberPolicy",
    ).kind,
  ).toBe("policy");
});
it("preserves explicit authentication messages over retryable structured metadata", () => {
  for (const message of [
    "401 Unauthorized",
    "HTTP 401 Unauthorized",
    "OpenAI API error (401): 401 Unauthorized",
    "Login required for xai; use Pi login",
  ]) {
    expect(fromProviderError({ code: "rateLimitExceeded", message }).kind).toBe(
      "auth",
    );
    expect(fromProviderError({ status: 503, message }).kind).toBe("auth");
  }
  expect(
    fromProviderError({ code: "cyberPolicy", message: "401 Unauthorized" })
      .kind,
  ).toBe("policy");
  expect(
    fromProviderError({
      code: "rateLimitExceeded",
      message: "Unrecognized provider detail",
    }).kind,
  ).toBe("quota");
});
