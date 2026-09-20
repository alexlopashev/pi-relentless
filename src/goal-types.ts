import { codingSchema } from "./coding-worker.js";
import { goalWorkProgressSchema } from "./goal-work-progress-schema.js";
import { goalWorkAdmissionSchema } from "./goal-work-admission-schema.js";
import { z } from "zod";
import { configSchema, taskSchema } from "./router.js";
import { failureKind } from "./failures.js";
const text = z.string().min(1).max(32000);
export const acceptanceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("workflow"),
    work: z
      .strictObject({
        files: codingSchema.shape.files.refine(
          (files) =>
            new Set(files.map((f) => f.path)).size === files.length &&
            files.some((f) => f.writable),
          "Unique files and a writable target required",
        ),
        verificationFile: z.string().min(1).max(4096),
        integration: z.enum(["manual", "verified"]).optional(),
      })
      .optional(),
    specificationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reviewTask: taskSchema,
    maxReviewPairs: z.number().int().min(1).max(5),
  }),
  z.strictObject({
    kind: z.literal("json"),
    equals: z
      .record(
        z.string().min(1),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .refine((v) => Object.keys(v).length > 0),
  }),
  z.strictObject({
    kind: z.literal("contains"),
    values: z.array(text).min(1).max(30),
  }),
]);
const memorySchema = z
  .strictObject({
    id: z.string().min(1).max(200),
    kind: z.enum(["instruction", "fact", "hypothesis"]),
    authority: z.enum(["user", "observation", "agent"]),
    text,
    source: text,
    scope: z.string().default("goal"),
    verified: z.boolean().default(false),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .refine(
    (m) => m.kind !== "instruction" || m.authority === "user",
    "Only user records can add instructions",
  );
export const contractSchema = z
  .strictObject({
    objective: text,
    constraints: z.array(text).max(100),
    config: configSchema,
    tasks: z
      .array(
        taskSchema.extend({
          model: z.string().min(1).optional(),
          dependsOn: z.array(z.string().min(1)).default([]),
          allowedCandidates: z.array(z.string().min(1)).min(1).optional(),
          acceptance: acceptanceSchema,
        }),
      )
      .min(1)
      .max(100),
    memories: z.array(memorySchema).max(100).default([]),
    maxAttempts: z.number().int().min(1).max(1000).default(20),
    retryBaseMs: z.number().int().min(100).max(3600000).default(30000),
    retryMaxMs: z.number().int().min(100).max(86400000).default(3600000),
    deadlineAt: z.number().int().nonnegative().optional(),
  })
  .superRefine((c, ctx) => {
    const ids = new Set(c.tasks.map((t) => t.id));
    if (ids.size !== c.tasks.length)
      ctx.addIssue({ code: "custom", message: "Duplicate task IDs" });
    if (new Set(c.memories.map((m) => m.id)).size !== c.memories.length)
      ctx.addIssue({ code: "custom", message: "Duplicate memory IDs" });
    if (c.retryMaxMs < c.retryBaseMs)
      ctx.addIssue({ code: "custom", message: "Invalid retry range" });
    for (const m of c.memories)
      if (m.scope !== "goal" && !ids.has(m.scope))
        ctx.addIssue({ code: "custom", message: "Unknown memory scope" });
    const visited = new Set<string>();
    const active = new Set<string>();
    function visit(id: string): void {
      if (active.has(id)) {
        ctx.addIssue({ code: "custom", message: "Dependency cycle" });
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      active.add(id);
      for (const dep of c.tasks.find((t) => t.id === id)?.dependsOn ?? []) {
        if (!ids.has(dep))
          ctx.addIssue({ code: "custom", message: "Unknown dependency" });
        else visit(dep);
      }
      active.delete(id);
    }
    for (const t of c.tasks) {
      visit(t.id);
      if (
        t.allowedCandidates?.some(
          (name) =>
            !c.config.candidates.some((candidate) => candidate.name === name),
        )
      )
        ctx.addIssue({ code: "custom", message: "Unknown allowed candidate" });
      if (t.model && !t.provider)
        ctx.addIssue({
          code: "custom",
          message: "Exact model requires provider",
        });
    }
  });
export type Contract = z.infer<typeof contractSchema>;
export const taskStateSchema = z.strictObject({
  id: z.string(),
  status: z.enum([
    "ready",
    "running",
    "waiting_retry",
    "waiting_capacity",
    "waiting_input",
    "blocked_policy",
    "blocked_constraints",
    "completed",
  ]),
  attempts: z.number().int().nonnegative(),
  noProgress: z.number().int().nonnegative().default(0),
  dueAt: z.number().nonnegative(),
  reason: z.string(),
  attemptId: z.string().optional(),
  attemptRevision: z.number().int().optional(),
  deadlineAt: z.number().optional(),
  lastOutput: z.string().max(65536).optional(),
  output: z.string().max(65536).optional(),
  outputHash: z.string().optional(),
  verifiedRevision: z.number().int().optional(),
  workflowAdmission: goalWorkAdmissionSchema.optional(),
  workflowProgress: goalWorkProgressSchema.optional(),
  lastFailure: failureKind.optional(),
  candidate: z.string().optional(),
});
export const goalSchema = z.strictObject({
  id: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(["active", "completed", "cancelled", "superseded"]),
  contract: contractSchema,
  tasks: z.array(taskStateSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  history: z.array(
    z.strictObject({
      revision: z.number(),
      contract: contractSchema,
      source: z.string(),
      at: z.number(),
    }),
  ),
});
export type Goal = z.infer<typeof goalSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export const stateSchema = z.strictObject({
  version: z.literal(1),
  goals: z.array(goalSchema),
  health: z.record(
    z.string(),
    z.strictObject({
      until: z.number().nonnegative(),
      failures: z.number().int().nonnegative(),
      reason: failureKind,
    }),
  ),
  lease: z.strictObject({ owner: z.string(), until: z.number() }).nullable(),
});
export type State = z.infer<typeof stateSchema>;
export function accepted(
  output: string,
  acceptance: z.infer<typeof acceptanceSchema>,
): boolean {
  if (acceptance.kind === "workflow") return false;
  if (!output.trim() || Buffer.byteLength(output) > 65536) return false;
  if (acceptance.kind === "contains")
    return acceptance.values.every((part) => output.includes(part));
  try {
    const value: unknown = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    return Object.entries(acceptance.equals).every(
      ([key, expected]) =>
        Object.hasOwn(value, key) && Reflect.get(value, key) === expected,
    );
  } catch {
    return false;
  }
}
