import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  create: vi.fn(),
  createSession: vi.fn(),
  prompt: vi.fn(),
  abort: vi.fn(),
  dispose: vi.fn(),
  reload: vi.fn(),
  loader: vi.fn(),
  checkAuth: vi.fn(),
  readStoredCredential: vi.fn(),
  managedStart: vi.fn(),
}));
vi.mock("../src/managed-local.js", () => ({
  startManagedLocal: fake.managedStart,
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  VERSION: "0.85.1",
  readStoredCredential: fake.readStoredCredential,
  ModelRuntime: { create: fake.create },
  createAgentSession: fake.createSession,
  DefaultResourceLoader: class {
    constructor(options: unknown) {
      fake.loader(options);
    }
    reload = fake.reload;
  },
  SettingsManager: { inMemory: () => ({}) },
  SessionManager: { inMemory: () => ({}) },
}));
vi.mock("../src/personal-catalog.js", () => ({
  personalProvider: "qwen-token-plan-individual",
  registerPersonalCatalog: vi.fn(),
}));
import { createPiWorker } from "../src/pi-worker.js";
import { configSchema, route, type Task } from "../src/router.js";
const config = configSchema.parse({
  timeoutMs: 100,
  candidates: [
    {
      name: "test",
      provider: "xai",
      model: "test-model",
      billing: "subscription",
      enabled: true,
      quality: 1,
      preference: 1,
      efforts: ["low"],
    },
  ],
});
const task: Task = {
  id: "one",
  prompt: "Review the idea",
  minQuality: 1,
  effort: "low",
};
const selection = route(task, config.candidates, false);
function session(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    prompt: fake.prompt,
    abort: fake.abort,
    dispose: fake.dispose,
    thinkingLevel: "low",
    messages: [
      {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "answer" }],
      },
    ],
    ...overrides,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  fake.create.mockResolvedValue({
    getModel: () => ({ id: "test-model" }),
    checkAuth: fake.checkAuth,
  });
  fake.checkAuth.mockResolvedValue({ type: "oauth" });
  fake.createSession.mockResolvedValue({ session: session() });
  fake.prompt.mockResolvedValue(undefined);
  fake.abort.mockResolvedValue(undefined);
  fake.reload.mockResolvedValue(undefined);
});
it("uses isolated tool-free sessions, exact route, and releases resources", async () => {
  const worker = await createPiWorker(config, [selection]);
  expect(await worker(task, selection)).toBe("answer");
  expect(fake.createSession).toHaveBeenCalledWith(
    expect.objectContaining({ noTools: "all", thinkingLevel: "low" }),
  );
  expect(fake.loader).toHaveBeenCalledWith(
    expect.objectContaining({
      noExtensions: true,
      noSkills: true,
      noContextFiles: true,
    }),
  );
  expect(fake.prompt).toHaveBeenCalledWith(task.prompt);
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it("reports response-origin unknown failures without retaining response text", async () => {
  fake.createSession.mockResolvedValue({
    session: session({
      messages: [
        {
          role: "assistant",
          stopReason: "error",
          errorMessage: "private-marker",
          content: [],
        },
      ],
    }),
  });
  const worker = await createPiWorker(config, [selection]);
  let failure: unknown;
  try {
    await worker(task, selection);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({
    kind: "unknown",
    origin: "provider_response",
  });
  expect(JSON.stringify(failure)).not.toContain("private-marker");
});
it("rejects missing models before creating sessions", async () => {
  fake.create.mockResolvedValue({ getModel: () => undefined });
  await expect(createPiWorker(config, [selection])).rejects.toThrow(
    "Unknown model",
  );
  expect(fake.createSession).not.toHaveBeenCalled();
});
it("rejects an API key configured as a subscription before inference", async () => {
  fake.checkAuth.mockResolvedValue({ type: "api_key" });
  await expect(createPiWorker(config, [selection])).rejects.toThrow(
    "subscription",
  );
  expect(fake.prompt).not.toHaveBeenCalled();
});
it("rejects silent effort clamping before inference", async () => {
  fake.createSession.mockResolvedValue({
    session: session({ thinkingLevel: "off" }),
  });
  const worker = await createPiWorker(config, [selection]);
  await expect(worker(task, selection)).rejects.toThrow("Unsupported effort");
  expect(fake.prompt).not.toHaveBeenCalled();
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it.each([
  { role: "assistant", stopReason: "error", content: [] },
  { role: "assistant", stopReason: "aborted", content: [] },
  { role: "assistant", stopReason: "stop", content: [] },
])(
  "does not mistake a provider failure or empty answer for success",
  async (message) => {
    fake.createSession.mockResolvedValue({
      session: session({ messages: [message] }),
    });
    const worker = await createPiWorker(config, [selection]);
    await expect(worker(task, selection)).rejects.toThrow();
    expect(fake.dispose).toHaveBeenCalledOnce();
  },
);
it("aborts an overdue Pi request and records timeout instead of success", async () => {
  vi.useFakeTimers();
  try {
    let finish: (() => void) | undefined;
    fake.prompt.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fake.abort.mockImplementation(() => {
      finish?.();
      return Promise.resolve();
    });
    const worker = await createPiWorker(config, [selection]);
    const pending = expect(worker(task, selection)).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    expect(fake.abort).toHaveBeenCalledOnce();
    expect(fake.dispose).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
it("settles within a bounded drain even if Pi ignores cancellation", async () => {
  vi.useFakeTimers();
  try {
    fake.prompt.mockImplementation(() => new Promise(() => undefined));
    fake.abort.mockImplementation(() => new Promise(() => undefined));
    const worker = await createPiWorker(config, [selection]);
    const result = Promise.race([
      worker(task, selection).then(
        () => "completed",
        () => "deadline",
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve("still pending");
        }, 400),
      ),
    ]);
    await vi.advanceTimersByTimeAsync(401);
    expect(await result).toBe("deadline");
    expect(fake.dispose).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
it("rejects truncated responses as incomplete", async () => {
  fake.createSession.mockResolvedValue({
    session: session({
      messages: [
        {
          role: "assistant",
          stopReason: "length",
          content: [{ type: "text", text: "Partial finding" }],
        },
      ],
    }),
  });
  const worker = await createPiWorker(config, [selection]);
  await expect(worker(task, selection)).rejects.toThrow();
});
it.each([false, true])(
  "isolates local credentials and uses a bounded loopback provider (managed=%s)",
  async (managed) => {
    const close = vi.fn(() => Promise.resolve());
    fake.managedStart.mockResolvedValue({
      headers: { Authorization: "Bearer ephemeral-test" },
      close,
    });
    const localConfig = configSchema.parse({
      ...(managed
        ? {
            managedLocal: {
              executable: { path: "/runtime/server", sha256: "a".repeat(64) },
              model: { path: "/model.gguf", sha256: "b".repeat(64) },
              libraries: {},
              startupMs: 1000,
            },
          }
        : {}),
      maxConcurrency: 1,
      candidates: [
        {
          name: "local",
          provider: "relentless-local",
          model: "qwen3.5-4b",
          billing: "local",
          enabled: true,
          quality: 1,
          preference: 1,
          efforts: ["off"],
        },
      ],
    });
    const localTask: Task = { ...task, effort: "off" };
    const localRoute = route(localTask, localConfig.candidates, false);
    const registerProvider = vi.fn();
    fake.create.mockResolvedValue({
      registerProvider,
      getModel: () => ({ id: "qwen3.5-4b" }),
      checkAuth: fake.checkAuth,
    });
    fake.checkAuth.mockResolvedValue(undefined);
    fake.createSession.mockResolvedValue({
      session: session({ thinkingLevel: "off" }),
    });
    const worker = await createPiWorker(localConfig, [localRoute]);
    expect(await worker(localTask, localRoute)).toBe("answer");
    if (managed) {
      expect(fake.managedStart).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(fake.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            headers: { Authorization: "Bearer ephemeral-test" },
          }) as unknown,
        }),
      );
    } else expect(fake.managedStart).not.toHaveBeenCalled();
    expect(fake.create).toHaveBeenCalledOnce();
    expect(fake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshOnCreate: false,
        credentials: expect.any(Object) as unknown,
      }),
    );
    expect(registerProvider).toHaveBeenCalledWith(
      "relentless-local",
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:18080/v1",
        authHeader: false,
      }),
    );
  },
);
it.each([
  ["429 rate limit", "quota"],
  ["Connection error.", "outage"],
  ["cyberPolicy: request denied", "policy"],
  ["Request flagged", "unknown"],
])("preserves normalized provider failures: %s", async (errorMessage, kind) => {
  fake.createSession.mockResolvedValue({
    session: session({
      messages: [
        { role: "assistant", stopReason: "error", errorMessage, content: [] },
      ],
    }),
  });
  const worker = await createPiWorker(config, [selection]);
  await expect(worker(task, selection)).rejects.toMatchObject({ kind });
});
it("supports read-only Pi login access without credential writes", async () => {
  const { readonlyCredentials } = await import("../src/pi-worker.js");
  const storage = readonlyCredentials();
  await expect(storage.modify()).rejects.toMatchObject({ kind: "auth" });
  await expect(storage.delete()).rejects.toMatchObject({ kind: "auth" });
});
it("routes xAI subscription inference through the OAuth proxy without changing model or effort", async () => {
  const original = {
    id: "test-model",
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
    headers: { existing: "retained" },
  };
  fake.create.mockResolvedValue({
    getModel: () => original,
    checkAuth: fake.checkAuth,
  });
  const worker = await createPiWorker(config, [selection]);
  await worker(task, selection);
  expect(fake.createSession).toHaveBeenCalledWith(
    expect.objectContaining({
      model: {
        ...original,
        baseUrl: "https://cli-chat-proxy.grok.com/v1",
        headers: {
          existing: "retained",
          "X-XAI-Token-Auth": "xai-grok-cli",
          "x-authenticateresponse": "authenticate-response",
          "x-grok-client-version": "0.85.1",
          "x-grok-client-identifier": "relentless",
          "User-Agent": "relentless pi/0.85.1",
        },
      },
      thinkingLevel: "low",
    }),
  );
  expect(original.baseUrl).toBe("https://api.x.ai/v1");
});
it("keeps explicitly metered xAI on the public API", async () => {
  const metered = configSchema.parse({
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  const selected = route(task, metered.candidates, true);
  const original = {
    id: "test-model",
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
  };
  fake.checkAuth.mockResolvedValue({ type: "api_key" });
  fake.create.mockResolvedValue({
    getModel: () => original,
    checkAuth: fake.checkAuth,
  });
  await (
    await createPiWorker(metered, [selected])
  )(task, selected);
  expect(fake.createSession).toHaveBeenCalledWith(
    expect.objectContaining({ model: original }),
  );
});
it("declares the actual Pi transport version and Relentless identity for Grok protocol negotiation", async () => {
  await (
    await createPiWorker(config, [selection])
  )(task, selection);
  expect(fake.createSession.mock.calls[0]?.[0]).toMatchObject({
    model: {
      headers: {
        "x-grok-client-version": "0.85.1",
        "x-grok-client-identifier": "relentless",
        "User-Agent": "relentless pi/0.85.1",
      },
    },
  });
});
it("checks the Personal plan endpoint before permitting subscription inference", async () => {
  const personal = configSchema.parse({
    ...config,
    candidates: config.candidates.map((c) => ({
      ...c,
      provider: "qwen-token-plan-individual",
    })),
  });
  const selected = route(task, personal.candidates, false);
  fake.checkAuth.mockResolvedValue({ type: "api_key" });
  fake.create.mockResolvedValue({
    getModel: () => ({
      id: "test-model",
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    }),
    checkAuth: fake.checkAuth,
  });
  await expect(createPiWorker(personal, [selected])).rejects.toThrow(
    "subscription",
  );
  expect(fake.createSession).not.toHaveBeenCalled();
  fake.create.mockResolvedValue({
    getModel: () => ({
      id: "test-model",
      baseUrl:
        "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    }),
    checkAuth: fake.checkAuth,
  });
  await expect(
    (await createPiWorker(personal, [selected]))(task, selected),
  ).resolves.toBe("answer");
});
it("keeps task output contracts above optional reviewer commentary", async () => {
  let system = "";
  fake.loader.mockImplementation(
    (options: { systemPromptOverride: () => string }) => {
      system = options.systemPromptOverride();
    },
  );
  const worker = await createPiWorker(config, [selection]);
  await worker(
    { ...task, prompt: 'Return only JSON {"echo":"ok"}' },
    selection,
  );
  expect(system).toContain("Follow the task's requested output format");
  expect(system).not.toContain("State assumptions and uncertainties.");
  expect(system).not.toContain(
    "You are an independent software design reviewer.",
  );
});
it("reports catalog cost estimates only for metered responses with token usage", async () => {
  const paid = configSchema.parse({
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  const selection = route(task, paid.candidates, true);
  const estimate = vi.fn();
  fake.createSession.mockResolvedValue({
    session: session({
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "ok" }],
          usage: { totalTokens: 20, cost: { total: 0.02 } },
        },
      ],
    }),
  });
  const worker = await createPiWorker(paid, [selection], estimate);
  await worker(task, selection);
  expect(estimate).toHaveBeenCalledWith(task.id, 0.02);
});
it("does not report zero catalog prices as known free API usage", async () => {
  const paid = configSchema.parse({
    ...config,
    allowMetered: true,
    candidates: config.candidates.map((c) => ({ ...c, billing: "metered" })),
  });
  const selection = route(task, paid.candidates, true);
  const estimate = vi.fn();
  fake.createSession.mockResolvedValue({
    session: session({
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "ok" }],
          usage: { totalTokens: 20, cost: { total: 0 } },
        },
      ],
    }),
  });
  const worker = await createPiWorker(paid, [selection], estimate);
  await worker(task, selection);
  expect(estimate).not.toHaveBeenCalled();
});
it("aborts and disposes an in-flight Pi prompt on external cancellation", async () => {
  const started = new Promise<void>((resolve) => {
    fake.prompt.mockImplementation(() => {
      resolve();
      return new Promise<string>(() => {
        /* deliberately pending */
      });
    });
  });
  const worker = await createPiWorker(config, [selection]);
  const controller = new AbortController();
  const result = worker(task, selection, controller.signal);
  await started;
  controller.abort();
  await expect(result).rejects.toMatchObject({
    kind: "unknown",
    origin: "cancellation_unsettled",
  });
  expect(fake.abort).toHaveBeenCalled();
  expect(fake.dispose).toHaveBeenCalled();
});

