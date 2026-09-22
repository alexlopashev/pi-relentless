import { z } from "zod";

const backendSchema = z.enum(["ollama", "lmstudio", "llamacpp"]);
const endpointSchema = z.strictObject({
  backend: backendSchema,
  url: z
    .string()
    .max(256)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "http:" &&
          ["127.0.0.1", "[::1]"].includes(url.hostname) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === "/"
        );
      } catch {
        return false;
      }
    }, "Use an HTTP loopback origin without credentials, path, query or fragment"),
});
export const localDiscoverySchema = z.strictObject({
  enabled: z.boolean().optional(),
  endpoints: z.array(endpointSchema).min(1).max(8).optional(),
});
const defaults: z.infer<typeof endpointSchema>[] = [
  { backend: "ollama", url: "http://127.0.0.1:11434" },
  { backend: "lmstudio", url: "http://127.0.0.1:1234" },
  { backend: "llamacpp", url: "http://127.0.0.1:18080" },
];
const label = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 32 || code === 127) return false;
    }
    return true;
  }, "Control characters are not allowed");
const contextSize = z.number().int().positive().optional();
const ollamaModels = z.object({
  models: z.array(
    z.object({
      name: label,
      remote_host: z.string().nullable().optional(),
      remote_model: z.string().nullable().optional(),
      details: z.object({ quantization_level: label.optional() }).optional(),
    }),
  ),
});
const ollamaRunning = z.object({
  models: z.array(z.object({ name: label, context_length: contextSize })),
});
const lmModels = z.object({
  models: z.array(
    z.object({
      type: z.enum(["llm", "embedding"]),
      key: label,
      max_context_length: contextSize,
      quantization: z
        .object({ name: label.nullable().optional() })
        .nullable()
        .optional(),
      loaded_instances: z
        .array(
          z.object({
            config: z.object({ context_length: contextSize }).optional(),
          }),
        )
        .optional(),
    }),
  ),
});
const servedModels = z.object({ data: z.array(z.object({ id: label })) });
type Status =
  | "reachable"
  | "unreachable"
  | "auth_required"
  | "http_error"
  | "invalid_response";
export interface LocalModel {
  id: string;
  installed: boolean | null;
  loaded: boolean | null;
  contextWindow: number | null;
  quantization: string | null;
}
export interface LocalBackend {
  backend: z.infer<typeof backendSchema>;
  endpoint: string;
  status: Status;
  loadedStatus: Status | null;
  models: LocalModel[];
  excludedRemote: number;
  truncated: boolean;
}
class ResponseFailure extends Error {
  constructor(readonly status: Status) {
    super(status);
  }
}
async function readJson(
  url: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(1500);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await request(url, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: combined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ResponseFailure(
      response.status === 401 || response.status === 403
        ? "auth_required"
        : "http_error",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ResponseFailure("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 262144) throw new ResponseFailure("invalid_response");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
function statusOf(error: unknown): Status {
  if (error instanceof ResponseFailure) return error.status;
  if (error instanceof SyntaxError || error instanceof z.ZodError)
    return "invalid_response";
  return "unreachable";
}
/** Only bounded model-list GETs. Never starts processes, loads weights or dispatches inference. */
export async function discoverLocalModels(
  input?: z.input<typeof localDiscoverySchema>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<{
  observedAt: number;
  inferenceRun: false;
  backends: LocalBackend[];
}> {
  signal?.throwIfAborted();
  const config = localDiscoverySchema.parse(input ?? {});
  const endpoints =
    config.enabled === false ? [] : (config.endpoints ?? defaults);
  const backends = await Promise.all(
    endpoints.map(async (endpoint) => {
      const result: LocalBackend = {
        backend: endpoint.backend,
        endpoint: endpoint.url,
        status: "reachable",
        loadedStatus: null,
        models: [],
        excludedRemote: 0,
        truncated: false,
      };
      const get = (path: string) =>
        readJson(new URL(path, endpoint.url).href, signal, request);
      try {
        if (endpoint.backend === "ollama") {
          const [tags, running] = await Promise.allSettled([
            get("/api/tags").then((value) => ollamaModels.parse(value)),
            get("/api/ps").then((value) => ollamaRunning.parse(value)),
          ]);
          if (tags.status === "rejected") throw tags.reason;
          result.loadedStatus =
            running.status === "fulfilled"
              ? "reachable"
              : statusOf(running.reason);
          const active = new Map(
            running.status === "fulfilled"
              ? running.value.models.map((model) => [model.name, model])
              : [],
          );
          for (const model of tags.value.models) {
            if (
              model.remote_host ||
              model.remote_model ||
              /[:-]cloud$/u.test(model.name)
            ) {
              result.excludedRemote++;
              continue;
            }
            const loaded = active.get(model.name);
            result.models.push({
              id: model.name,
              installed: true,
              loaded:
                running.status === "fulfilled" ? loaded !== undefined : null,
              contextWindow: loaded?.context_length ?? null,
              quantization: model.details?.quantization_level ?? null,
            });
          }
        } else if (endpoint.backend === "lmstudio") {
          const models = lmModels.parse(await get("/api/v1/models"));
          result.models = models.models
            .filter((model) => model.type === "llm")
            .map((model) => ({
              id: model.key,
              installed: true,
              loaded:
                model.loaded_instances === undefined
                  ? null
                  : model.loaded_instances.length > 0,
              contextWindow:
                model.loaded_instances?.[0]?.config?.context_length ??
                model.max_context_length ??
                null,
              quantization: model.quantization?.name ?? null,
            }));
        } else {
          const models = servedModels.parse(await get("/v1/models"));
          result.models = models.data.map((model) => ({
            id: model.id,
            installed: null,
            loaded: null,
            contextWindow: null,
            quantization: null,
          }));
        }
        result.models = [
          ...new Map(result.models.map((model) => [model.id, model])).values(),
        ];
        result.truncated = result.models.length > 50;
        result.models = result.models.slice(0, 50);
      } catch (error) {
        result.status = statusOf(error);
      }
      return result;
    }),
  );
  signal?.throwIfAborted();
  return { observedAt: Date.now(), inferenceRun: false, backends };
}
