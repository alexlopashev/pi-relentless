import { expect, test } from "vitest";
import { buildConfigProposal } from "../src/config-proposal.js";
const config = {
  version: 1,
  routing: {
    candidates: [
      {
        name: "a",
        provider: "a",
        model: "a",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
  },
  roles: { coder: ["a"] },
};
test("proposal binds exact source bytes and project without retaining unrelated settings", () => {
  const original = JSON.stringify({
    unrelated: "private-do-not-copy",
    relentless: config,
  });
  const next = {
    ...config,
    routing: {
      candidates: config.routing.candidates.map((c) => ({
        ...c,
        preference: 2,
      })),
    },
  };
  const proposal = buildConfigProposal("/project", original, next);
  expect(JSON.stringify(proposal)).not.toContain("private-do-not-copy");
  expect(proposal.before).toEqual(config);
  expect(proposal.after.routing.allowMetered).toBe(false);
  expect(proposal.id).not.toBe(
    buildConfigProposal("/other", original, next).id,
  );
  expect(proposal.id).not.toBe(
    buildConfigProposal("/project", original + " ", next).id,
  );
  expect(proposal.targetSha256).not.toBe(proposal.sourceSha256);
});
test("proposal rejects invalid policy, malformed settings and oversized input", () => {
  expect(() => buildConfigProposal("/p", "[]", config)).toThrow();
  expect(() => buildConfigProposal("/p", "{", config)).toThrow();
  expect(() => buildConfigProposal("/p", " ".repeat(131073), config)).toThrow();
  expect(() =>
    buildConfigProposal("/p", undefined, {
      ...config,
      roles: { coder: ["missing"] },
    }),
  ).toThrow();
  expect(() =>
    buildConfigProposal(
      "/p",
      '{"relentless":{"apiKey":"do-not-emit"}}',
      config,
    ),
  ).toThrow();
});
test("missing settings are bound distinctly from empty settings", () => {
  const proposal = buildConfigProposal("/p", undefined, config);
  expect(proposal.sourceSha256).toBeNull();
  expect(proposal.before).toBeNull();
  expect(proposal.id).not.toBe(buildConfigProposal("/p", "{}", config).id);
});