it("does not start inference when cancellation arrives during resource loading", async () => {
  const controller = new AbortController();
  fake.reload.mockImplementation(() => {
    controller.abort();
    return Promise.resolve();
  });
  const worker = await createPiWorker(config, [selection]);
  await expect(
    worker(task, selection, controller.signal),
  ).rejects.toMatchObject({ kind: "interrupted" });
  expect(fake.prompt).not.toHaveBeenCalled();
  expect(fake.dispose).toHaveBeenCalled();
});
it.each(["prompt", "message"])(
  "preserves a cancellation-time policy denial from %s",
  async (source) => {
    let rejectPrompt: ((error: Error) => void) | undefined;
    let finishPrompt: (() => void) | undefined;
    const messages: Record<string, unknown>[] = [];
    fake.createSession.mockResolvedValue({ session: session({ messages }) });
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    fake.prompt.mockImplementation(() => {
      markStarted?.();
      return new Promise<void>((resolve, reject) => {
        finishPrompt = resolve;
        rejectPrompt = reject;
      });
    });
    fake.abort.mockImplementation(() => {
      if (source === "prompt") rejectPrompt?.(new Error("Policy violation"));
      else {
        messages.push({
          role: "assistant",
          stopReason: "error",
          errorMessage: "Policy violation",
          content: [],
        });
        finishPrompt?.();
      }
      return Promise.resolve();
    });
    const worker = await createPiWorker(config, [selection]);
    const controller = new AbortController();
    const result = worker(task, selection, controller.signal);
    await started;
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "policy" });
    expect(fake.dispose).toHaveBeenCalledOnce();
  },
);
it("does not dispatch a queued prompt after cancellation during effort validation", async () => {
  const controller = new AbortController();
  const current = session();
  Object.defineProperty(current, "thinkingLevel", {
    get: () => {
      controller.abort();
      return "low";
    },
  });
  fake.createSession.mockResolvedValue({ session: current });
  const worker = await createPiWorker(config, [selection]);
  await expect(
    worker(task, selection, controller.signal),
  ).rejects.toMatchObject({ kind: "interrupted" });
  expect(fake.prompt).not.toHaveBeenCalled();
});

