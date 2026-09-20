import { EventEmitter } from "node:events";
import { expect, it, vi, beforeEach } from "vitest";
const fake = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: fake.spawn }));
import {
  nativeCommand,
  nativeOutput,
  nativeWorker,
  subscriptionEnvironment,
} from "../src/native-worker.js";
import { configSchema, route, type Task } from "../src/router.js";
import { Failure } from "../src/failures.js";
beforeEach(() => {
  fake.spawn.mockReset();
});

const task: Task = {
  id: "fixture",
  prompt: "Offline fixture",
  minQuality: 1,
  effort: "low",
};
function configuration(provider = "claude-code", allowMetered = true) {
  return configSchema.parse({
    candidates: [
      {
        name: "fixture",
        provider,
        model: "fixture",
        billing: "subscription",
        enabled: true,
        quality: 1,
        preference: 1,
        efforts: ["low"],
      },
    ],
    timeoutMs: 1000,
    allowMetered,
  });
}
type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  stdin: EventEmitter & { end: () => void };
};
function child(onInput: (process: FakeChild) => void): FakeChild {
  const process = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
    stdin: Object.assign(new EventEmitter(), {
      end: () => {
        queueMicrotask(() => {
          onInput(process);
        });
      },
    }),
  });
  return process;
}
function authenticatedChild(provider: string) {
  return child((process) => {
    process.stdout.emit(
      "data",
      Buffer.from(
        provider === "claude-code"
          ? JSON.stringify({
              loggedIn: true,
              authMethod: "claude.ai",
              apiProvider: "firstParty",
              subscriptionType: "max",
            })
          : "Logged in using ChatGPT",
      ),
    );
    process.emit("close", 0);
  });
}
it("uses subscription-preserving Claude isolation and an explicit model", () => {
  const command = nativeCommand("claude-code", "claude-opus-5", "low");
  expect(command.args).toContain("--safe-mode");
  expect(command.args).not.toContain("--bare");
  expect(
    command.args.slice(
      command.args.indexOf("--tools"),
      command.args.indexOf("--tools") + 2,
    ),
  ).toEqual(["--tools", ""]);
  expect(command.args).toContain("claude-opus-5");
});
it("uses an isolated read-only Codex invocation without user configuration", () => {
  const { args } = nativeCommand("codex-cli", "gpt-5.6-luna", "low");
  expect(args).toContain("--ignore-user-config");
  expect(args).toContain("read-only");
  expect(args).toContain("features.shell_tool=false");
  expect(args).toContain('forced_login_method="chatgpt"');
});
it("rejects billing overrides without echoing their values", () => {
  expect(() =>
    subscriptionEnvironment({ ANTHROPIC_API_KEY: "secret" }),
  ).toThrow("override");
  expect(() => subscriptionEnvironment({ OPENAI_BASE_URL: "secret" })).toThrow(
    "override",
  );
  expect(subscriptionEnvironment({ PATH: "/bin" })).toMatchObject({
    PATH: "/bin",
  });
});
it("requires native success and rejects errors, truncation and tool activity", () => {
  expect(
    nativeOutput(
      "claude-code",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "answer",
        stop_reason: "end_turn",
      }),
    ),
  ).toBe("answer");
  expect(() =>
    nativeOutput(
      "claude-code",
      JSON.stringify({
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        result: "partial",
      }),
    ),
  ).toThrow();
  const completed =
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "answer" },
    }) +
    "\n" +
    JSON.stringify({ type: "turn.completed" });
  expect(nativeOutput("codex-cli", completed)).toBe("answer");
  expect(() =>
    nativeOutput("codex-cli", completed.split("\n")[0] ?? ""),
  ).toThrow();
  expect(() =>
    nativeOutput(
      "codex-cli",
      JSON.stringify({
        type: "item.started",
        item: { type: "command_execution" },
      }) +
        "\n" +
        completed,
    ),
  ).toThrow();
});
it("treats Claude refusal as policy and extracts structured failure messages", () => {
  expect(() =>
    nativeOutput(
      "claude-code",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "No",
        stop_reason: "refusal",
      }),
    ),
  ).toThrow(new Failure("policy"));
  expect(() =>
    nativeOutput(
      "claude-code",
      JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        errors: ["cyberPolicy: request denied"],
      }),
    ),
  ).toThrow(new Failure("policy"));
});
it("requires explicit extra-usage authorization before starting native Claude", async () => {
  const config = configuration("claude-code", false);
  await expect(
    nativeWorker(
      task,
      route(task, config.candidates, false),
      config,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ kind: "approval" });
  expect(fake.spawn).not.toHaveBeenCalled();
});
it("allows explicitly authorized Claude usage with verified subscription login", async () => {
  const config = configuration();
  fake.spawn
    .mockReturnValueOnce(authenticatedChild("claude-code"))
    .mockReturnValueOnce(
      child((process) => {
        process.stdout.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              result: "answer",
              stop_reason: "end_turn",
            }),
          ),
        );
        process.emit("close", 0);
      }),
    );
  await expect(
    nativeWorker(
      task,
      route(task, config.candidates, true),
      config,
      new AbortController().signal,
    ),
  ).resolves.toBe("answer");
  expect(fake.spawn).toHaveBeenCalledTimes(2);
});
it.each(["claude-code", "codex-cli"])(
  "preserves %s provider denials when cancellation precedes exit",
  async (provider) => {
    const config = configuration(provider);
    const controller = new AbortController();
    const worker = child((process) => {
      const output =
        provider === "claude-code"
          ? {
              type: "result",
              subtype: "error_during_execution",
              is_error: true,
              errors: ["cyberPolicy: request denied"],
            }
          : {
              type: "turn.failed",
              error: { message: "cyberPolicy: request denied" },
            };
      process.stdout.emit("data", Buffer.from(JSON.stringify(output)));
      controller.abort();
      process.emit("close", null);
    });
    fake.spawn
      .mockReturnValueOnce(authenticatedChild(provider))
      .mockReturnValueOnce(worker);
    await expect(
      nativeWorker(
        task,
        route(task, config.candidates, true),
        config,
        controller.signal,
      ),
    ).rejects.toMatchObject({ kind: "policy" });
    expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  },
);
it.each([
  ["429 quota exceeded", "quota"],
  ["approval required", "approval"],
])("preserves native %s failure during abort", async (message, kind) => {
  const config = configuration();
  const controller = new AbortController();
  fake.spawn
    .mockReturnValueOnce(authenticatedChild("claude-code"))
    .mockReturnValueOnce(
      child((process) => {
        process.stdout.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              type: "result",
              subtype: "error_during_execution",
              is_error: true,
              errors: [message],
            }),
          ),
        );
        controller.abort();
        process.emit("close", null);
      }),
    );
  await expect(
    nativeWorker(
      task,
      route(task, config.candidates, true),
      config,
      controller.signal,
    ),
  ).rejects.toMatchObject({ kind });
});
it("keeps incomplete cancelled output interrupted", async () => {
  const config = configuration();
  const controller = new AbortController();
  fake.spawn
    .mockReturnValueOnce(authenticatedChild("claude-code"))
    .mockReturnValueOnce(
      child((process) => {
        process.stdout.emit("data", Buffer.from('{"partial":'));
        controller.abort();
        process.emit("close", null);
      }),
    );
  await expect(
    nativeWorker(
      task,
      route(task, config.candidates, true),
      config,
      controller.signal,
    ),
  ).rejects.toMatchObject({ kind: "interrupted" });
});
it("retains later Codex denials after an earlier retryable event", () => {
  const events = [
    { type: "error", message: "429 rate limit" },
    { type: "turn.failed", error: { message: "cyberPolicy: denied" } },
  ];
  expect(() =>
    nativeOutput("codex-cli", events.map((e) => JSON.stringify(e)).join("\n")),
  ).toThrow("Worker failure: policy");
});
it("merges stderr denials with nonzero-exit stdout failures", async () => {
  const config = configuration("codex-cli");
  fake.spawn
    .mockReturnValueOnce(authenticatedChild("codex-cli"))
    .mockReturnValueOnce(
      child((process) => {
        process.stdout.emit(
          "data",
          Buffer.from(JSON.stringify({ type: "error", message: "429 quota" })),
        );
        process.stderr.emit("data", Buffer.from("cyberPolicy: denied"));
        process.emit("close", 1);
      }),
    );
  await expect(
    nativeWorker(
      task,
      route(task, config.candidates, true),
      config,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ kind: "policy" });
});
it("preserves complete denial events alongside truncated transport output", () => {
  for (const output of [
    '{"partial":\n' +
      JSON.stringify({
        type: "turn.failed",
        error: { message: "cyberPolicy" },
      }),
    JSON.stringify({ type: "turn.failed", error: { message: "cyberPolicy" } }) +
      '\n{"partial":',
  ]) {
    expect(() => nativeOutput("codex-cli", output)).toThrow(
      "Worker failure: policy",
    );
  }
});
