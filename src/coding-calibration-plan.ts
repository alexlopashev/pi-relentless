import { z } from "zod";
import { codingSchema } from "./coding-worker.js";
import { configSchema, route, type Route } from "./router.js";
import { reviewRequestSchema } from "./coding-review.js";
import { executionSchema } from "./workflow-verification.js";
import { canonicalDigest } from "./verification-assessment.js";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const caseSchema = z.strictObject({
  id: z.string().min(1).max(200),
  request: codingSchema,
  sourceHashes: z.record(z.string(), hash.nullable()),
  execution: executionSchema,
});
export const codingCalibrationSchema = z.strictObject({
  version: z.literal(1),
  measurement: z.enum(["author-attempts-v1", "workflow-active-v1"]).optional(),
  id: z.string().min(1).max(200),
  workload: z.string().min(1).max(200),
  repeats: z.number().int().min(1).max(3),
  config: configSchema,
  review: reviewRequestSchema,
  maxReviewPairs: z.number().int().min(1).max(5),
  cases: z.array(caseSchema).min(2).max(10),
});

export interface CodingCalibrationPlan {
  contract: z.infer<typeof codingCalibrationSchema>;
  contractSha256: string;
  suiteHash: string;
  trials: {
    id: string;
    index: number;
    repeat: number;
    caseId: string;
    selection: Route;
  }[];
}

export function planCodingCalibration(input: unknown): CodingCalibrationPlan {
  const contract = codingCalibrationSchema.parse(input);
  if (
    contract.config.candidates.length > 10 ||
    contract.review.config.candidates.length > 10
  ) {
    throw new Error("Too many candidates");
  }
  if (
    contract.cases.some((c) => c.request.task.optimization !== undefined) ||
    contract.review.task.optimization !== undefined
  ) {
    throw new Error("Optimization is not permitted in calibration tasks");
  }
  if (new Set(contract.cases.map((c) => c.id)).size !== contract.cases.length) {
    throw new Error("Case IDs must be unique");
  }

  const routes: Route[][] = [];
  for (const item of contract.cases) {
    const paths = item.request.files.map((file) => file.path);
    const keys = Object.keys(item.sourceHashes);
    const testPaths = Object.keys(item.execution.package.tests);
    const names = [...paths, ...testPaths];
    const entrypoint = item.execution.package.entrypoint;
    if (
      !testPaths.includes(entrypoint) ||
      !/\.(?:[cm]?[jt]s)$/.test(entrypoint) ||
      new Set(names).size !== names.length ||
      names.some((name) => names.some((other) => other.startsWith(`${name}/`)))
    )
      throw new Error(
        "Declared file namespace or entrypoint cannot be packaged",
      );

    if (
      paths.length !== keys.length ||
      paths.some(
        (path) =>
          !Object.prototype.hasOwnProperty.call(item.sourceHashes, path),
      )
    ) {
      throw new Error(`Source pins do not match files for ${item.id}`);
    }
    if (
      item.request.files.some(
        (file) =>
          (file.create === true) !== (item.sourceHashes[file.path] === null),
      )
    )
      throw new Error("Source absence pin does not match declaration");
    const cohort: Route[] = [];
    for (const candidate of contract.config.candidates) {
      try {
        cohort.push(
          route(
            item.request.task,
            [candidate],
            contract.config.allowMetered,
            contract.config.observations,
          ),
        );
      } catch {
        // Ineligible candidates are skipped.
      }
    }
    if (cohort.length === 0) throw new Error(`No route for ${item.id}`);
    routes.push(cohort);
  }
  const identity = (r: Route): string =>
    JSON.stringify([
      r.candidate.provider,
      r.candidate.model,
      r.candidate.billing,
      r.effort,
    ]);
  const firstRoutes = routes[0];
  if (!firstRoutes) throw new Error("Missing cohort");
  const firstIdentities = firstRoutes.map(identity);
  if (
    new Set(firstIdentities).size !== firstIdentities.length ||
    routes.some(
      (rs) =>
        JSON.stringify(rs.map(identity)) !== JSON.stringify(firstIdentities),
    )
  )
    throw new Error("Cases must share one ordered route cohort");
  for (const author of firstRoutes) {
    const eligible = contract.review.config.candidates.filter(
      (c) => c.provider !== author.candidate.provider,
    );
    const first = route(
      contract.review.task,
      eligible,
      contract.review.config.allowMetered,
      contract.review.config.observations,
    );
    route(
      contract.review.task,
      eligible.filter((c) => c.provider !== first.candidate.provider),
      contract.review.config.allowMetered,
      contract.review.config.observations,
    );
  }

  const contractSha256 = canonicalDigest(contract);
  const suite = {
    version: 1,
    ...(contract.measurement ? { measurement: contract.measurement } : {}),
    workload: contract.workload,
    codingPolicy: {
      timeoutMs: contract.config.timeoutMs,
      maxConcurrency: contract.config.maxConcurrency,
      readOnlyAuth: contract.config.readOnlyAuth ?? false,
      ...(contract.config.managedLocal
        ? { managedLocal: contract.config.managedLocal }
        : {}),
    },
    review: contract.review,
    maxReviewPairs: contract.maxReviewPairs,
    cases: contract.cases.map((item) => ({
      id: item.id,
      task: item.request.task,
      context: item.request.context ?? null,
      files: item.request.files,
      maxAttempts: item.request.maxAttempts,
      sourceHashes: item.sourceHashes,
      verification: {
        emulator: item.execution.package.emulator.sha256,
        kernel: item.execution.package.kernel.sha256,
        baseImage: item.execution.package.baseImage.sha256,
        tests: Object.fromEntries(
          Object.entries(item.execution.package.tests).map(
            ([name, artifact]) => [name, artifact.sha256],
          ),
        ),
        entrypoint: item.execution.package.entrypoint,
        wallSeconds: item.execution.package.wallSeconds,
        outputBytes: item.execution.package.outputBytes,
        acceptance: item.execution.acceptance,
      },
    })),
  };
  const suiteHash = canonicalDigest(suite);
  const count =
    contract.repeats * contract.cases.length * firstIdentities.length;
  if (count > 30) throw new Error("Trial budget exceeded");
  const trials: CodingCalibrationPlan["trials"] = [];
  for (let repeat = 0; repeat < contract.repeats; repeat++)
    for (const [ci, item] of contract.cases.entries()) {
      const cohort = routes[ci];
      if (!cohort) throw new Error("Missing cohort");
      for (const selection of cohort) {
        const index = trials.length;
        trials.push({
          id: canonicalDigest({ contractSha256, index }),
          index,
          repeat,
          caseId: item.id,
          selection,
        });
      }
    }
  // This plans DECLARED pins; it does not verify bytes or authorize execution. A future runner must verify source/runtime/test bytes, reserve trials, and require actual reviewed VM evidence.
  return { contract, contractSha256, suiteHash, trials };
}