it("read-only expired OAuth fails as auth before runtime or inference starts", async () => {
  fake.readStoredCredential.mockReturnValue({
    type: "oauth",
    expires: Date.now() - 1,
  });
  await expect(
    createPiWorker({ ...config, readOnlyAuth: true }, [selection]),
  ).rejects.toMatchObject({ kind: "auth" });
  expect(fake.create).not.toHaveBeenCalled();
  expect(fake.createSession).not.toHaveBeenCalled();
});
it("read-only fresh OAuth does not refresh or disable the provider", async () => {
  fake.readStoredCredential.mockReturnValue({
    type: "oauth",
    expires: Date.now() + 3600000,
  });
  const worker = await createPiWorker({ ...config, readOnlyAuth: true }, [
    selection,
  ]);
  expect(await worker(task, selection)).toBe("answer");
});

it("inventory distinguishes stored OAuth presence from refresh-required validity", async () => {
  fake.readStoredCredential.mockReturnValue({ type: "oauth", expires: 0 });
  fake.create.mockResolvedValue({
    getModels: () => [{ provider: "xai", id: "test-model", reasoning: true }],
    checkAuth: fake.checkAuth,
    registerProvider: vi.fn(),
  });
  const { inventoryRuntime } = await import("../src/inventory-runtime.js");
  const result = await inventoryRuntime(
    config,
    "/nonexistent-relentless-test-ledger.sqlite",
  );
  expect(result.models[0]).toMatchObject({
    authentication: "present",
    oauthFreshness: "refresh_required",
    capacity: "unverified",
  });
  expect(fake.createSession).not.toHaveBeenCalled();
});
