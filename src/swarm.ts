import {
  configSchema,
  route,
  tasksSchema,
  type Route,
  type Task,
} from "./router.js";
export type Worker = (
  task: Task,
  selection: Route,
  signal?: AbortSignal,
  onCostEstimate?: (estimatedUsd: number) => void,
) => Promise<string>;
export type Result = { taskId: string; route: Route } & (
  { status: "completed"; output: string } | { status: "failed"; error: string }
);
/** Preflight the whole batch, then use a bounded worker pool. No automatic retries. */
export async function runSwarm(
  input: unknown,
  configuration: unknown,
  worker: Worker,
): Promise<Result[]> {
  const tasks = tasksSchema.parse(input);
  const config = configSchema.parse(configuration);
  const jobs = tasks.map((task) => ({
    task,
    selection: route(
      task,
      config.candidates,
      config.allowMetered,
      config.observations,
    ),
  }));
  const results = new Map<string, Result>();
  let next = 0;
  async function consume(): Promise<void> {
    for (;;) {
      const job = jobs[next++];
      if (!job) return;
      const base = { taskId: job.task.id, route: job.selection };
      try {
        const output = await worker(job.task, job.selection);
        results.set(job.task.id, { ...base, status: "completed", output });
      } catch (error) {
        results.set(job.task.id, {
          ...base,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Worker failed without an Error object",
        });
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(config.maxConcurrency, jobs.length) },
      consume,
    ),
  );
  return tasks.flatMap((task) => {
    const result = results.get(task.id);
    return result ? [result] : [];
  });
}
