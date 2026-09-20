import { isAbsolute } from "node:path";
import { z } from "zod";

const artifactSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => !value.includes("\0") && isAbsolute(value)),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const managedLocalSchema = z
  .object({
    libraries: z
      .record(z.string().regex(/^[a-zA-Z0-9_.-]+\.dylib$/u), artifactSchema)
      .refine((value) => Object.keys(value).length <= 64),
    executable: artifactSchema,
    model: artifactSchema,
    startupMs: z.number().int().min(1000).max(120000),
  })
  .strict();

export type ManagedLocalConfig = z.infer<typeof managedLocalSchema>;

export function managedLocalArgs(
  config: ManagedLocalConfig,
  key: string,
): string[] {
  return [
    "-m",
    config.model.path,
    "--alias",
    "qwen3.5-4b",
    "--host",
    "127.0.0.1",
    "--port",
    "18080",
    "-c",
    "8192",
    "-np",
    "1",
    "-t",
    "2",
    "-ngl",
    "0",
    "--device",
    "none",
    "--no-op-offload",
    "--jinja",
    "--reasoning",
    "off",
    "-n",
    "512",
    "--api-key",
    key,
  ];
}
