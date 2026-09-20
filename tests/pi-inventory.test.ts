import { join } from "node:path";
import { expect, test } from "vitest";
import { piProjectConfigSchema } from "../src/pi-project-config.js";
import { projectPiInventory } from "../src/pi-inventory.js";
const project = piProjectConfigSchema.parse({
  version: 1,
  routing: {
    candidates: [
      {
        name: "cheap",
        provider: "p",
        model: "m",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
      {
        name: "paid",
        provider: "q",
        model: "n",
        billing: "metered",
        enabled: true,
        quality: 2,
        preference: 1,
        efforts: ["low"],
      },
    ],
  },
  roles: { coder: ["cheap", "paid"] },
});
const available = [
  { provider: "p", model: "m", efforts: ["low"] },
  { provider: "q", model: "n", efforts: ["low"] },
  { provider: "new", model: "fresh", efforts: ["off"] },
];
test("review coverage counts distinct providers and excludes every eligible author provider", () => {
  const candidates = [
    { name: "a", provider: "a" },
    { name: "b", provider: "b" },
    { name: "b-alias", provider: "b" },
    { name: "c", provider: "c" },
  ].map((entry) => ({
    ...entry,
    model: entry.name,
    billing: "subscription",
    enabled: true,
    quality: 1,
    preference: 1,
    efforts: ["low"],
  }));
  const policy = piProjectConfigSchema.parse({
    version: 1,
    routing: { candidates },
    roles: { coder: ["a", "b"], reviewer: candidates.map((c) => c.name) },
  });
  const models = {
    available: candidates.map((c) => ({
      provider: c.provider,
      model: c.model,
      efforts: ["low"],
    })),
    scoped: [],
  };
  const expected = {
    scope: "current_role_pools",
    requiredIndependentProviders: 2,
    byAuthor: [
      {
        name: "a",
        provider: "a",
        reviewerProviders: ["b", "c"],
        sufficient: true,
      },
      {
        name: "b",
        provider: "b",
        reviewerProviders: ["a", "c"],
        sufficient: true,
      },
    ],
    allEligibleAuthors: {
      providers: ["a", "b"],
      reviewerProviders: ["c"],
      sufficient: false,
    },
  };
  expect(projectPiInventory(policy, models, {}, 100)).toMatchObject({
    reviewCoverage: expected,
  });
  for (const scenario of [
    { policy, models, health: { "provider:c": { until: 200 } } },
    {
      policy: {
        ...policy,
        routing: {
          ...policy.routing,
          candidates: policy.routing.candidates.map((c) =>
            c.name === "c" ? { ...c, billing: "metered" as const } : c,
          ),
        },
      },
      models,
      health: {},
    },
    {
      policy,
      models: {
        ...models,
        scoped: models.available.filter((c) => c.provider !== "c"),
      },
      health: {},
    },
    {
      policy,
      models: {
        ...models,
        available: models.available.map((c) =>
          c.provider === "c" ? { ...c, efforts: ["high"] } : c,
        ),
      },
      health: {},
    },
  ]) {
    expect(
      projectPiInventory(
        scenario.policy,
        scenario.models,
        scenario.health,
        100,
      ),
    ).toMatchObject({
      reviewCoverage: {
        byAuthor: [
          { name: "a", reviewerProviders: ["b"], sufficient: false },
          { name: "b", reviewerProviders: ["a"], sufficient: false },
        ],
        allEligibleAuthors: { reviewerProviders: [], sufficient: false },
      },
    });
  }
  expect(projectPiInventory(null, models, {}, 100)).toMatchObject({
    reviewCoverage: {
      byAuthor: [],
      allEligibleAuthors: { providers: [], sufficient: false },
    },
  });
  expect(
    projectPiInventory(
      { ...policy, roles: { reviewer: ["a", "b", "c"] } },
      models,
      {},
      100,
    ),
  ).toMatchObject({
    reviewCoverage: { byAuthor: [], allEligibleAuthors: { sufficient: false } },
  });
});
test("fresh project discovery works before configuration without granting roles or writing state", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } =
    await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { clankerCommand } = await import("../src/pi-extension.js");
  const cwd = await mkdtemp(join(tmpdir(), "pi-inventory-bootstrap-"));
  const messages: { message: string; type: string }[] = [];
  const context = {
    cwd,
    isProjectTrusted: () => true,
    models: () => ({ available, scoped: [], catalog: available }),
    ui: {
      notify: (message: string, type: "info" | "error") => {
        messages.push({ message, type });
      },
    },
  };
  try {
    for (const installed of [false, true]) {
      if (installed) {
        await mkdir(join(cwd, ".pi"));
        await writeFile(
          join(cwd, ".pi/settings.json"),
          '{"packages":["/example/clanker"]}',
        );
      }
      messages.length = 0;
      await clankerCommand("inventory", context, () =>
        Promise.reject(new Error("No dispatch")),
      );
      expect(messages[0]?.type).toBe("info");
      expect(JSON.parse(messages[0]?.message ?? "null")).toMatchObject({
        configured: [],
        unconfiguredAvailable: available,
        unconfiguredTotal: 3,
      });
      expect(existsSync(join(cwd, ".harness"))).toBe(false);
      if (installed)
        expect(await readFile(join(cwd, ".pi/settings.json"), "utf8")).toBe(
          '{"packages":["/example/clanker"]}',
        );
      else expect(existsSync(join(cwd, ".pi"))).toBe(false);
    }
    await writeFile(
      join(cwd, ".pi/settings.json"),
      '{"clanker":{"version":999}}',
    );
    messages.length = 0;
    await clankerCommand("inventory", context);
    expect(messages[0]?.type).toBe("error");
    messages.length = 0;
    await clankerCommand("inventory", {
      ...context,
      isProjectTrusted: () => false,
    });
    expect(messages[0]?.type).toBe("error");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test("session inventory separates policy, cooldown, capability and undiscovered configuration", () => {
  const result = projectPiInventory(
    project,
    { available, scoped: [], catalog: available },
    { "provider:p": { until: 200 } },
    100,
  );
  expect(result.configured[0]).toMatchObject({
    name: "cheap",
    catalogPresent: true,
    sessionAvailable: true,
    cooldownUntil: 200,
    roles: ["coder"],
    eligibleRoles: [],
    capacity: "unverified",
    capability: "unverified",
  });
  expect(result.configured[1]).toMatchObject({
    name: "paid",
    billingAllowed: false,
    eligibleRoles: [],
  });
  expect(result.unconfiguredAvailable).toEqual([available[2]]);
});
test("scope and supported effort exclusions match existing Pi role routing", () => {
  const result = projectPiInventory(
    project,
    { available, scoped: [{ provider: "p", model: "m", effort: "high" }] },
    {},
    100,
  );
  expect(result.configured[0]).toMatchObject({
    catalogPresent: null,
    eligibleRoles: [],
  });
  expect(
    projectPiInventory(project, { available, scoped: [] }, {}, 100)
      .configured[0]?.eligibleRoles,
  ).toEqual(["coder"]);
  expect(() =>
    projectPiInventory(project, { available, scoped: [] }, {}, -1),
  ).toThrow();
});

test("Pi inventory command uses session data without initializing journals or dispatching", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { clankerCommand } = await import("../src/pi-extension.js");
  const cwd = await mkdtemp(join(tmpdir(), "pi-inventory-"));
  try {
    await mkdir(join(cwd, ".pi"));
    await writeFile(
      join(cwd, ".pi/settings.json"),
      JSON.stringify({ clanker: project }),
    );
    const messages: string[] = [];
    await clankerCommand(
      "inventory",
      {
        cwd,
        isProjectTrusted: () => true,
        models: () => ({ available, scoped: [], catalog: available }),
        ui: {
          notify: (message, type) => {
            expect(type).toBe("info");
            messages.push(message);
          },
        },
      },
      () => Promise.reject(new Error("No dispatch")),
    );
    expect(messages[0]).toContain('"unconfiguredAvailable"');
    expect(existsSync(join(cwd, ".harness"))).toBe(false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("inventory terminal output pages discovery with an explicit continuation", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { clankerCommand } = await import("../src/pi-extension.js");
  const cwd = await mkdtemp(join(tmpdir(), "pi-inventory-page-"));
  try {
    await mkdir(join(cwd, ".pi"));
    await writeFile(
      join(cwd, ".pi/settings.json"),
      JSON.stringify({ clanker: project }),
    );
    const pool = Array.from({ length: 25 }, (_, i) => ({
      provider: "new",
      model: `m${String(i)}`,
      efforts: ["off"],
    }));
    const messages: string[] = [];
    const context = {
      cwd,
      isProjectTrusted: () => true,
      models: () => ({ available: pool, scoped: [] }),
      ui: {
        notify: (message: string, type: "info" | "error") => {
          expect(type).toBe("info");
          messages.push(message);
        },
      },
    };
    await clankerCommand("inventory", context);
    expect(JSON.parse(messages[0] ?? "null")).toMatchObject({
      unconfiguredTotal: 25,
      nextOffset: 20,
    });
    await clankerCommand("inventory 20", context);
    expect(JSON.parse(messages[1] ?? "null")).toMatchObject({
      unconfiguredTotal: 25,
      nextOffset: null,
      unconfiguredAvailable: pool.slice(20),
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
