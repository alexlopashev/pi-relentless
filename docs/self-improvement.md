# Assisted self-improvement

Clanker has completed its first bounded self-improvement cycle on its own failure classifier. The models ran through Clanker's actual CLI and Pi adapter; the outer coding assistant supplied source snapshots, selected/reproduced the finding, applied the patch and ran checks. This is assisted self-improvement, not an autonomous self-modifying daemon.

## Cycle 001: authentication evidence takes precedence

1. Qwen3.8 Flash reviewed `src/failures.ts` and its existing tests using `clanker swarm`. It identified that `fromProviderError({code: "rateLimitExceeded", message: "401 Unauthorized"})` returned `quota` instead of `auth`.
2. The regression reproduced that exact failure before the implementation change. A one-line fix includes recognized authentication messages in the existing precedence merge. Unknown prose still cannot suppress a known transient code, and policy/permission evidence stays stronger than authentication.
3. A supervisor regression verifies that the task enters `waiting_input`, makes one attempt, does not cool down the provider as if quota were exhausted, and does not dispatch the configured alternative.
4. A separate GPT-5.6 Luna worker through Clanker reviewed the final source/tests and the original finding. It returned `pass` with no findings. The final reviewed source was checked against the review request and hashed locally.
5. Full `mise run ci` passed: 100 Vitest tests, format, type-aware lint, types, build, ShellCheck, lifecycle and two subprocess fault tests.

The discovery worker incorrectly described the impact as infinite retries; Clanker already bounds attempts. That claim was rejected. Its broad suggested merge of all unknown errors was also not adopted. Model output remained evidence, and deterministic reproduction established the actual defect.

Artifacts (ignored local files, no credentials):

- Discovery run: `.harness/runs/2cdcc1a6-a475-4156-ad37-ae8252fa1c69/`
- Independent review: `.harness/runs/e972f0ae-4ca9-43ad-b8ff-497f9a4bf80e/`
- Before snapshots, input configs and final hashes: `.harness/self-improve-001/`

This user-initiated cycle made two tool-free model calls, one through Alibaba Personal and one through OpenAI Codex. It did not start a background service, change spend/permission boundaries, commit, publish or grant workers shell access.

## Repeatable operating pattern

Select one concrete issue → supply minimal source/test evidence → request a model finding → reproduce it with a failing test → implement the smallest fix → independent model review of the final revision → deterministic gate → retain the evidence and update the backlog. Review success alone does not authorize integration or establish correctness.

For autonomous patch application, the missing next step is a coding worker restricted to an isolated worktree or disposable fixture, with explicit command permissions, patch/checkpoint capture and exact-revision verification. Keep the supervisor's rules and credentials outside that worker's write scope. Existing route permissions, model floors and budgets must remain binding throughout self-improvement.

Two separately observed classifier cases are follow-up candidates, not fixed by this cycle: inherited object-property error codes such as `constructor`, and wrapped HTTP403 combined with approval prose. Each needs its own regression and scoped review before a change. General model-driven task selection and automatic backlog execution remain unimplemented.

The initial [bounded coding worker](coding-workers.md) now performs file replacement and syntax-check feedback itself. It exports reviewable changes from a private copy. Behavioral test execution, durable repair recovery and automatic integration remain outstanding.

Cycle 002 now uses Clanker coding workers to author and repair its own evidence ranker, with external integration/gates and independent reviews. See the [active program](self-improvement-program.md) and [measured routing](model-efficiency.md).
