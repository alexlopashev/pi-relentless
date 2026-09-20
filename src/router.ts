import { z } from "zod";
import { managedLocalSchema } from "./managed-local-config.js";
import {
  observationsSchema,
  optimizationSchema,
  rankRoutes,
} from "./model-evidence.js";
export const efforts = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
const effortSchema = z.enum(efforts);
const candidateSchema = z.strictObject({
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  billing: z.enum(["subscription", "metered", "local"]),
  enabled: z.boolean(),
  quality: z.number().int().min(1).max(3),
  preference: z.number().int().nonnegative(),
  efforts: z.array(effortSchema).min(1),
});
export const taskSchema = z.strictObject({
  id: z.string().min(1),
  prompt: z.string().min(1),
  minQuality: z.number().int().min(1).max(3),
  effort: effortSchema,
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  optimization: optimizationSchema.optional(),
});
export const tasksSchema = z
  .array(taskSchema)
  .min(1)
  .refine(
    (tasks) => new Set(tasks.map((t) => t.id)).size === tasks.length,
    "Task IDs must be unique",
  );
export const configSchema = z
  .strictObject({
    candidates: z.array(candidateSchema).min(1),
    maxConcurrency: z.number().int().min(1).max(16).default(2),
    allowMetered: z.boolean().default(false),
    readOnlyAuth: z.boolean().optional(),
    managedLocal: managedLocalSchema.optional(),
    observations: observationsSchema.optional(),
    timeoutMs: z.number().int().min(100).max(3_600_000).default(120_000),
  })
  .refine(
    (config) =>
      config.candidates.every((c) => {
        if (c.provider !== "relentless-local") return c.billing !== "local";
        return (
          c.billing === "local" &&
          c.model === "qwen3.5-4b" &&
          c.efforts.every((effort) => effort === "off") &&
          config.maxConcurrency === 1
        );
      }),
    "Local inference requires relentless-local/qwen3.5-4b, local billing, effort off, and concurrency 1",
  )
  .refine(
    (config) =>
      new Set(config.candidates.map((c) => c.name)).size ===
      config.candidates.length,
    "Candidate names must be unique",
  );
export type Candidate = z.infer<typeof candidateSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Config = z.infer<typeof configSchema>;
export interface Route {
  candidate: Candidate;
  effort: z.infer<typeof effortSchema>;
}
/** Quality is a user policy tier, not a claim about benchmark performance. */
export function eligibleRoutes(
  task: Task,
  candidates: Candidate[],
  allowMetered: boolean,
): Route[] {
  const eligible = candidates.filter(
    (c) =>
      c.enabled &&
      c.quality >= task.minQuality &&
      (allowMetered || c.billing !== "metered") &&
      (task.provider === undefined || task.provider === c.provider) &&
      (task.model === undefined || task.model === c.model),
  );
  eligible.sort(
    (a, b) =>
      a.quality - b.quality ||
      a.preference - b.preference ||
      a.name.localeCompare(b.name),
  );
  const minimum = efforts.indexOf(task.effort);
  const routes: Route[] = [];
  for (const candidate of eligible) {
    if (task.optimization) {
      for (const effort of efforts.slice(minimum)) {
        if (candidate.efforts.includes(effort)) {
          routes.push({ candidate, effort });
        }
      }
    } else {
      const effort = efforts
        .slice(minimum)
        .find((effort) => candidate.efforts.includes(effort));
      if (effort !== undefined) routes.push({ candidate, effort });
    }
  }
  return routes;
}
export function route(
  task: Task,
  candidates: Candidate[],
  allowMetered: boolean,
  observations: unknown = [],
  now: number = Date.now(),
): Route {
  const routes = eligibleRoutes(task, candidates, allowMetered);
  if (task.optimization) {
    const best = rankRoutes(routes, observations, task.optimization, now)[0];
    if (best) return best.route;
    throw new Error(
      `No eligible route has sufficient current evidence for ${task.id}`,
    );
  }
  if (routes[0]) return routes[0];
  throw new Error(
    `No eligible route for ${task.id}; check quality, provider, effort, access, and billing policy`,
  );
}
