import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  discoverLocalModels,
  localDiscoverySchema,
} from "../src/local-discovery.js";

test("discovers installed and loaded models without inference or ambient credentials", async () => {
  const request = vi.fn<typeof fetch>((input, init) => {
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toEqual({ Accept: "application/json" });
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let body: unknown;
    if (url.endsWith("/api/tags"))
      body = {
        models: [
          { name: "qwen:4b", details: { quantization_level: "Q4_K_M" } },
          { name: "other:8b" },
          { name: "cloud:cloud", remote_host: "https://example.test" },
        ],
      };
    else if (url.endsWith("/api/ps"))
      body = { models: [{ name: "qwen:4b", context_length: 8192 }] };
    else if (url.includes("1234"))
      body = {
        models: [
          {
            type: "llm",
            key: "local/model",
            max_context_length: 32768,
            loaded_instances: [],
          },
          {
            type: "llm",
            key: "local/loaded",
            loaded_instances: [{ config: { context_length: 4096 } }],
          },
          { type: "embedding", key: "embed" },
        ],
      };
    else body = { data: [{ id: "qwen3.5-4b" }] };
    return Promise.resolve(Response.json(body));
  });
  const result = await discoverLocalModels(undefined, undefined, request);
  expect(request).toHaveBeenCalledTimes(4);
  expect(result.backends[0]?.models).toMatchObject([
    { id: "qwen:4b", installed: true, loaded: true, contextWindow: 8192 },
    { id: "other:8b", installed: true, loaded: false },
  ]);
  expect(result.backends[0]?.excludedRemote).toBe(1);
  expect(result.backends[1]?.models).toMatchObject([
    { id: "local/model", installed: true, loaded: false },
    { id: "local/loaded", loaded: true, contextWindow: 4096 },
  ]);
  expect(result.backends[2]?.models).toMatchObject([
    { id: "qwen3.5-4b", installed: null, loaded: null },
  ]);
  expect(result.inferenceRun).toBe(false);
});

test("isolates unreachable and protected servers and preserves unknown load state", async () => {
  const request = vi.fn<typeof fetch>((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.endsWith("/api/tags"))
      return Promise.resolve(Response.json({ models: [{ name: "local" }] }));
    if (url.endsWith("/api/ps"))
      return Promise.reject(Error("private server error"));
    if (url.includes("1234"))
      return Promise.resolve(new Response("secret", { status: 401 }));
    return Promise.reject(Error("private path"));
  });
  const result = await discoverLocalModels(undefined, undefined, request);
  expect(result.backends[0]?.models[0]?.loaded).toBeNull();
  expect(result.backends[0]?.loadedStatus).toBe("unreachable");
  expect(result.backends[1]?.status).toBe("auth_required");
  expect(result.backends[2]?.status).toBe("unreachable");
  expect(JSON.stringify(result)).not.toMatch(/secret|private/);
});

test("rejects non-loopback settings before requests, and supports disabling discovery", async () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.1.evil.test",
    "http://user:secret@127.0.0.1",
    "http://127.0.0.1/path",
    "http://127.0.0.1?token=x",
    "file:///tmp/model",
  ]) {
    expect(() =>
      localDiscoverySchema.parse({ endpoints: [{ backend: "ollama", url }] }),
    ).toThrow();
  }
  const request = vi.fn<typeof fetch>();
  expect(
    (await discoverLocalModels({ enabled: false }, undefined, request))
      .backends,
  ).toEqual([]);
  expect(request).not.toHaveBeenCalled();
  await expect(
    discoverLocalModels(undefined, AbortSignal.abort(), request),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

test("bounds untrusted response bodies and model output", async () => {
  const config = {
    endpoints: [{ backend: "lmstudio" as const, url: "http://127.0.0.1:1234" }],
  };
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("x".repeat(262145)));
  expect(
    (await discoverLocalModels(config, undefined, request)).backends[0]?.status,
  ).toBe("invalid_response");
  request.mockResolvedValue(
    Response.json({
      models: Array.from({ length: 55 }, (_, i) => ({
        type: "llm",
        key: `model-${String(i)}`,
        loaded_instances: [],
      })),
    }),
  );
  const backend = (await discoverLocalModels(config, undefined, request))
    .backends[0];
  expect(backend?.models).toHaveLength(50);
  expect(backend?.truncated).toBe(true);
  request.mockResolvedValue(
    Response.json({ models: [{ type: "llm", key: "bad\ncontrol" }] }),
  );
  expect(
    (await discoverLocalModels(config, undefined, request)).backends[0]?.status,
  ).toBe("invalid_response");
});

test("does not probe local services after registry access revokes project trust", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "local-discovery-trust-"));
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", request);
  let trusted = true;
  try {
    await relentlessCommand("inventory", {
      cwd: root,
      isProjectTrusted: () => trusted,
      models: () => {
        trusted = false;
        return { available: [], scoped: [] };
      },
      ui: { notify: () => undefined },
    });
    expect(request).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  }
});

test("real HTTP discovery respects deadlines, cancellation and refused redirects", async () => {
  const { createServer } = await import("node:http");
  let mode = "ok";
  let redirected = false;
  const server = createServer((req, res) => {
    expect(req.method).toBe("GET");
    expect(req.headers.authorization).toBeUndefined();
    if (req.url === "/elsewhere") {
      redirected = true;
      res.end("{}");
      return;
    }
    if (mode === "stall") return;
    if (mode === "redirect") {
      res.writeHead(302, { Location: "/elsewhere" });
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        models: [{ type: "llm", key: "local", loaded_instances: [] }],
      }),
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const config = {
    endpoints: [
      {
        backend: "lmstudio" as const,
        url: `http://127.0.0.1:${String(address.port)}`,
      },
    ],
  };
  try {
    expect((await discoverLocalModels(config)).backends[0]?.models[0]?.id).toBe(
      "local",
    );
    mode = "redirect";
    expect((await discoverLocalModels(config)).backends[0]?.status).toBe(
      "unreachable",
    );
    expect(redirected).toBe(false);
    mode = "stall";
    const started = performance.now();
    expect((await discoverLocalModels(config)).backends[0]?.status).toBe(
      "unreachable",
    );
    expect(performance.now() - started).toBeLessThan(3500);
    const controller = new AbortController();
    const pending = discoverLocalModels(config, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

test("later inventory pages do not repeat discovery", async () => {
  const { relentlessCommand } = await import("../src/pi-extension.js");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "local-discovery-page-"));
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  try {
    await relentlessCommand("inventory 20", {
      cwd: root,
      isProjectTrusted: () => true,
      models: () => ({ available: [], scoped: [] }),
      ui: { notify: () => undefined },
    });
    expect(request).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  }
});
