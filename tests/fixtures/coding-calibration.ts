export const c = (name: string) => ({
  name,
  provider: name,
  model: name,
  billing: "subscription",
  enabled: true,
  quality: 1,
  preference: 1,
  efforts: ["low"],
});
export const artifact = { path: "/pinned/file", sha256: "a".repeat(64) };
export function fixture() {
  const task = {
    id: "repair",
    prompt: "Correct the function",
    minQuality: 1,
    effort: "low",
  };
  return {
    version: 1,
    id: "cohort-one",
    workload: "numeric-repairs-v1",
    repeats: 2,
    config: { candidates: [c("a"), c("b")] },
    review: {
      task: { ...task, id: "review" },
      config: { candidates: [c("review-a"), c("review-b")] },
    },
    maxReviewPairs: 1,
    cases: ["add", "clamp"].map((id) => ({
      id,
      request: {
        sourceRoot: "/project",
        task: { ...task, id },
        files: [{ path: "x.ts", writable: true }],
        maxAttempts: 1,
      },
      sourceHashes: { "x.ts": "b".repeat(64) },
      execution: {
        package: {
          version: 1,
          emulator: artifact,
          kernel: artifact,
          baseImage: artifact,
          tests: { "test.mjs": artifact },
          entrypoint: "test.mjs",
          wallSeconds: 30,
          outputBytes: 4096,
        },
        acceptance: { kind: "test_process_exit", expected: 0 },
      },
    })),
  };
}
