# Validation evidence

Date: 2026-09-16. Environment: macOS arm64, Node 24.21.0 via pinned mise tools for the final gate. Initial setup used the app's bundled Node 24.19.0 and emitted an engine warning; final validation used the pinned toolchain.

## Red → green

1. Routing and pool tests initially failed because their modules did not exist; implementation made the 15 initial cases pass.
2. Billing/access tests initially failed because the adapter module did not exist; implementation passed them.
3. Independent reviewer `foundation_review` identified a hanging cancellation path and truncated answers reported as complete.
4. Added regression tests reproduced both failures: `still pending` instead of `deadline`, and a resolved partial answer instead of rejection.
5. Added an explicit deadline race and required a normal completion reason. Both passed. The same reviewer rechecked the fixes and all 10 adapter tests; no remaining blockers in that focused recheck.
6. Lifecycle test initially failed because scripts were missing, then passed after implementation. ShellCheck caught an ambiguous empty CDPATH assignment; corrected it before the final gate.

## Final checks

- `MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run ci`: passed formatting, type-aware ESLint, strict TypeScript, 29 Vitest tests, coverage thresholds, build, POSIX ShellCheck, and the lifecycle behavioral test.
- Router/scheduler coverage: 100% lines/functions/statements, 94.73% branches. This is scoped core coverage, not whole-project or live-provider coverage.
- The project-bootstrap `validate_lifecycle.py` validator: passed through mise.
- Compiled CLI `demo`: three completed, explicitly labeled offline fixture results.
- Compiled CLI `plan examples/subscriptions.json examples/brainstorm.json`: selected Astra, Grok, and Luna in expected order.
- Compiled CLI `models`: verified requested IDs in the installed Pi catalog without issuing inference.
- Bootstrap and teardown `--check`: passed when invoked by sh, bash, and zsh from this machine. Fish and Nushell were not exercised. Linux CI is configured but has not run.
- Frozen dependency installation: passed with explicitly allowed esbuild build script and denied optional Google/protobuf build scripts.

The temporary `MISE_TRUSTED_CONFIG_PATHS` setting was needed because the Codex filesystem sandbox cannot write mise's global trust cache. It did not change global trust or tool configuration. Mise emitted nonfatal cache/purgatory warnings outside the writable roots.

## Limits

At the foundation checkpoint, no provider inference, account-entitlement check, subscription-quota measurement, Claude native worker, target-repository edit, remote compute, GitHub publication, or production deploy was performed. Pi integration has mocked boundary tests plus real package type checking/catalog loading. No end-to-end provider success is claimed. SDK cancellation settles the local task but cannot guarantee immediate cessation of remote inference or billing. Reports are written at batch completion and are not yet a crash-resumable event ledger.

There is no remote or initial commit, and Git metadata is read-only here. Changes remain local and uncommitted. No bootstrap PR, wiki, GitHub milestones, or automated merge has occurred. The skill's GitHub workflow is deferred; local-first behavior follows the user's request.

## Local inference checkpoint

- Red/green: local-routing tests first failed on the missing billing category and accepted mislabeled local routes; both passed after schema/routing changes.
- A real Pi transport fixture (no model/network inference) reproduced `max_tokens: 1` with the initial 4K context. Raising the matching model/server context to 8K preserved the intended 512-token budget; the regression passed.
- Full `MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run ci` passed: 35 tests, format/lint/types/build, coverage and lifecycle checks. Scoped router/scheduler coverage: 100% lines/statements/functions, 96% branches.
- Verified SHA-256 for llama.cpp b11012 arm64 archive and exact Qwen3.5 4B Q4_K_M artifact before running; pins recorded in `local-inference.md`.
- Metal context initialization failed in this sandbox. CPU server with 8K context and one slot succeeded.
- Compiled CLI local swarm completed the retry-advice example with `{"action":"wait","delaySeconds":60}`. Result artifact: `.harness/runs/e293f6f4-ed9c-40d5-bb96-5cbe4040307f/results.json`. This was real local inference through the Pi session, not a fixture.
- Server-reported warm prompt+generation time was about 0.90 seconds, ~26.5 generated tokens/second. This single cached-prompt CPU smoke test is not a representative benchmark or model-quality evaluation.
- With the server unavailable, the compiled CLI recorded a failed task and exited 1, without falling back to a cloud route. No cloud inference was performed.
- The test server was stopped after validation; downloaded artifacts remain in ignored `.harness/local/`.
- Independent review by `foundation_review` checked Pi registration, isolated credentials, billing/effort/concurrency boundaries and tests. No remaining blockers in the final recheck, including the context-budget regression.

Automatic failover, durable retry scheduling, structured decision validation and managed server recovery remain unimplemented. The local worker cannot by itself keep a goal alive.

## Durable supervisor checkpoint

- Full `MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run ci` passed: **71 Vitest tests**, formatting, strict type-aware lint, TypeScript, build, existing scoped coverage, ShellCheck, lifecycle test and **two subprocess fault-injection tests**. Coverage percentages still cover router/swarm only; they are not a claim of whole-supervisor coverage.
- Added failing tests before the new ledger/supervisor implementation and before fixes for late denials, hard deadlines, retained rejected outputs, cancellation cleanup and lost cooldowns. Each reproduced failure was made green.
- Recovery tests cover persisted attempts/cooldowns, exact model/provider pins, authorized alternatives, independent work after policy blocks, stale contract results, task dependencies, poisoned instruction records, no-progress parking, terminal goals and stop cleanup.
- A disposable process was killed after its dispatch intent committed. A successor reconciled the intent and completed with the original goal and cumulative attempt count. No provider inference was used in this test.
- A SQLite trigger injected commit rejection. No worker was dispatched and the prior ready state survived. This is a commit-failure simulation, not a claim that a real filesystem was filled.
- Missing/corrupt checkpoint and missing/invalid restore-source cases fail closed. Validated restore uses a read-only source and an exclusive destination.
- Real local integration: goal `80639959-aa4a-45cf-861d-2ea128ab54a2` first encountered an unavailable llama.cpp server, retained its goal/budget, then rejected an invalid output, and completed on attempt 3 after a fresh CLI invocation. Accepted raw JSON was `{"action":"wait","delaySeconds":60}`; recorded output SHA-256 is `f6c07ef6f2abb60ccd5312b757b312542d9f9472650875ed0e35676a140f5a93`. No cloud inference occurred.
- The actual completed ledger was backed up to ignored `.harness/backups/durability-verified.sqlite`, restored into a disposable directory and checked: completed state and all three attempts survived. The disposable restore was removed; the original and backup remain.
- Generated launchd plist passed `plutil -lint`. It was not installed; the sandbox cannot write the user's LaunchAgents directory. No login/reboot or Linux service run is claimed.
- Independent reviews identified late-denial, missing-checkpoint, cancellation and cooldown races. Fixes were reproduced and regression-tested. Final independent reviewer `durability_final_review` rechecked the fixes, ran 28 focused durability/IPC tests and reported no remaining actionable blockers in that review. An earlier review task hit provider quota; a separate review completed.
- Test model server was stopped. No background supervisor or remote infrastructure was installed.

The implemented durability is for **tool-free Pi tasks**. Native Claude/Codex session resumption, coding/desktop side-effect reconciliation, automatic project/chat memory ingestion and OS autostart installation remain separate work. Acceptance predicates verify requested outputs; they do not certify arbitrary software artifacts. See `docs/durable-operations.md` before use.

## Four-provider smoke and native worker checkpoint

- Full `MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run ci` passed: **90 Vitest tests**, formatting, type-aware lint, TypeScript, build, ShellCheck, lifecycle and two subprocess fault-injection tests. Coverage remains scoped to router/swarm, not the whole harness.
- Red/green: native refusal/error parsing, cancellation preserving observed policy/quota/approval, Claude billing authorization before spawn, read-only Pi credentials, and HTTP 401/403 normalization. The final HTTP-denial regression reproduced `unknown` before the fix and passed afterward; native review fixes reproduced six failing cases before twelve native tests passed.
- Live results: Claude Code, OpenAI Codex through Pi, and local Qwen produced checked answers. Grok OAuth preflight passed, but a separate diagnostic request received HTTP 403. Native Codex startup was restricted by this sandbox. See [exact scope and remaining blockers](four-provider-smoke.md).
- Initial Claude requests did not establish included-only billing; the corrected worker now requires explicit metered authorization until a verified included-only control exists. No authorization was inferred or enabled for subsequent calls.

- Final independent review by `foundation_review`: native event/stderr aggregation, HTTP denial precedence and text-evidence precedence findings fixed with failing regressions first. Final focused recheck reported no remaining findings. Full gate passed after those fixes.

## Grok OAuth routing repair

- Red/green regression for subscription endpoint/header selection; metered xAI stays on the public API and the shared catalog remains immutable.
- Red/green regression for required client-version/Relentless identity headers and wrapped Pi HTTP errors, including specific Grok balance exhaustion as quota and policy precedence.
- Live progression after user refreshed login: corrected endpoint returned HTTP 426 for missing version negotiation; corrected headers reached HTTP 402 “Grok Build usage balance exhausted.” No successful Grok inference or reset-time claim. No retries after recognizing quota exhaustion and no metered fallback.
- Final full `mise run ci` passed: **94 Vitest tests**, formatting, type-aware lint, TypeScript, build, ShellCheck, lifecycle and two process fault tests. Independent review found no blockers; an offline real-SDK intercepted request also confirmed the proxy endpoint and required headers.

## Alibaba Personal trial setup

- Subscription access regression failed before implementation, then passed for a Personal API key on the exact subscription endpoint. Missing, metered and lookalike endpoints, wrong auth type and broader provider ID remain rejected.
- Adapter-level regression verifies endpoint validation happens before session creation; the dedicated endpoint permits the mocked request. Unit tests make no live inference calls.
- One-call interactive example added; no goal, service, purchase or metered fallback is enabled. Live verification requires user login through Pi.

- Final gate passed with **96 Vitest tests**, lifecycle/process fault tests, lint, types, build and formatting. Independent review found no blockers and verified actual Pi request endpoint behavior offline.
- Live run `7bd982f8-255a-495d-86d4-4017ada6cb08` completed on Qwen3.6 Flash, thinking off. Parsed JSON independently checked: `return age >= 18;`, input `{age:18}`, expected `true`. No model output executed and no metered fallback. See `docs/alibaba-personal.md`.

## Latest Personal coding catalog

- Regression added before implementation for missing Personal models; real Pi runtime checks preserve old pins, subscription endpoint/auth, unrelated providers and idempotency.
- Project extension and Relentless share the supplement. Independent review loaded the extension with Pi's real resource loader and intercepted fake-credential requests to verify endpoint, reasoning and output cap; no blockers found.
- Full `mise run ci`: **97 Vitest tests**, format, lint, types, build, ShellCheck, lifecycle and two process fault tests passed. No dependency upgrade was needed: npm's latest Pi remained 0.85.1.
- Four sequential live calls completed: Qwen3.8 Flash/Max, DeepSeek V4.1 Flash and GLM5.3. Boundary semantics checked independently; strict-output deviations for Max/GLM recorded in `docs/alibaba-personal.md`. No generated code executed, metered fallback or background service.

## Exhausted provider and ensemble checkpoint

- Added an offline regression using the observed Grok HTTP402 string: quota normalization, ledger restart, authorized alternative completion on attempt two, pinned task waiting without spending attempts, and retained Grok cooldown all pass.
- Separate integration demonstration replays that observed failure, closes/reopens SQLite, then invokes real GPT-5.6 Luna through the process/Pi adapter. Exact JSON acceptance passes on the fallback; Grok-pinned work waits. No new Grok inference or metered fallback was sent. Report: `.harness/quota-ensemble-demo/report.json`.
- Architecture reconciled in `docs/ensemble-current.md`: serial durable scheduler vs concurrent non-durable swarm, explicit task graphs/diversity, current model availability, shared provider quota, memory scope and remaining coding-loop work. No production scheduler change was needed.

- Final gate passed with **98 Vitest tests** and all lifecycle/process, format, lint, type and build checks. Independent review confirmed the regression and evidence, with one architecture wording correction applied.

## Assisted self-improvement cycle 001

- Real Relentless Qwen worker identified auth evidence being lost behind a quota code. Red regression reproduced it; one-line precedence fix and supervisor regression now pass.
- Real Relentless Codex worker independently reviewed final source/tests: pass, no findings. Reviewed source matches the final revision; hashes and run IDs are in `.harness/self-improve-001/evidence.json`.
- Canonical full gate passed with **100 Vitest tests** plus existing process/lifecycle, lint, types, formatting and build checks. No autonomous patch writer was used; see `docs/self-improvement.md` for exact roles and limits.

## Bounded coding workers (2026-09-17)

- Red: the coding-worker contract tests initially had four failures against an unimplemented worker. TypeScript syntax support and no-op handling each had a focused failing regression before their fixes.
- Independent review reproduced a FIFO input hanging before inference. The fix checks regular-file type before opening, uses nonblocking/no-follow flags, and retains post-open validation. The FIFO regression now passes.
- Green: 14 coding-worker tests cover private-copy edits, failure feedback, path traversal/hidden paths, symlinks, special files, whole-batch authorization, read-only context, non-execution, attempts, provider blocking, TS/JSON checks and no-op output. Full `mise run ci` passes with 114 Vitest tests plus existing ShellCheck/lifecycle/subprocess checks. Coverage reporting still only targets router/swarm, not the whole harness.
- Real CLI runs with Qwen3.8 Flash and GPT-5.6 Luna each repaired a missing closing brace in a TypeScript fixture in one attempt. Relentless produced `ready_for_review` and hashed changes. The original stayed unchanged. The outer assistant inspected both exact replacements, then independently checked positive, cancellation-to-zero and zero addition cases; these behavioral assertions are not built-in worker checks.
- Retained local artifacts: `.harness/coding-smoke/qwen/`, `.harness/coding-smoke/codex/`, `verify.mjs`, `evidence.json` and the original fixture/request. No credentials copied. Neither model call used metered fallback.
- Final independent review of worker, CLI, tests and usage documentation found no remaining blockers. No commit, merge or publication occurred. See [coding-worker limits](coding-workers.md): arbitrary project execution, durable coding recovery and automatic integration remain unimplemented.

## Direct Meta Contributor adapter (2026-09-17)

A catalog regression failed against the initial no-op registration, then passed after adding the shared direct Meta provider. The SDK test checks exact endpoint/API/model, supported effort mapping, secret login prompt, saved-key lookup under `meta`, preserved gateway models, idempotent registration and unchanged billing guards. Real Pi extension loading found no errors. Independent review intercepted a fake-key request and verified `/v1/responses`, the Contributor model, low effort, `store: false` and the 8,192-token output cap; no network inference or real credentials were used. Full `mise run ci` passed with 115 tests and existing lifecycle/subprocess checks. Live Meta acceptance is pending user login and an authorized smoke test.

## Muse live authentication and output contract

Saved direct Meta authentication resolved without exposing credentials. The initial two Contributor calls returned text but failed the requested JSON format because the shared Pi worker system prompt unconditionally demanded reviewer assumptions. A focused test failed on that original prompt. After making the worker role task-neutral and honoring explicit output formats, the third live low-effort call returned exactly `{"echo":"relentless-muse"}`, verified by JSON parsing and equality. The untrusted-evidence boundary and tool restrictions remain intact. Independent review found no actionable issues. Full `mise run ci` passed with 116 tests plus lifecycle/subprocess checks. Evidence: `.harness/muse-smoke/evidence.json`; successful run: `.harness/runs/3da0a345-ad46-4cfb-93a7-2af442c1847b/`. Existing subscription configurations retain their billing restrictions.

## Self-improvement cycle 002: measured routing foundation

Relentless Muse reviewed the design; Relentless Luna authored and then repaired the evidence ranker in disposable copies. Initial acceptance tests failed against the stub. Independent review added billing-mode and balanced-case regressions; the second generated revision addressed them. The outer assistant checked before hashes, integrated working files, corrected small typing/lint details and implemented evaluation/routing integration. Further regressions reproduced late acceptance and lost optimization policy; final review also identified cancellation during setup and unknown zero-price cost metadata. Those boundaries are now covered.

The final routing-cycle gate passed with 142 tests, static checks, build, ShellCheck, lifecycle and subprocess checks. Test discovery is now restricted to repository `tests/`, so copied model-worker artifacts cannot become automatically executed tests. Coverage thresholds still apply only to router/swarm.

Six live probe calls (three Muse, three Codex) passed host predicates on identical cases. Measured latency routing selected Codex for that probe; Muse's catalog-derived cost estimate for its three calls was approximately $0.0001942. This is not a general coding benchmark. Design/coding/repair/review artifacts are under `.harness/self-improve-002/`; measurements are under `.harness/evaluations/9ef7a52d-baaf-482c-8d71-2473055daf91/`. The self-improvement program remains active and supervised.

## Self-improvement cycle 003: read-only model inventory

A Relentless Luna coding worker authored the inventory core against initially failing tests. The outer assistant added host catalog/checkpoint inspection and CLI wiring. Additional regressions caught incorrect native-provider name guessing and Pi partial effort-map interpretation. Independent review confirmed the final helper matches pinned Pi 0.85.1 semantics and found no remaining issues. Live read-only inventory resolved the saved provider logins without exposing keys or invoking inference. Final `mise run ci` passed with 147 tests and existing lifecycle/subprocess checks. The measured `plan` command also selected GPT-5.6 Luna using the retained live probe observations. Evidence: `.harness/self-improve-002/inventory-proposal/`, `inventory.json`, and `ranking.json`.

## Self-improvement cycle 003: durable coding recovery

Relentless's Luna worker produced the coding journal and two runner proposals against failing tests. The outer assistant corrected TypeScript, checkpoint invariants, retry/token lifecycle, syntax-check input and timer handling. Independent review reproduced prototype-key persistence, malformed-database cleanup and inconsistent/missing exports. Added regressions and fixes passed final independent review.

`mise run ci` passed with 168 Vitest tests, ShellCheck, lifecycle checks and three subprocess fault tests. New offline cases cover expired/reused lease owners, cumulative attempts, immutable context, batch rollback, corruption, terminal blocking, late results, reconstructed exports and SIGKILL recovery. Existing legacy coding behavior remains covered. Coverage instrumentation still targets router/swarm rather than the whole harness.

Live run `3d8b0e7d-150f-4847-90ab-ca54ff90edf2`: a child process committed its first attempt and was SIGKILLed; a fresh process resumed using Pi OpenAI Codex Luna. One actual inference repaired the synthetic JavaScript file; the result was `ready_for_review` with two consumed attempts. Original source remained unchanged. Another terminal resume regenerated artifacts with the same attempt count and no inference. Retained evidence is in `.harness/self-improve-003/`, including failing test logs, generated proposals, final gate output, live request/results and recovered workspace.

This verifies coding checkpoint durability and fixed syntax checking, not autonomous task completion. Coding provider cooldown/fallback, revision/cancellation, behavior checks under isolation and automatic review/integration remain open. The active program is still supervised; nothing was committed, merged, published or installed as a service.

## Self-improvement cycle 004: coding provider recovery

A Relentless Luna coding worker authored `coding-recovery.ts`; host integration added persisted provider cooldowns, issued attempts, normalized failures and fallback in the durable coding loop. Tests establish exact-model/provider pins, billing/effort constraints, missing optimization evidence, Retry-After, persisted waits without attempt consumption, unchanged source, intermediate patch handoff, and stale-denial precedence. Earlier checkpoint shapes remain readable without budget reset.

Independent review exposed missing cancellation forwarding and policy errors lost inside the Pi adapter. Failing tests reproduced both prompt rejection and final-message denial during abort, along with a lease-heartbeat takeover. The corrected adapter drains for up to 250 ms; unresolved settlement becomes an unknown blocker. Final independent review found no remaining blockers. `mise run ci` passed with 192 Vitest tests, ShellCheck, lifecycle checks and three subprocess fault tests. Coverage instrumentation remains scoped to router/swarm.

Live run `0f420498-f04f-47b1-8d6d-57f765e50ea0` first dispatched `xai/grok-4.6`, recorded `quota`, then dispatched `openai-codex/gpt-5.6-luna`, producing a syntax-checked review candidate in two consumed attempts. Both routes were subscription-only; metered fallback was disabled. Original synthetic source remained unchanged. `.harness/self-improve-004/` retains the request, normalized transition history, before/after artifacts, failing regression logs, model proposal and gate evidence. This verifies the live quota handoff, not general model capability or autonomous integration.

## Self-improvement cycle 005: durable cancellation

A real `coding create/resume` run (`90128fc7-904c-4d4b-9056-a67bbfbdceec`) produced the cancellation proposal through Relentless and Pi Codex. The outer assistant applied the focused cancellation changes instead of the worker's unrelated formatting rewrite. Failing tests preceded implementation. Journal tests cover idle/running/retry cancellation, idempotence, invalid clocks, attempt preservation and late blocking failure retention. An integration test cancels through a second connection; a subprocess test invokes the cancellation CLI from a separate process and verifies abort, unchanged source and the retained attempt count.

Independent review found no remaining blockers. `mise run ci` passed 197 Vitest tests, ShellCheck, lifecycle checks and four subprocess tests. Artifacts and red/green evidence are retained in `.harness/self-improve-005/`. No live cancellation call or extra inference was needed for deterministic cancellation checks. Contract revision, shared health, execution isolation and autonomous scheduling remain incomplete.

## Self-improvement cycle 007: per-case evidence guards

A real Relentless durable coding run (`3f19107d-e7ba-4ac5-bfcb-c486c740000a`) produced the confidence helper against failing tests. Host integration added per-case counts, acceptance floors and optional Wilson lower-endpoint thresholds. Regressions cover a failed case hidden by 90% aggregate success, insufficient samples, numerical reference points and invalid counts. Independent review found no blockers.

The canonical gate passed 201 Vitest tests, static checks, build, ShellCheck, lifecycle verification and four subprocess checks. Coverage remains scoped to router/swarm. Red/green logs, the worker proposal and live calibration artifacts are retained in `.harness/self-improve-007/`. No arbitrary project tests, unattended scheduler or automatic integration were enabled.

The bounded live calibration completed 24 calls without provider failure: Muse and Luna each passed 12/12 host predicates. Default latency ranking selected Luna (3.61 s versus 5.15 s); a configured 0.8 per-case lower-endpoint requirement rejected both because each case had only three trials. The analysis retained both results; no claim of general coding capability or statistically significant speed superiority follows.

## Self-improvement cycle 008: versioned coding instructions

Relentless run `4bc174de-1998-4dba-b542-6f89f5e11675` returned a comment-only replacement for the journal. Although syntax checks passed, the host tests failed immediately because the module no longer exported its class. The proposal was rejected, the source restored, and the outer assistant implemented the focused revision feature. This is recorded as a failed worker proposal, not a successful autonomous implementation.

New tests establish stale-update rollback, history across reopen, preserved attempts/config/files, review invalidation, exhausted budgets, terminal blockers, running/cancelled rejection, waiting-state CLI updates and delivery of updated instructions to the next worker. Export and CLI distinguish artifact revision from current revision. Independent review verified the final behavior. The full gate passed 205 Vitest tests, static checks/build, ShellCheck, lifecycle and four subprocess checks. No live inference is used by these tests.

Artifacts and red/green evidence: `.harness/self-improve-008/`. The overall goal remains active; full memory integration, shared provider health, isolated behavior checks and automatic promotion/scheduling remain incomplete.

## Self-improvement cycle 009: shared coding cooldowns

Relentless durable run `663e6d52-32a9-47f6-befd-56a48dca255c` authored the cooldown merge helper against failing tests. The host integrated journal reads and corrected strict TypeScript/lint issues. Independent final review found no blockers.

Tests prove maximum cooldown preservation across runs/connections, retained evidence after cancellation, zero-attempt waiting, due-time revalidation, constrained fallback and exact-model pin preservation. A subprocess test commits quota failure, exits, and verifies a new process waits on a different run before dispatching at expiry. No provider inference is used in the tests.

The full gate passed 210 Vitest tests, static checks/build, ShellCheck, lifecycle checks and five subprocess checks. Evidence is retained in `.harness/self-improve-009/`. Scope is one coding journal; goal-ledger/inventory unification and cross-project account health remain open.

## Self-improvement cycle 010: read-only combined inventory

Relentless run `9ba1dfa5-bc85-43b0-9fd4-87e1217cf05b` authored the coding-health read adapter. Host integration added read-only journal inspection and combined local inventory reporting. Regressions prove missing-file noncreation, unchanged database bytes/permissions, mutation rejection, corruption refusal, maximum cooldown selection and consistent snapshots during concurrent commits. Independent final review passed.

The full gate passed 214 Vitest tests, static checks/build, ShellCheck, lifecycle and five subprocess checks. A real read-only inventory call found both local journal sources and the configured Muse/Codex authentication entries; capacity remained explicitly unverified. No inference was triggered by inventory. Red/green logs, worker proposal and inventory report are retained in `.harness/self-improve-010/`.

Goal and coding dispatch state remain separate. This verifies reporting, not synchronized scheduling or live quota availability.

## Self-improvement cycle 011: required export declarations

Relentless run `2c3af8aa-d50b-4918-8654-7bb73c91ad69` authored the non-executing AST helper. Host integration added optional manifest constraints, persistence, first-attempt context and repair feedback in both runners. Red/green tests cover placeholder erasure, misleading strings/comments, erased type/ambient declarations, runtime enum/namespace declarations, aliases, unsupported CommonJS/JSON/read-only manifests and durable retention.

Independent review caught and verified the CommonJS validation fix. The full gate passed 221 Vitest tests, static checks/build, ShellCheck, lifecycle and five subprocess checks. The compiled helper also rejected the actual cycle-008 placeholder for its missing `CodingJournal` export. No model-generated code or imported dependency was executed by that replay. TypeScript remains exactly 6.0.2, now classified as a runtime dependency.

Artifacts, proposal, failing logs, gate and replay: `.harness/self-improve-011/`. This verifies declared-name preservation, not runtime exports, implementation behavior or automatic promotion.

## Self-improvement cycle 012: checkpoint-bound independent review

Relentless run `c9474092-bf89-437e-96df-6309ddef9174` produced the finding validator with the required-export guard enabled. Host integration added serial two-provider review, author-provider exclusion, route preflight, exact-checkpoint checks, deadlines and the review CLI/artifacts. Model findings are validated as bounded structured evidence and never execute commands.

Independent review reproduced late-result acceptance when timers were delayed and stale reads through pinned read-only journal handles. Failing regressions preceded elapsed-time checks and rejection of pinned handles. Final independent review found no blockers. The gate passed 231 Vitest tests, static checks/build, ShellCheck, lifecycle and five subprocess checks.

Offline tests cover two-provider selection, author exclusion, no-spend failed preflight, prompt revision during review, invalid findings, redacted provider errors, bounded timeout, late completion, pinned readers, persistent CLI reports and unchanged coding state. No live review pair was invoked in this cycle. Review is not durable/resumable and does not integrate code. Artifacts and red/green evidence: `.harness/self-improve-012/`.

## Self-improvement cycle 013: real two-provider review

Live review `.harness/reviews/review-gA8WHi/` examined coding run `c9474092-bf89-437e-96df-6309ddef9174`, checkpoint `837d8096f54f057c018a62a2f4cb5cc431fbd9480898c4a3cb7487c5e0f8f3e0`. Qwen3.8 Flash and Muse Spark 1.3 Contributor each returned `no_findings`; the CLI retained both independent responses and left coding state unchanged. Exactly two model calls were made, with no retries or metered fallback. Muse's selected route was explicitly metered; Qwen used its configured Personal endpoint.

A hash-checked copy of the actual reviewed proposal failed a fixed, non-executing TypeScript 6.0.2 check at line 41 (TS2532). The corrected current helper passed the same check. The relevant `noUncheckedIndexedAccess` flag was not included in the model packet, so this is a contextual verification limit rather than a measured general false-negative rate. The result does not authorize integration.

No executable changes were made in this cycle; the previous 231-test gate remains the code verification baseline. Live reports, host comparison, source hashes and compiler logs are retained under `.harness/self-improve-013/`. Actual review cost/latency telemetry remains unavailable.

## Self-improvement cycle 014: context persistence and repair

Relentless run `86aed40b-d109-43f5-a193-417f78bc7215` authored the context schema/renderer. Host changes deliver context to both coding paths and independent review; explicit updates preserve old context and invalidate stale review readiness. Tests cover bounded/strict input, prior history, omission preserving context, unchanged permissions/budgets, reopening, CLI persistence and revision during review. Independent review found no blockers. The full gate passed 237 Vitest tests, static checks/build, ShellCheck, lifecycle and five subprocess checks.

The original parser run `c9474092-bf89-437e-96df-6309ddef9174` was revised to include compiler requirements and the observed diagnostic. It resumed at revision 2 and reached a new review candidate with two total attempts out of two; the budget was not reset. Its saved code explicitly guards the indexed value and uses the supported Zod issue code. A fixed TypeScript check with strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and unused-code checks passed. That repaired proposal was only statically checked and was not copied into the working tree.

Evidence, proposals, red/green logs, context update and compiler result are under `.harness/self-improve-014/`. Automatic context discovery, durable review scheduling and behavioral verification remain pending.

The follow-up live review of revision 2 failed before accepting any assessment, with the older report's normalized `unknown` reason. The second reviewer was not dispatched. Its checkpoint hash matches the statically checked proposal. This is a failed review, not acceptance. The failure exposed missing diagnostic detail; new regressions now verify explicit timeout/invalid-output normalization and stage/route fields. Raw provider errors and invalid responses remain excluded. The original failure was not reclassified or retried.

## Self-improvement cycle 015: persisted workflow

The full gate passed 248 Vitest tests, lint/types/build, ShellCheck, lifecycle validation and six subprocess checks. Eleven focused workflow/helper/CLI tests cover bounded repairs, external revisions, quota waits across reopening, stale verification handoffs, schema damage, artifact history limits and interrupted repair reconciliation. The new subprocess check kills a worker during review and verifies reservation retention with no replay. Independent final review found no remaining blockers after two regression-backed fixes.

Relentless authored the repair-prompt helper in run `3051ee5a-4776-4404-9842-51ddd7e52b89`; host code supplied orchestration and tests. Red/green and gate logs are under `.harness/self-improve-015/`. No complete live workflow or isolated behavioral acceptance is claimed.

## Cycle 016: live persisted independent-review handoff

The workflow resumed existing Relentless coding run `3051ee5a-4776-4404-9842-51ddd7e52b89` (Codex Luna, one coding attempt) with a single explicitly budgeted review pair. Qwen3.8 Flash on the Personal subscription and Muse Spark 1.3 Contributor on the authorized metered route each returned no findings. The workflow persisted `verification_required` at checkpoint `2da1c1806c11e5010c263116db87aec3545e1dd950a8ec5e23e025242c377b05`. Reopening and resuming retained exactly the same state and report.

A hash-checked copy of the exact reviewed source passed a fixed TypeScript 6.0.2 check with strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and unused-code checks. The source also matches the previously host-reviewed working-tree helper. No new candidate was integrated in this cycle. Artifacts are retained under `.harness/self-improve-016/`.

This proves live review and durable handoff for existing real coding output; it does not exercise live repair, isolated behavioral execution, scheduled recovery or completion of the overall goal. Per-review actual cost and latency are still unmeasured. No executable changes were made; cycle 015 remains the full-gate baseline.

## Self-improvement cycle 017: review timing

The full gate passed 249 Vitest tests, static/build checks, ShellCheck, lifecycle validation and six subprocess checks. Regression evidence verifies distinct per-route elapsed times across successful and quota-failed calls, explicit unknown cost, and attempt records for stale and timed-out reviews. Independent review found no blockers. Red/green and gate logs are under `.harness/self-improve-017/`. No live inference was performed in this cycle; no capability ranking or cost measurement is claimed.

## Self-improvement cycle 018: cost transport

Full validation passed 255 Vitest tests, static/build checks, ShellCheck, lifecycle validation and six subprocess checks. Independent final review passed. Red/green, failure-priority regression and gate logs are under `.harness/self-improve-018/`.

One bounded live Muse Contributor call used the existing explicitly metered configuration and returned the requested JSON. Its positive Pi estimate crossed the child-process boundary; `live-evidence.json` records the estimate, host elapsed time and deterministic response acceptance. This is a transport check on a trivial task, not capability-ranking evidence or settled billing. No retry or routing change followed.

## Cycle 019: process evaluations feed verified routing evidence

The evaluation CLI now preflights all eligible Pi routes and dispatches each call through the owned process worker. Per-call metered estimates are attached to deterministic host acceptance, retaining unknown subscription cost and suppressing late telemetry updates. Ranking tests cover accepted cases, a wholly failing case rejected despite adequate aggregate acceptance, and qualified cost scoring. Independent review passed. The full gate passed 257 Vitest tests, static/build checks, ShellCheck, lifecycle validation and six subprocess checks.

A bounded live run used one repetition of the existing four-case review-calibration suite: Muse Contributor and Codex Luna each passed 4/4. Total host elapsed time was 24,301 ms for Muse and 15,279 ms for Luna (means 6.08 s and 3.82 s). Muse's estimated total cost was $0.0004423; subscription cost remained unknown. Baseline latency ranking selected Luna; the stricter minimum-sample/confidence policy selected neither. This is a small suite-specific check, not a general capability ranking or an automatic routing-policy update.

Evidence: `.harness/self-improve-019/` and `.harness/evaluations/71892e79-89a5-462a-9ff4-c709fecbe8f3/`. Evaluation checkpoint/resume, broader verified workloads and safe behavioral execution remain pending. No model-generated source was added this cycle.

## Self-improvement cycle 020: evaluation checkpoints

The canonical gate passed 264 Vitest tests, static/build checks, ShellCheck, lifecycle validation and seven subprocess checks. Focused tests cover completed and partial reopen, in-flight ambiguity, immutable contract/evidence, case-plan capacity, persisted deadlines, reservation latency and terminal artifact reconstruction. The new subprocess fixture kills an evaluator with one committed observation and one pending dispatch, then verifies zero replayed calls after reopening.

Independent final review found no blockers after regression-backed plan-integrity and deadline fixes. Evidence is under `.harness/self-improve-020/`. No live inference or claims of unattended recovery were made this cycle.

## Self-improvement cycle 021: foreground workflow runner

The full gate passed 271 Vitest tests, static/build checks, ShellCheck, lifecycle validation and seven subprocess checks. Scheduling tests cover due times beyond one sleep chunk, pre-cancellation, waiting cancellation and unexpected errors. Integration regressions cover untouched Personal configurations, shutdown preserving coding attempts/state, and stopping before another reviewer dispatch.

Independent final review repeated the SIGINT fixture and observed one call, one attempt, coding `ready`, workflow `coding`, and no blocker. Relentless authored and repaired the runner in run `2f4e7f23-c35e-4088-bc3f-72cd3ad5b80b`; host integration and lint adaptation are documented separately. Red/green, run artifacts, source evidence and gate logs are in `.harness/self-improve-021/`. No background service or project-code execution was enabled.

## Cycle 022: local VM feasibility breakthrough

A QEMU 11.0.3 TCG guest successfully booted under software emulation, avoiding the unavailable VZ hardware path. Fixed trusted diagnostics ran as UID 65534 with zero effective capabilities and no-new-privileges, with no NIC or host sharing. Fault probes verified parent wall/output termination and guest CPU/process/file/memory limits; every emulator process was reaped. Initial permission failure and successful results are retained under `.harness/self-improve-022/`.

Independent evidence review supports a feasibility prototype only. No product executable changes or model inference occurred, so cycle 021's 271-test/seven-subprocess gate remains the code baseline. A pinned language runtime, trusted task/result protocol, host resource limits and adversarial validation remain required before project behavioral execution is enabled. See `docs/execution-isolation.md` for exact evidence and limitations.

## Cycle 023: isolated Node and a real Relentless helper

A digest-pinned official Node 24.21.0 ARM64 image ran under local QEMU TCG as UID 65534. A separate root-controlled result channel rejected a stdout success spoof and reported the true failure exit code. The reviewed Relentless scheduler helper then passed three fixed host-authored tests inside the VM; protected candidate/test hashes matched the exact packaged files and current source. Independent evidence review found no blockers to these narrow claims.

The TypeScript probe initially failed under `--jitless` (WebAssembly unavailable); normal guest Node settings passed. Host RSS monitoring through `ps` was denied, so no hard host-memory bound is claimed. All emulator processes were reaped. Evidence, digest-pinned downloads, prototype scripts and retained per-run records are under `.harness/self-improve-023/`.

This is a supervised experiment using Relentless-authored/host-reviewed code, not a general verification command or autonomous promotion. Product executable code did not change; cycle 021's 271-test/seven-subprocess gate remains the baseline. Runtime packaging, acceptance semantics and production lifecycle integration remain active work.

## Cycle 024: reusable experimental VM supervisor

The canonical `mise run ci` gate passed 271 Vitest tests, strict lint/types/build,
ShellCheck, one lifecycle test, seven existing durability subprocess tests and
12 new VM-supervisor tests. The new tests are offline and use fixed fake emulator
fixtures; no inference or VM download occurs in CI. Red/green logs and the full
gate are retained under `.harness/self-improve-024/`.

Independent review identified mutable-emulator pinning and FIFO validation hangs;
regressions failed before both fixes. Final review found no remaining blockers
within the explicitly experimental prepared-image scope. A live run through the
public `verify-vm run` command executed the existing scheduler test image in
5.27 seconds, with exact protected source/test hashes and a reaped emulator.
`acceptance` remains `not_assessed` and `hostMemoryBound` remains false. This is
reusable execution evidence, not automatic behavioral acceptance or integration.

## Cycle 025: source/test package and run

The canonical gate passed 271 Vitest tests, lint/types/build, ShellCheck, one
lifecycle test, seven durability subprocess checks, 12 VM-supervisor checks and
seven packaging checks. Packaging regressions cover deterministic content binding,
path/file collisions, supplied entrypoints, digest mismatch, final image limits,
no overwrite and the public CLI. No live inference or emulation runs in CI.

Real public-command runs used the existing reviewed Node image and Relentless
scheduler helper. Three scheduler cases passed; an expanded fixture verified
readonly source/tests, protected metadata/channel and loopback-only interfaces.
A separate deliberate assertion failure correctly produced protected exit 1.
The failing network-interface assertion from the first fixture and its sysfs-based
correction are retained. Every emulator was reaped; no acceptance or promotion
was inferred from exit zero. Evidence and review red/green logs are under
`.harness/self-improve-025/`.

## Cycle 026: reviewed checkpoint to VM evidence

The full gate passed 276 Vitest tests, lint/types/build, ShellCheck, one lifecycle
test, seven durability subprocess checks, 13 VM-supervisor/CLI checks and seven
packaging checks. Five new workflow tests cover exact journal selection and
binding failure boundaries. The CLI FIFO regression failed before bounded
specification reading was implemented; the oversized-file case is also covered.
Independent final executable review found no remaining blockers.

The public `workflow package` command selected an existing independently reviewed
coding checkpoint, and `verify-vm run` executed four fixed repair-prompt cases in
4.72 seconds. Source/test bundle hashes matched, the emulator was reaped, and
acceptance remained `not_assessed`. No inference, acceptance transition or
promotion occurred. Red/green, live and full-gate evidence is retained under
`.harness/self-improve-026/`.

## Cycle 027: declared-rule assessment

The canonical gate passed 285 Vitest tests, lint/types/build, ShellCheck, one
lifecycle test, seven durability subprocess checks, 13 VM-supervisor/CLI checks
and seven packaging checks. Fourteen focused assessment/workflow tests include
exact runtime/source/test bindings, failed/uncertain executions, required rules,
stale checkpoints and Python-compatible canonical digests. Independent review
found no remaining blockers after the reference-encoding fix.

The public `workflow verify` command accepted the existing helper's four fixed
cases under the explicit process-exit rule in 4.72 seconds. An intentionally
failing variant produced `accepted: false`, protected exit 1 and CLI failure in
5.16 seconds. Both emulators were reaped. Assessments retain exact evidence
hashes; workflow phases and source remain unchanged. No automatic promotion or
general task-capability inference is claimed. Red/green, live and gate evidence
is retained under `.harness/self-improve-027/`.

## Cycle 028: durable verification transitions

The canonical gate passed 292 Vitest tests, lint/types/build, ShellCheck, one
lifecycle test, seven durability subprocess checks, 13 VM-supervisor/CLI checks
and seven packaging checks. Regressions cover coding-write fencing, stale receipt
replay, large failed-test logs, preserved attempt/review budgets, terminal verified
state and recovery after assessment but before journal commit.

The public workflow verification command transitioned the existing reviewed
helper to `verified`. `workflow run` revalidated that state without provider
inference, and `reconcile-verification` returned the same persisted receipt.
Independent review found no remaining blockers after the fenced commit and bounded
feedback fixes. No source promotion or general task-capability inference occurred.
Red/green, live and full-gate evidence is in `.harness/self-improve-028/`.

## Cycle 029: recoverable source promotion

The canonical gate passed 294 Vitest tests, lint/types/build, ShellCheck, one
lifecycle test, seven durability checks, 13 VM-supervisor/CLI checks, seven
packaging checks and 13 promotion tests. Regression evidence covers parent death
while the writer retains its checkpoint fence, process death during partial and
complete staging, exclusive capture, developer edits and corrupted state.
Independent final review found no remaining blockers after recovered-stage sync.

Fixture promotion succeeds and resumes. The real verified Relentless candidate
correctly failed preflight on changed readonly review context: both tracked files
remained unchanged and no transaction was created. No live repository installation
or model inference occurred. Evidence is in `.harness/self-improve-029/`, including
`fsync-red.txt`, `fsync-green.txt`, `ci-final.txt` and `live-preflight.json`.
See [promotion scope and limitations](source-promotion.md).

## Cycle 030: worker-authored continuation and Pi integration

A Relentless Codex worker produced the verification continuation in one attempt;
independent review preceded its integration. Runner regressions cover repair and
fresh review, unresolved verification, cancellation and propagated errors. The Pi
adapter has registration, current-project selection, malformed command, trust and
error tests. A real Pi-loader subprocess test reproduced and fixed the source vs
compiled worker path issue without provider inference. The loaded command also
read the existing verified workflow successfully.

Project policy now reads a validated `relentless` namespace in Pi settings. Tests
cover local billing constraints, role references, versioning, trust, symlink
rejection and preservation by Pi's own settings writer. Configuration display is
implemented; session-scoped routing and lifecycle integration remain pending.
Evidence is in `.harness/self-improve-030/`.

The final cycle 030 canonical gate passed 307 Vitest tests and 42 Python checks,
plus formatting, lint, types, build and ShellCheck. Independent final reviews
found no remaining blockers in the implemented adapter and read-only policy
integration. The full Pi-native goal/routing lifecycle is still unfinished.

## Cycle 031: scoped roles and real dispatch guards

The final canonical gate passed 317 Vitest tests and 43 Python checks, plus
formatting, lint, types, build and ShellCheck. A Relentless worker authored the role
intersection in one attempt; independent review preceded integration. Additional
review found a trust-revocation race during settings reads. Its regression failed
before the fix and passed with no worker dispatch afterward. Reviewer-specific
coverage confirms the guarded role after a successful mocked coding result.

A real Pi-loader/registry check selects the local model in preview, refuses a
higher reasoning floor and makes no inference request. Project policy validates
all ten existing model entries and five role pools; disabled Anthropic access is
preserved. Imported observations remain configured evidence, not newly validated
provenance. Session lifecycle and full autonomous goal integration remain pending.
Red/green, real-loader and gate evidence is under `.harness/self-improve-031/`.

## Cycle 032: normal Pi shutdown and session replacement

The final canonical gate passed 321 Vitest tests and 44 Python checks, plus lint,
types, build, formatting and ShellCheck. Relentless's worker authored the local
session controller; independent review preceded integration and found no final
blockers. Failure tests preceded external-signal propagation and suppression of
closed-session UI publication. The real Pi-loader lifecycle fixture covers a
pending command across shutdown, invocation against a closed instance and renewed
admission after session start. No provider inference runs in these tests.

Cancellation before dispatch prevents a worker launch; cancellation during a
mocked worker aborts its signal and starts no replacement. These are normal
lifecycle guarantees, not proof of remote termination or crash-safe replay.
Expired coding-lease replay remains a documented separate recovery gap. Evidence
is under `.harness/self-improve-032/`.

## Cycle 033: no inference takeover from expired coding leases

The canonical gate passed 324 Vitest tests and 44 Python checks, plus static,
build, formatting and shell checks. Regressions cover expired attempts before
and at budget exhaustion, idempotent ambiguous resumes, stale edits, legacy
checkpoints, workflow blocking, known retry fencing and late policy denials.
The SIGKILL coding fixture now proves zero replacement calls after reopening,
with original source and one consumed attempt retained. Independent review found
no blockers in the journal change.

The Relentless worker's two-attempt large-file replacement failed required-export
checks and was not integrated. The host's minimal implementation followed the
failing regression. Both outcomes remain in `.harness/self-improve-033/`.
Evidence-based reconciliation and efficient worker edits remain unfinished.

## Cycle 034: snapshot-bound targeted edits

The canonical gate passed 337 Vitest tests and 44 Python checks, plus formatting,
lint, types, build and ShellCheck. Parser regressions cover stale hashes, missing
snapshots, readonly and duplicate paths, ambiguous and overlapping anchors,
simultaneous application, malformed unions, UTF-8 expansion and aggregate limits.
Both coding runners have hash-context and targeted-edit integration tests.
Independent review found no semantic or integration blockers.

The live one-attempt golden probe produced a 290-byte targeted reply for a
23,468-byte source fixture in approximately 4.13 seconds including validation.
Full candidate equality and unchanged source were checked without executing model
code. It reached ready-for-review, not a production deployment or general
capability certification. Artifacts are in `.harness/self-improve-034/`.

## Cycle 035: Pi-native task creation

A Relentless Codex Luna worker authored the role-policy builder in one attempt
(`2bf24322-db45-459c-abb5-06d27c548f60`). The host integrated Pi command creation,
source snapshots, current-policy/trust checks, and refined independent-review
preflight to preserve overlapping model roles. Initial policy and command tests
failed before implementation. A further failing regression exposed potential
coding providers that were excluded by the task pin; filtering task-eligible
candidates fixed the false rejection.

Tests verify frozen role configs, explicit pins and effort scope, absent models,
two independent review providers, no inference at creation, active-project root
binding, late trust/cancellation rejection, and retained coding ID after an
observed workflow attachment failure. Pi's actual extension loader successfully
ran creation with a fixture model inventory; the persisted task had zero attempts.
No live provider entitlement is inferred from this offline loader check.

`mise run ci` passed 345 Vitest tests and 44 Python checks, formatting, lint, types,
build and ShellCheck. Red/green and worker evidence are retained under
`.harness/self-improve-035/`. Separate creation commits remain non-idempotent and
not crash-atomic; automatic orphan reconciliation is not implemented. This cycle
does not establish the complete autonomous goal or model-calibration loop.

Independent final review confirmed the pinned-author correction and pre-mutation
trust/cancellation checks; all eight focused tests passed with no additional
blockers. The documented separate-commit recovery gap remains unresolved.

## Cycle 036: recoverable, idempotent Pi creation

A Relentless Codex Luna coding worker authored the checkpoint-fenced attachment core
in one attempt (`b5506ab2-6720-40ee-9f50-57f762a6c511`). Host integration added the
strict intent schema, atomic source+intent transaction, task-ID/request-hash
binding, early replay and preservation of progressed workflow state. Initial
creation/recovery tests failed before implementation. A further red regression
caught duplicate legacy-task creation when no intent existed; the journal now
rejects that ambiguous collision.

Unit checks cover attachment failure/retry, changed sources/settings with frozen
snapshot recovery, conflicting task IDs, rollback after source insertion, corrupt
intent, wrong root/checkpoint, cancelled work, retained consumed attempts and
legacy collisions. Actual subprocess SIGKILL at three boundaries (uncommitted
source insertion, intent committed before workflow, workflow committed before
response) converged to one source run, one intent and one workflow, with zero
attempts and unchanged source. Three concurrent creation processes against an
initialized journal also converged to one task. No model inference occurred in
these fault tests.

The canonical `mise run ci` gate passed **353 Vitest tests and 46 Python checks**,
formatting, lint, types, build and ShellCheck. Independent final review passed all
12 focused creation/recovery tests and found no remaining blockers. Evidence is
retained under `.harness/self-improve-036/`.

This verifies the tested process-crash boundaries, not universal power-loss,
storage-corruption or initial-schema-creation recovery. Legacy migration and
background reconciliation remain unfinished. The full model-capability calibration
and autonomous goal loop remain active work.

## Cycle 037: local evaluation evidence in Pi routing

Relentless's Codex Luna worker authored the evidence merge core in one attempt
(`800e6acf-634b-473f-8b63-814585eb3d4d`). Host integration adds explicit project
source references, read-only checkpoint inspection, complete-cohort checks and
Pi route/create wiring. Initial merge/loader/read-only tests failed before the
implementation. Independent review identified a directory-to-symlink swap between
checks and pathname opens; the new regression reproduced an off-project import
before directory identity/containment rechecks made it fail closed.

Offline trials exercise host JSON acceptance, including failures and unknown
costs. The Pi integration fixture selected the lower-latency model despite its
worse static preference and froze all eight cohort observations into newly created
coding state without inference. Missing/incomplete/pending sources, changed
contracts, traversal, symlinks, duplicate/conflicting trials and aggregate bounds
are covered. Read-only checkpoint access cannot create missing state or reserve
new trials. Evaluation billing authorization is not adopted as project permission.

The full `mise run ci` gate passed **362 Vitest tests and 46 Python checks**, plus
formatting, lint, types, build and ShellCheck. Independent final review passed all
16 focused tests with no remaining blockers within the trusted-project boundary.
Evidence is retained under `.harness/self-improve-037/`.

This proves the persisted evaluation-to-routing path. It is not a representative
real-provider coding benchmark, signed proof of record origin, protection against
a filesystem owner rewriting both records and hashes, or automated capability
calibration. The broader autonomous goal remains unfinished.

## Cycle 038: live controller classification and Pi adoption

The independently reviewed controller-recovery suite ran through Relentless's owned
process/Pi workers using the existing authorized Luna subscription and Muse
Contributor metered configuration. All 12 planned calls completed without a pending
reservation or stopped evaluation; both providers passed six declared JSON-field
checks across three cases. Luna's mean host elapsed time was 2959.67 ms and Muse's
6777.83 ms. Muse's six recorded estimates totaled $0.0008406; subscription cost
remained null. No retries, pins, billing permissions or scheduler roles changed.

The completed checkpoint at
`.harness/evaluations/93b0456b-3bb5-4025-9174-0e455fd393a0/` is now referenced by
local Pi settings. A scheduler route preview used resolved Pi model availability,
existing project roles, and six-sample workload-specific latency policy; it selected
Luna with `dispatched:false`. The example task's suite hash and case list were
recomputed and matched the actual evaluation contract. Summary/preview evidence
is retained in `.harness/self-improve-038/`.

The canonical gate passed **362 Vitest tests and 46 Python checks** plus static,
formatting, build and ShellCheck gates. No live inference ran inside unit tests.
Independent review verified the suite oracle and final measurements/contracts,
including the distinction between cohort ranking and role-constrained preview.

Only synthetic controller classification is measured: two samples per case/model,
no randomized order, and low statistical confidence. This does not prove coding
ability or broad safety/operational reliability. Representative coding/VM suites,
automatic calibration and the complete autonomous goal loop remain unfinished.

## Cycle 039: fenced durable coding measurements

Relentless's Luna worker authored the collector in one attempt
(`18b6f3ac-f3cd-4f14-b27f-06c89215f077`). Initial collector and durable-runner tests
failed before implementation. Journal integration records at most one measurement
per committed epoch and only under the current unexpired lease. Tests cover late
callbacks, stale completion/denial, non-metered unknown cost, clock failure,
telemetry validation that cannot suppress a policy denial, reopen persistence,
and legacy snapshot serialization/hash preservation.

One bounded Muse Contributor coding attempt
(`ea650f02-d047-4ccd-b3e7-6653fc6d37aa`) produced the complete expected candidate
for a small arithmetic edit. A real callback estimate crossed process IPC and was
persisted with the attempt: 4,257.27 ms observed elapsed and $0.0001557 estimated
cost. The source remained unchanged. The result was `ready_for_review`, not
behaviorally verified; no capability observation was created.

The canonical gate passed **369 Vitest tests and 46 Python checks**, formatting,
type-aware lint, strict types, build and ShellCheck. Unit tests contain no live
inference. Logs, worker output and live transport evidence are retained under
`.harness/self-improve-039/`. These records do not establish final remote cost,
termination, verified acceptance or automatic coding-model calibration.

Independent final review passed all 50 focused tests with no blocking findings,
confirming lease fencing, late-callback isolation, legacy hash preservation and
CLI/workflow cost forwarding. No scope or billing permissions changed.

## Cycle 040: live measured coding-to-verification pilot

Existing measured Muse candidate `ea650f02-d047-4ccd-b3e7-6653fc6d37aa` received one
bounded independent review pair through Relentless's workers: OpenAI Codex Luna and
Alibaba Qwen3.8 Flash. Both returned no findings; coding attempts remained one and
review pairs used one. Review configuration allowed subscription routes only.

The actual pinned QEMU/Node baseline run returned `test_process_failed`, guest
exit 1, at the intended -1-versus-5 arithmetic assertion. The exact reviewed
candidate returned `executed`, guest exit 0, and passed the same test file. Seven
numeric pairs ran in both orders, plus NaN/infinity and the non-root guest check.
Both VM processes were reaped; the configured wall/output boundaries held. Known
VM limitations, including no hard host RSS bound, remain unchanged.

The workflow durably reached `verified`. Checkpoint
`0ce138d58472684c11cea1671ea1842bc119f4c28d2208c922b32ef1d410b7ec`
binds the author's measured snapshot to both independent reviews and the accepted
VM receipt. Reconciliation verified the saved artifact chain without another model
call or VM launch. Source bytes remained unchanged; a full golden comparison
confirmed the intended operator-only candidate change.

Evidence is retained in `.harness/self-improve-040/`, including the baseline and
candidate manifests/reports/output, reviewed state, reconciliation and
`pilot-proof.json`. There were no executable implementation changes in this cycle;
the prior 369-test/46-Python canonical gate remains the implementation baseline.
This pilot is explicitly `rankingEligible:false`: it is retrospective, single-case
and lacks a predeclared trial denominator. Automatic coding calibration and the
complete autonomous goal loop remain unfinished.

Independent final review verified the SQLite author/measurement checkpoint,
review independence, assessment/report hashes, shared test bundle, exact candidate
change and VM outcomes, with no blocking evidence mismatches.

## Cycle 041: Pi prospective coding-calibration preview

A Relentless Luna worker authored the planner in one attempt; host integration wired
it into `/relentless calibration-plan` using project role policy and Pi model scope.
Red evidence is retained in `.harness/self-improve-041/`: `red.log`,
`refinement-red.log`, `pi-red.log` and `review-red.log`. Six focused tests cover
stable contracts, source/test/prompt/time-budget identity, eligibility, independent
review feasibility, bounded trials, project-root/configuration restrictions, Pi
scope and impossible package namespaces. Independent final review found no
remaining blockers within preview-only scope after the namespace fix.

The final canonical `mise run ci` passed: 375 Vitest tests, 46 Python tests,
formatting, strict lint/types, coverage, build and ShellCheck. Output is retained
in `.harness/self-improve-041/gate-final.log`. No live calibration trial, VM run,
source promotion or capability observation was produced by this preview.

## Cycle 042: durable Pi calibration cohorts

Relentless's Luna worker authored the journal in one attempt. Red evidence in
`.harness/self-improve-042/` covers missing implementation (`red.log`), Pi command
integration (`pi-red.log`), the worker's overly strict nested parse
(`worker-red.log`), read-only mutation rejection (`readonly-red.log`) and the
independent review's schema-reset finding (`review-red.log`). The final marker
fix atomically distinguishes interrupted empty initialization from a damaged or
foreign database.

Twelve focused tests passed. Two real subprocess tests additionally cover SIGKILL
before/after schema initialization, cohort insertion and trial reservation commits,
and three concurrent processes sharing one stable identity. Independent final
review reran these tests and found no remaining blockers. The final canonical
`mise run ci` passed 381 Vitest and 48 Python tests, formatting, strict lint/types,
coverage, build and ShellCheck (`gate-final.log`). No calibration inference, VM
execution, acceptance claim or capability observation was produced. Stable intent
reservation still needs an execution adapter that creates/recovers the same coding
identity and verifies pinned inputs before dispatch.

## Cycle 043: pinned trial preparation through Pi

Relentless's Luna worker authored the bounded artifact reader in one attempt.
`.harness/self-improve-043/red.log`, `prepare-red.log` and `pi-red.log` retain
failing tests before implementation and command integration. Six focused tests
cover exact author selection, source/runtime pin rejection, current scope/trust,
offline snapshot recovery and a mocked coding attempt that remains intact after
preparation is repeated. No unit test calls a provider.

The subprocess suite now additionally kills preparation after reservation, during
uncommitted source insertion, before workflow attachment and after attachment.
Every retry recovers one coding run/workflow with zero attempts. The suite retains
its six cohort commit cuts and concurrent reservation test. Independent final
review reran six focused tests and three subprocess tests without blockers.

The canonical `mise run ci` passed 387 Vitest and 49 Python tests, formatting,
strict lint/types, coverage, build and ShellCheck (`gate.log`). The real pinned
pilot040 assets also passed the new reader: QEMU 31,109,824 bytes, kernel 9,605,632,
base image 56,668,755 and acceptance file 502 (`pins-live.json`). That check only
read bytes; it did not launch a VM or inference. Automatic cohort execution,
verified outcome attribution and routing-evidence admission remain unfinished.

## Cycle 044: explicit trial advancement and cancellation

Relentless's Luna worker authored optional session cancellation for the verification
supervisor in one attempt. Red evidence in `.harness/self-improve-044/` includes
`red.log` (cancellation), `step-red.log` (advancement), `contract-red.log` (expected
execution binding) and `repair-red.log` (retained failed receipt versus repaired
checkpoint). Host integration adds the Pi command and shares the current dispatch
permission guard with ordinary workflow resume.

Twenty-one focused tests passed, including frozen-contract verification,
reconciliation without another VM call, partial-output no-replay, permission
revocation, session shutdown and test failure through repair/re-review to success.
Independent final review reran these tests and found no remaining blockers after
the receipt-directory fix. The canonical `mise run ci` passed 395 Vitest and 49
Python tests, formatting, strict lint/types, coverage, build and ShellCheck
(`gate.log`). Mocked test drivers establish orchestration invariants, not model
capability or acceptance-test adequacy.

A separate live cancellation check used the actual pinned pilot040 QEMU/kernel/
image through the updated Node adapter. After QEMU opened its controller channel,
an AbortSignal reached the Python supervisor. The report returned `interrupted`,
`reaped:true`, exit 1 and about 0.483 seconds elapsed. Evidence is retained in
`live-cancel/`, `live-cancel.log` and `cancellation-proof.json`. No model inference
or source promotion occurred. Complete cohort scheduling, outcome denominators,
aggregate measurements and routing-evidence admission remain unfinished.

## Cycle 045: read-only cohort accounting

Relentless's Luna worker authored the informational trial-state classifier in one
attempt. Host type checks caught nullable receipt handling and an invalid enum
comparison before integration (`worker-types.log`). Red evidence in
`.harness/self-improve-045/` also covers initial classification (`red.log`),
read-only report/workflow behavior (`report-red.log`), Pi command integration
(`pi-red.log`) and resumed review ambiguity (`review-red.log`).

Seventeen focused tests passed. They cover the full planned denominator, reserved
but uncreated trials, cancelled work, matching verified-but-unadmitted snapshots,
provenance-complete author timing, unknown billing estimates, read-only handles
and preparation/advancement regressions. A real workflow recovery transition from
an interrupted reviewing checkpoint to blocked/ambiguous_review remains
nonterminal in accounting and never replays the review. Independent final review
reran all 17 focused tests and found no remaining blockers.

The final canonical `mise run ci` passed 402 Vitest and 49 Python tests,
formatting, strict lint/types, coverage, build and ShellCheck (`gate-final.log`).
The report performs no inference or artifact acceptance. Its separate journal
snapshots are observational, not an atomic multi-database export; no coding
capability observations are admitted by this cycle. Complete workflow measurement
and verified evidence admission remain unfinished.

## Pi configuration skill — 2026-09-17

- The package manifest exposes `skills/relentless-configure/SKILL.md`. Pi 0.85.1's
  real skill loader found it with automatic discovery enabled and no diagnostics;
  an independent review also exercised Pi's package resolver.
- The skill-creator validator passed using isolated temporary Python dependencies.
- Independent forward-test covered subscription quota exhaustion, uncertain billing,
  an offline local model and controller-only evidence. No blocking findings; two
  stale documentation statements were corrected. No provider calls or live policy
  edits were made for this validation.
- Calibration admission foundation checks reproduced the invalid Zod array API
  failure before correction; nullable timing remains unknown rather than zero.
  The corruption fixture now explicitly makes its sealed assessment writable before
  tampering. Five focused suites passed (32 tests), and strict types passed.
- The full canonical gate passed: 407 Vitest tests, coverage thresholds, lint, types,
  build, ShellCheck and 49 Python tests. This does not establish live model capability
  or complete the still-unwired calibration admission UI/evidence integration.

## Cycle 046 — coding evidence admission integration

- Integration red: project calibration references were rejected before schema and
  loader support (`.harness/self-improve-046/integration-red.log`).
- Independent review found a cancellation race between pinned proof inspection
  and admission commit. The regression first persisted a stale admission instead
  of rejecting (`race-red.log`); fixed-order coding/workflow write fences and fresh
  checkpoint comparison made it pass without leaving an admission record.
- Tests exercise explicit Pi admission, unadmitted-source rejection, complete mixed
  outcomes, unchanged project permissions/settings, insufficient-sample routing
  rejection, stable timestamps and rejection of subsequently corrupted VM evidence.
- Independent final review: 35 focused tests passed, no remaining blockers.
- Canonical gate passed: 408 Vitest tests, 49 Python tests, coverage thresholds,
  formatting, type-aware lint, strict types, build and ShellCheck
  (`.harness/self-improve-046/gate-integration.log`).
- No live inference or live project policy edits in this integration validation.
  Actual representative provider calibration and full-workflow metrics remain
  unproven; author-only admitted evidence is not a total-cost comparison.

## Cycle 047 — live coding cohort

- All six V2 author trials reached terminal workflow states within one author
  attempt and one review pair each: six author calls, eleven review calls and two
  accepted VM executions. All process handles returned terminal results.
- The host admitted the complete cohort, then reloaded/revalidated it through
  `loadPiEvidence`. The router selected none at three cases/three samples/80%
  success. Both experiment and main project policy were left without a new
  evidence reference. Results and caveats are in
  [live coding calibration](live-coding-calibration.md).
- Independent review identified V1 oracle gaps before further trials. Three
  deliberately wrong implementations passed V1 and failed V2. V1 was retired;
  its already-dispatched two calls remain separate from V2 accounting.
- No product executable code changed in this pilot. The preceding 408-test/49
  Python-test canonical gate remains the code baseline; new documentation passed
  formatting. Live evidence is not generalized capability certification.

## Cycle 048 — review-validation diagnostics

- Failing tests demonstrated missing reason codes and missing report/attempt detail
  before implementation (`.harness/self-improve-048/red.log` and
  `integration-red.log`). Relentless's Luna worker authored the parser change in one
  attempt; source identity was checked before integration.
- Sixteen focused parser/review tests passed. Independent review ran eighteen
  focused cases and found no blockers. An additional workflow regression passed
  within fifteen workflow tests, proving persisted detail and no redispatch after
  reopen.
- Canonical gate passed: 410 Vitest tests, 49 Python tests, coverage thresholds,
  build, formatting, lint, types and ShellCheck (`gate.log`). The subsequently
  added restart regression passed its focused suite and received fresh lint/type
  checks; it raises the collected suite to 411 tests without changing product code.
- Frozen pilot records were not altered or replayed. Future live review failures
  will supply the diagnostic codes; prior generic failures remain unclassified.

## Cycle 049 — review and model-attempt accounting

- Pure and integration tests failed before the accounting implementation and report
  fields existed (`.harness/self-improve-049/red.log`, `integration-red.log`).
- Relentless's Luna worker authored the aggregator in one attempt. Host integration
  added report fields; lint prompted equivalent Zod 4 API updates. Ten focused
  tests passed, and independent review found no material issues.
- Canonical gate passed: 414 Vitest tests, 49 Python tests, coverage thresholds,
  strict types, lint, formatting, build and ShellCheck (`gate.log`).
- A read-only replay of the completed live pilot produced reviewer and combined
  attempt totals for all six rows (`live-accounting.json`). The existing admitted
  cohort revalidated with its six unchanged observations. No provider calls,
  policy edits or retroactive measurement-protocol changes were made.
- Whole-workflow elapsed time/cost remain unknown; the new totals do not include
  queueing, packaging, verification and orchestration overhead.

## Cycle 050 — verification timing receipts

- Pure timing, receipt persistence and report-field tests failed before
  implementation (`.harness/self-improve-050/red.log`, `integration-red.log`,
  `report-red.log`). Relentless's Luna worker authored the helper in one attempt;
  strict types exposed unchecked array reads (`worker-types-red.log`), corrected
  before integration.
- Tests cover successful/failed receipt persistence, unchanged timing on
  reconciliation, tampered VM timing rejection, invalid/regressing clocks and
  measurement failure not changing acceptance. Independent review passed nineteen
  focused cases with no blockers.
- Canonical gate passed: 418 Vitest tests, 49 Python tests, coverage thresholds,
  lint, strict types, build, formatting and ShellCheck (`gate.log`).
- The real six-row pilot admission revalidated under the rebuilt code. Legacy
  timing remains absent/unknown and its admission time is unchanged
  (`legacy-validation.json`). No provider calls or VM replay were used.
- The new receipt scope ends at assessment, before receipt persistence; it is not
  total workflow duration or a sum across failed/interrupted repair attempts.

## Cycle 051 — durable verification history

- Intent and accounting tests failed before implementation (`red.log` and
  `accounting-red.log` under `.harness/self-improve-051`). Relentless's Luna worker
  supplied the accounting helper in one attempt; host integration preserves all
  recorded verification attempts across repair and reserves identity before pack.
- Regression coverage includes packaging failure, reopening an intent before
  directory creation, refusing duplicate directories, package mismatch rejection,
  repair report totals and missing/legacy/overflow accounting. A test fixture's
  invalid outcome was corrected to exercise the intended package guard.
- Independent final review passed 48 focused tests with no remaining blockers.
  Canonical gate passed 423 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).
- Read-only legacy admission validation retained all six pilot observations and
  admission timestamp 1789685722464; legacy history totals remain unknown
  (`legacy-validation.json`). No provider call or VM replay was performed.
- Pending attempt durations, queueing and persistence overhead are not measured;
  these totals are not complete workflow latency and do not change admission's
  author-only measurement protocol.

## Cycle 052 — reviewer timing failures

- Two new tests failed before implementation (`.harness/self-improve-052/red.log`):
  a clock exception escaped review, and accounting rejected unknown latency.
  Additional coverage checks end-clock failure preserving quota, cost and abort.
- Relentless's Luna worker produced the fix in one attempt. Host corrections addressed
  the missed nullable report type and a test's optional signal
  (`worker-types-red.log`). Independent review passed 21 focused tests without
  blocking findings.
- Canonical gate passed 426 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).
- The live pilot's six observations, eleven reviewer attempts and original
  admission time revalidated without new inference or VM replay
  (`legacy-validation.json`).
- Report completeness means reserved reports are present; missing latency remains
  unknown even when cost is known. This does not establish full workflow timing.

## Cycle 053 — continuous verification and repair

- Contract/step and Pi command tests failed before implementation (`red.log`,
  `pi-red.log` under `.harness/self-improve-053`). Relentless's Luna worker authored
  the step adapter in one attempt. Host integration connects it to the existing
  runner and binds execution contracts in the journal.
- Tests exercise failed verification through repair and a second independent
  review pair to success within original budgets, unchanged-contract restart,
  completed-artifact reconciliation, pre-cancellation and pending-intent no replay.
  The continuous-loop test uses controlled provider and VM drivers; it is not a
  new live end-to-end model/VM trial.
- Independent review found unbounded input reads and stale trust checks. Bounded
  regular-file reading and live effect guards resolve both; regressions cover
  FIFO/oversized files and trust revocation during packaging (`trust-red.log`).
  Follow-up review passed 38 focused tests with no remaining blockers.
- Canonical gate passed 432 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`). The Python gate
  includes existing real process and VM tests.
- The old six-row pilot admission retained its original timestamp with no new
  provider calls or VM replay (`legacy-validation.json`). No existing workflow
  acquired a new contract retroactively.
- This provides explicit continuous execution of one coding workflow. Goal graph
  planning, cross-ledger context revisions and full workflow optimization remain
  incomplete. Source promotion and service installation remain separate actions.

## Cycle 054 — recover interrupted assessment storage

- Receipt-helper and interrupted-assessment regressions failed before
  implementation (`.harness/self-improve-054/red.log`). Relentless's Luna worker
  supplied the validator in one attempt; host integration persists the receipt
  before the assessment and reconstructs only absent assessments.
- Tests simulate a completed VM driver followed by failed assessment rename,
  then recover without dispatch. They also cover missing receipt, null/corrupt
  assessment, mismatched hashes, repeated reconciliation and nonzero supervisor
  exit despite a successful VM report. Recovery timing remains unknown.
- Independent review passed 30 focused tests with no blockers. Canonical gate
  passed 436 Vitest and 49 Python tests, coverage thresholds, formatting, lint,
  strict types, build and ShellCheck (`ci.log`).
- The real six-row pilot's legacy admission revalidated unchanged, including its
  original admission time (`legacy-validation.json`), without provider calls or
  VM replay. This does not claim recovery for interruption before receipt storage.

## Cycle 055 — live continuous trial and OAuth freshness

- An isolated continuous trial ran one Luna author and two reviewer attempts:
  Muse assessed the proposal; Grok returned an unknown inference failure. The
  workflow stopped with no VM execution or source promotion. This is failure
  evidence, not a successful end-to-end claim or new ranking observation.
- A metadata-only check found the saved Grok OAuth token expired. No credential
  values were emitted. The original error remains unknown rather than being
  retroactively labeled quota or definitively attributed to expiry.
- Freshness and preflight tests failed before implementation (`red.log`,
  `inventory-red.log` under `.harness/self-improve-055`). Relentless's Luna worker
  supplied the helper in one attempt. Tests cover expiry/clock boundaries,
  fresh-token use, zero-runtime expired-token rejection and inventory separation.
- A check using actual saved expiry and a guarded runtime factory returned `auth`
  with zero runtime/inference calls (`preflight-validation.json`). Credentials,
  the stopped trial and main project settings were unchanged.
- Independent review passed 36 focused tests with no blockers. Canonical gate
  passed 441 Vitest and 49 Python tests, coverage thresholds, formatting, lint,
  strict types, build and ShellCheck (`ci.log`).

## Cycle 056 — durable reviewer retry waits

- Retry eligibility and journal restart tests failed before implementation
  (`.harness/self-improve-056/red.log`). Relentless's Luna worker supplied the helper
  in one attempt; host corrections reject malformed retry metadata and remove a
  redundant phase check.
- Tests prove Retry-After survives reopening, no calls or pair spending before
  the due time, a successful fresh review pair without repeating the author,
  preserved failed reports, original pair-budget exhaustion and no retry for
  denials/auth/unknown/timeouts. Provider calls are controlled test doubles.
- Canonical gate passed 446 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`). The earlier
  six-row admission revalidated with its original timestamp, without inference
  or VM replay (`legacy-validation.json`).
- Retry waits are per workflow. Global reviewer health and immediate alternative
  selection remain unfinished; old blocked workflows are not rewritten.
- Independent final review passed 44 focused tests with no blocking findings.

## Cycle 057 — shared reviewer availability

- Routing, cooldown persistence and inventory regressions failed before changes
  (`.harness/self-improve-057/red.log`, `cooldown-red.log`, `inventory-red.log`).
  Relentless's Luna worker supplied the pair planner in one attempt.
- Tests cover shared cooldowns across workflows, waiting without spending a pair,
  immediate independent alternatives, final-budget cooldown retention, author
  exclusion and pinned-route constraints. Provider calls use controlled doubles.
- Independent review found a legacy checkpoint wait regression. A failing
  old-format SQLite restart test preceded the fix (`legacy-wait-red.log`). Final
  independent review passed 44 focused tests with no remaining blockers.
- Canonical gate passed 452 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`). The six-row
  pilot admission retained its original timestamp without inference or VM replay
  (`legacy-validation.json`).
- Reviewer health is shared across workflow journals and observational inventory.
  Author/goal dispatch health is still separate; newly observed mid-pair cooldowns
  may still stop a review. This does not establish complete goal orchestration.

## Cycle 058 — replace an unavailable reviewer within its pair

- New reviewer and workflow regressions failed before implementation
  (`.harness/self-improve-058/red.log`, `workflow-red.log`). Relentless's Luna worker
  supplied the route refresh in one attempt; host integration preserved its code
  after checking original source equality.
- Tests prove a newly cooled second reviewer is replaced by a permitted independent
  provider without repeating the author or first assessment, with one reserved
  pair and persisted actual route accounting. A forbidden metered alternative
  remains unused and partial evidence is retained. Calls use test doubles.
- Independent review passed 43 focused tests including admission compatibility,
  with no blocking findings. Initial gate failures were test-only require-await
  and Promise return issues; production code was unchanged by their correction.
- The rebuilt six-row pilot admission retained its original timestamp without
  inference or VM replay (`legacy-validation.json`). Durable partial-pair waits
  when no eligible replacement exists remain unimplemented.
- Final canonical gate passed 455 Vitest and 49 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).

## Cycle 059 — durable partial-review continuation

- Continuation, routing and workflow regressions failed before implementation
  (`.harness/self-improve-059/continuation-red.log`, `workflow-red.log`). Relentless's
  Luna worker supplied the validator in one attempt. A further failing test found
  missing equality between assessment and attempt routes (`worker-red.log`); host
  corrections added that check and removed an unchecked cast. Deprecated Zod
  no-op methods were removed after lint, retaining safe integer/finite validation.
- Deadline and accounting regressions failed before their fixes
  (`boundary-red.log`). Tests cover direct and workflow waits, unknown totals,
  one-pair final-budget completion, retained findings, source/request bindings,
  author exclusion, stale revisions, ambiguous operations, policy denials and
  quota exhaustion. Static constraints apply to reused routes; current evidence
  requirements apply to each remaining route.
- A controlled two-process smoke used rebuilt modules (`restart-smoke.mjs`). The
  first process saved author plus reviewer A; a separate process made no early
  calls, then dispatched only B at a deterministic due time. Records in
  `restart-project/started.json` and `resumed.json` prove one reserved pair, one
  author attempt and two accounted reviewer attempts. This used controlled worker
  outputs and did not run live provider inference or claim VM verification.
- Final independent review passed 72 focused and compatibility tests with no
  blockers. Canonical gate passed 475 Vitest and 49 Python tests, coverage
  thresholds, formatting, lint, strict types, build and ShellCheck (`ci.log`).
- The legacy six-row admission retained its original timestamp without inference
  or VM replay (`legacy-validation.json`). Interrupted in-flight reviews remain
  ambiguous; this change only resumes evidence saved before a known cooldown.

## Cycle 060 — bind goal tasks to coding workflows

- Projection and Pi handoff regressions failed before implementation
  (`.harness/self-improve-060/red.log`, `integration-red.log`). Relentless's Luna
  worker supplied the pure projection in one attempt; integration preserved its
  source after checking original equality, with host lint/style corrections.
- Tests cover scoped constraints and memories, dependency evidence, stable task
  identity, policy intersection, cancellation during author/reviewer calls,
  prevention of duplicate budgets through generic creation, and atomic binding
  to the verification specification. Workflow tasks cannot succeed through a
  textual answer. Controlled workers exercise the handoff without live inference.
- Independent review found read-only authentication, verification binding,
  duplicate creation and receipt shortcut gaps. Failing regressions preceded
  their fixes (`policy-red.log`, `core-red.log`). A further promotion review found
  a parent-process lock lifetime gap (`promotion-red.log`): the Python mutator now
  owns both goal and coding locks. Real-process tests prove both survive parent
  death and goal expiry prevents publication of new bytes. Interrupted captures
  retain recovery backups; promotion is not a whole-project atomic transaction.
- Storage fault tests were updated after splitting public creation from internal
  insertion. SQLite failure and actual uncommitted INSERT hooks preserve rollback
  and SIGKILL coverage (`creation-process-red.log`, `calibration-process-red.log`).
  Focused Pi creation and calibration process suites passed, with independent
  review of the revised fault boundaries.
- The rebuilt six-row pilot admission retained its original timestamp without
  inference or VM replay (`legacy-validation.json`). Automatic DAG dispatch,
  verified completion admission back into the goal ledger, and revision migration
  remain unfinished. The packaged configuration skill provides human review;
  runtime-enforced configuration proposal approval remains separate work.
- Final canonical gate passed 489 Vitest and 52 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`). Independent
  review found no remaining blockers for this handoff increment.

## Cycle 061 — admit verified artifacts into goals

- Completion, integration and Pi command tests failed before implementation
  (`.harness/self-improve-061/red.log`, `integration-red.log`, `command-red.log`).
  Relentless's Luna worker supplied the pure completion transition in one attempt;
  host integration retained its source after original-content comparison and
  made lint-only adjustments to receipt field extraction.
- Real verification inspection with controlled author/reviewer and VM drivers
  covers exact artifact provenance, admission, explicit Python source promotion,
  reopening and idempotent attempts/timestamps. Other tests reject altered VM
  reports, cancelled coding/goal state, lost project trust and expired memories.
  Revision removes the receipt. No provider inference runs inside these tests.
- A failing checkpoint-write lock probe (`commit-red.log`) preceded extending
  fences through goal COMMIT. A real SQLite event failure rolls back completion
  and attempt accounting. Independent review found terminal resume invalidating
  admitted workflows; `terminal-red.log` preceded the exact artifact guard fix.
  Final independent review passed 51 focused TypeScript and 16 promotion tests
  without remaining blockers.
- The rebuilt-module process smoke (`process-smoke.py`, `process-fixture.mjs`)
  kills Node immediately before and after goal COMMIT. Both coding and workflow
  fences remain held at each boundary. Restart and repeated admission produce
  exactly one event and one author attempt (`process-smoke.json`). Fixtures use
  controlled VM reports, not new live inference or emulator benchmark evidence.
- The legacy six-row pilot admission retained its original timestamp without
  provider calls or VM replay (`legacy-validation.json`). Goal acceptance here
  means a verified artifact; its dependency output explicitly does not claim
  source installation. Automatic coding DAG dispatch, unfinished-attempt budget
  reconciliation, revision migration and complete workflow efficiency evidence
  remain outstanding.
- Canonical gate passed 503 Vitest and 52 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).

## Cycle 062 — account for unfinished goal workflows

- The missing progress command/schema failed integration tests before changes
  (`.harness/self-improve-062/red.log`). Relentless's Luna worker supplied the pure
  projection in one attempt; integration retained it after source comparison.
  A failing admission regression preceded final-progress integration
  (`admission-red.log`); an invalid test lease argument was also corrected.
- Focused tests cover a consumed quota attempt and saved retry deadline, no early
  replay, in-flight observation, concurrent sync convergence, unchanged event/time
  suppression, counter rollback and identity rejection, event rollback, lost
  trust, cancellation/revision and admission after an initial zero-attempt record.
  All calls use controlled workers; observations do not authorize execution.
- Independent review passed 33 focused tests with no blocking findings. Its
  identified repair-revision limitation is documented: workflow resume must first
  reconcile a coding revision ahead of its saved workflow checkpoint.
- The rebuilt-module smoke (`process-smoke.py`, `process-fixture.mjs`) kills Node
  immediately before/after the progress COMMIT. Both input journals remain locked
  at each boundary. Repeated recovery produces one progress event and one observed
  author attempt (`process-smoke.json`), with no provider calls during recovery.
- The legacy six-row pilot admission kept its original timestamp without inference
  or VM replay (`legacy-validation.json`). Automatic observation collection,
  dependency scheduling, revision migration and complete workflow efficiency
  evidence remain unfinished. Progress and admitted counters are non-additive.
- Canonical gate passed 511 Vitest and 52 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).

## Cycle 063 — collect progress after Pi execution

- Pi execution regressions failed before integration
  (`.harness/self-improve-063/red.log`). Relentless's Luna worker supplied the
  best-effort collector in one attempt; host integration retained its source
  after original-content comparison and attached it to command settlement.
- Controlled tests cover both resume and run-verified quota outcomes, thrown
  actions with consumed attempts, shutdown, read-only status, SQLite write failure
  without loss of the primary result, throwing trust checks and unbound workflows
  without a new goal ledger. Collection makes no inference or admission calls.
- Independent review passed 34 focused tests with no blocking findings. Existing
  session ownership covers collection until settlement; inactive sessions skip
  observation writes. Abrupt process death may leave observations stale, so native
  coding/workflow journals remain execution authority.
- The legacy six-row admission retained its original timestamp without provider
  calls or VM replay (`legacy-validation.json`). Periodic collection, dependency
  scheduling, revision migration and complete efficiency evidence remain open.
- Canonical gate passed 518 Vitest and 52 Python tests, coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).

## Cycle 064 — bounded Pi goal scheduling

- Relentless's Luna worker (`dea46883-8530-46b2-b474-a3f15ce12e64`, one attempt)
  supplied the pure planner. Host integration adds explicit work declarations,
  stable workflow creation, journal-derived waits, dependency source checks,
  coding/review/verification/admission actions and shared supervisor ownership.
- Initial planner/integration regressions failed before implementation. Later
  boundary regressions reproduced acceptance after ownership loss during model
  return, verification publication and goal admission. Coding validation's
  regression was mutation-checked by removing its publication fence: the candidate
  was incorrectly accepted; restoring the fence passed. Evidence is under
  `.harness/self-improve-064/`, including the red logs and final focused output.
- Tests cover quota waits yielding to independent work, no premature dependency
  execution, changed specifications, declaration replacement, inactive Pi sessions,
  shared lease contention, late coding/review output and saved verification
  recovery without replay. These tests make no live inference calls.
- A real SIGKILL/restart smoke stopped after workflow creation. A fresh process
  rejected the still-live lease; a controlled 31-second clock advance then allowed
  recovery of the same coding identity. One author attempt and two review calls
  reached `verification_required`. Responses were controlled; no VM or provider
  ran (`process-smoke.py`, `process-smoke.json`). This does not prove replay safety
  for arbitrary in-flight external operations.
- Independent review identified the publication windows, rechecked the fixes and
  found no remaining blockers, including the final documentation. The full
  canonical gate passed 533 Vitest and 52 Python tests, scoped coverage thresholds,
  formatting, lint, strict types, build and ShellCheck (`ci.log`).
- Read-only legacy validation retained six admitted rows and the original
  timestamp without inference or VM replay (`legacy-validation.json`). Source
  promotion, continuous scheduling, revision migration, runtime configuration
  approval and representative end-to-end efficiency evidence remain unfinished.

## Cycle 065 — reviewed Pi configuration application

- Relentless's bounded Luna attempt `69eccfc7-1bc9-44ff-a082-84e120c32616` failed
  with `unknown` after one consumed attempt, about 19.5 seconds and unknown cost.
  It made no source change. The host implemented the proposal builder and Pi
  application path; the failure was not retried with a reset budget.
- Pure and integration tests failed before implementation, and the Pi command
  regression failed before wiring. Independent review found that settings-lock
  ownership was only checked after publication. A replacement/expiry regression
  reproduced the bug, then passed with ownership and elapsed-time checks before
  rename. Logs are retained in `.harness/self-improve-065/`.
- Controlled tests cover proposal source/root/digest binding, malformed policy,
  unrelated settings exclusion, explicit decline, missing confirmation, stale
  settings before/during review, cancellation, trust loss, tampering, redirection,
  existing lock contention and replacement/expiry during staging. Reapplication
  of exact target bytes reports `already_matches` without claiming new approval.
- Pi's real source-extension loader exercised proposal creation, headless rejection,
  declined application and confirmed application in an isolated project. It
  preserved unrelated settings and discovered the packaged configuration skill
  with no diagnostics. UI answers were controlled callbacks; this is not visual
  TUI validation (`pi-smoke.mjs`, `pi-smoke.json`). No provider calls occurred.
- The skill validator passed using previously isolated PyYAML dependencies. The
  skill now directs proposals through runtime Pi confirmation. Independent final
  review passed 21 focused tests with no remaining blockers and checked the skill
  and documentation's cooperative-lock/crash-recovery limitations.
- Canonical `mise run ci` passed 545 Vitest and 52 Python tests, scoped coverage,
  formatting, strict lint/types, build and ShellCheck (`ci.log`). The earlier
  six-row calibration admission revalidated with its original timestamp and no
  inference or VM replay (`legacy-validation.json`).
- This is approval enforcement for the Relentless command path, not a restriction on
  arbitrary direct filesystem edits. Chat/memory constraint interpretation,
  provider entitlement validation, continuous discovery, automatic goal integration
  and representative full-workflow efficiency remain separate unfinished work.

## Cycle 066 — continuous foreground goal execution

- Relentless Luna authored the pure wait planner in one attempt
  (`892c7ea9-9c49-4cb9-9cf1-d14153ad90b9`). The host compared its original
  source before application, then added the foreground controller and Pi command.
  The planner performs no inference, filesystem writes or permission decisions.
- Planner, controller and command regressions preceded implementation. Fixtures
  cover complete author/review/verification/admission progression, quota wait and
  reuse of cumulative attempts, independent work before blocked dependencies,
  cancellation/revision during wait, Personal-plan exclusion and repeated actions
  without journal progress. Initial single-task fixtures were corrected to create
  the intended contract rather than illegally removing task IDs via revision.
- A timing regression reproduced a retry becoming due before a step returned and
  incorrectly requesting input. Planning against the step-entry time now allows
  immediate rechecking while current deadline/authority checks still apply
  (`.harness/self-improve-066/elapsed-retry-red.log`, `final-focused.log`).
- A real process was SIGKILLed during a saved quota wait. A fresh process, with a
  controlled 61-second clock advance, resumed the same coding identity and
  completed the goal. The original failed attempt plus one successful author
  attempt remained two total; two independent reviewer responses and verification
  responses were controlled. No live provider or VM ran in this smoke
  (`process-smoke.py`, `process-smoke.json`).
- Independent review confirmed the controller and timing change with no blockers.
  The final canonical gate passed 556 Vitest and 52 Python tests, scoped coverage,
  formatting, lint, strict types, build and ShellCheck (`ci-final.log`). Initial
  lint-only issues were corrected before that final gate. The six-row legacy
  admission retained its original timestamp without inference or VM replay.
- Run action counts are per invocation, never usage counters. Timers do not write
  polling events or acquire worker leases. This adds foreground iteration and
  timed retry wakeups; source integration, automatic process/service restart,
  revision migration and representative full-workflow efficiency remain open.

## Cycle 067 — scheduler-fenced source publication

- Relentless Luna authored promotion-lease validation in one attempt
  (`69ee5e16-61dc-42d3-987d-85187f9bebbc`). The host removed redundant deprecated
  Zod `safe()` calls after lint reported them; `int()` retains safe-integer
  validation in the pinned version. Original-source comparison preceded application.
- TypeScript and native regressions preceded lease support. The wrapper captures
  authority, rechecks it before the effect and sends it separately from the
  immutable request. The native mutator checks the current owner/bound under the
  goal lock and enforces expiry before capture, publication and success.
- Tests cover missing/malformed/expired/replaced leases, rejection before writes,
  expiry after original-file capture, recovery under a fresh successor without a
  new transaction or overwritten backup, and the wrapper/native owner check.
  A real process-death fixture confirms that the guarded mutator retains goal and
  coding locks after parent death, releases them after its own death, and permits
  same-transaction recovery with fresh authority.
- Independent review found no blockers and passed all 20 promotion tests,
  including the combined process-death case. Focused host tests passed 41 cases.
  Evidence is retained in `.harness/self-improve-067/` (`python-red.log`,
  `integration-red.log`, `focused.log`, `python-final.log`). No live model or VM
  runs occur in the tests; source writes use disposable fixtures.
- Final canonical `mise run ci` passed 559 Vitest and 56 Python tests, scoped
  coverage, formatting, lint, strict types, build and ShellCheck (`ci-final.log`).
  Read-only legacy admission validation retained six rows and the original
  timestamp without inference or VM replay (`legacy-validation.json`).
- The fence is an internal prerequisite, not automatic-integration authorization.
  Goal-loop integration still requires an explicit contract, complete review and
  verification checks before mutation, and installation receipts tied to admission.
  Per-file recovery is not atomic project installation or exclusion of editors.

## Cycle 068 — verified source installation before goal admission

- Relentless Luna's single allowed attempt (`7f2ecb9c-34b1-417d-a3fb-982e5679906f`)
  failed with `unknown`. The consumed attempt is retained; the host implemented
  the receipt helper and integration. This is not autonomous worker success.
- Receipt, contract/integration and native workflow-reference regressions failed
  before implementation (`red.log`, `integration-red.log`, `python-red.log` in
  `.harness/self-improve-068/`). Automatic mutation requires explicit task opt-in,
  full review/verification inspection, current scheduler authority and native
  goal/coding/workflow fencing.
- Controlled tests cover source installation before completion, dependent-task
  eligibility, rejected artifact-only admission, conflicting editor changes,
  complete foreground execution, idempotent readmission and interruption after
  installation before admission. Retry reuses the coding identity with no new
  model calls. The interruption test injects an admission failure; it is not a
  new process-kill or live provider/VM experiment. Earlier native process-death
  fixtures remain part of the canonical gate.
- Independent review found no blocking issues, including the final recovery tests.
  Canonical `mise run ci` passed 566 Vitest and 57 Python tests, scoped coverage,
  formatting, lint, strict types, build and ShellCheck (`ci-final.log`).
  Read-only legacy validation retained six rows and timestamp 1789685722464,
  without inference or VM replay (`legacy-validation.json`).
- No live project was opted into installation. Existing-file installation remains
  per-file and requires quiescent editors; source equality is observed at admission,
  not guaranteed thereafter. Creates/deletes, project-wide atomicity, automatic
  service restart, revision migration and representative efficiency evidence remain
  unfinished.

## Cycle 069 — explicit Pi session restart

- Relentless Luna produced the pure planner in one attempt
  (`f02c1d73-f08a-4a32-9a22-a81e30f05275`). The host retained safe-integer
  validation through Zod `int()` while removing its redundant deprecated `safe()`.
  Original-source comparison preceded installation of the helper.
- Pure planner, configuration approval and resume integration regressions failed
  before implementation (`red.log`, `approval-red.log`, `integration-red.log` in
  `.harness/self-improve-069/`). Tests cover exact revision/deadline, missing opt-in,
  settings removal during waits and coding validation, and execution-aware approval.
- Independent review found native source publication lacked settings revocation.
  `native-red.log` records the post-capture regression before adding the immutable
  settings digest and native guard. All 22 native tests then passed, including
  backup preservation and same-transaction recovery after exact authorization is
  restored. Final review found no remaining blockers.
- The real Pi loader fixture exercises opted-in startup settling without inference,
  the pause command and shutdown; the existing lifecycle fixture suppresses old
  command results across shutdown/restart. Initial fixture attempts had missing
  acceptance and invalid local-model policy and were corrected; they are not
  evidence of a production regression. Cancellation overlap is covered separately
  by PiSessionWork tests. No new live provider/VM or process-kill trial is claimed.
- No live project restart opt-in was enabled. Pi must be running; this is session
  attachment, not an OS service. A still-settling prior operation is reported rather
  than forcefully duplicated. Automatic revision migration and representative
  full-workflow efficiency evidence remain open.
- Final canonical `mise run ci` passed 573 Vitest and 59 Python tests, scoped
  coverage, formatting, lint, strict types, build and ShellCheck (`ci-final.log`).
  The packaged configuration skill validator passed. Read-only legacy admission
  validation retained six observations and timestamp 1789685722464 without
  inference or VM replay (`legacy-validation.json`).

## Cycle 070 — summed measured workflow active time

- Relentless Luna authored the pure aggregator in one attempt
  (`39406643-bc61-475e-9771-ce57d52b3470`). Original-source comparison preceded
  installation; the host integrated report, admission and routing paths.
- Pure and integration regressions failed before implementation (`red.log`,
  `integration-red.log`, `report-red.log`, `admission-red.log` in
  `.harness/self-improve-070/`). The prospective protocol changes suite identity;
  legacy author-only observations omit the optional new field exactly.
- Controlled tests cover ranking reversal when a faster author uses more overall
  measured work, failed-trial inclusion, unknown-stage exclusion, failed authors
  before review, legacy verification telemetry, protocol mismatch, and a repeated
  complete cohort through verification, admission, Pi evidence loading and routing.
  Latency and cost ranking reject active-only observations. Existing independent
  review and VM-proof admission checks remain in use. No live calibration/VM
  benchmark or new project optimization policy was enabled.
- Integration testing and review caught admission reconstruction dropping the new
  field; it now preserves `activeMs`. Strict types caught use of a raw fixture task;
  the test now uses the normalized plan. Final independent review found no blockers,
  including the legacy telemetry regression and measurement documentation.
- The metric sums measured author/review/verification stages, including failures.
  It is neither wall-clock latency nor total compute cost: overlapping reviewer
  durations add, and waits/unmeasured overhead are excluded. Representative live
  cohorts, wall-clock accounting and total-cost evidence remain unfinished.
- Final canonical `mise run ci` passed 579 Vitest and 59 Python tests, scoped
  coverage, formatting, lint, strict types, build and ShellCheck (`ci-final.log`).
  The configuration skill validator passed. Read-only legacy admission validation
  preserved six observations, timestamp 1789685722464 and absence of `activeMs`,
  without inference or VM replay (`legacy-validation.json`).

## Cycle 071 — live repeated scheduler-contract cohort

- Read-only inventory identified fresh OpenAI OAuth and refresh-required Grok
  credentials; no refresh or Grok call occurred. A separate project froze two
  contract cases, Luna/Terra low-effort authors, Qwen/Muse reviewers, two repetitions,
  one author attempt and one review pair per trial. Bounds and exact source/test
  hashes are in `.harness/self-improve-071/`.
- Two preliminary stub VM checks failed. Independent review added a DAG diamond
  and superseded-conflict order cases before registration. Two reference VM checks
  then passed the expanded final tests. Preliminary baseline manifests intentionally
  have earlier test hashes; they are not claimed to use the expanded final suite.
- All eight trials are terminal and admitted: eight author attempts, twelve review
  calls and four candidate VM executions. Four workflows passed review and isolated
  checks. Source stubs still match frozen original hashes; no candidate was installed.
- Luna verified1/4 and Terra3/4. Two review invalid-JSON failures and one unknown
  author failure remain distinct from the confirmed conflict-detection coding defect.
  Both normal and stricter confidence-aware ranking return no qualifying route.
  The analysis retains every negative slot and leaves total cost unknown.
- This cycle changes experimental evidence and documentation, not runtime code.
  The last runtime canonical gate remains cycle070's 579 Vitest/59 Python passes;
  no redundant full gate is claimed for this empirical run. Live inference is outside
  unit tests and no new project optimization policy was enabled.

## Cycle072 — prospective malformed-review diagnostics

- A bounded Relentless Luna subscription worker supplied the pure helper in one
  checked attempt. Host-authored meaningful tests failed first, then passed with
  the helper and report integration; logs are in `.harness/self-improve-072`.
- Tests cover UTF-8 byte caps, shape precedence, no raw-content retention, strict
  rejection of fenced JSON, and absence of fabricated output diagnostics on
  successful reviews or inference failures. Independent review cleared the final
  revision and compatibility paths; a type-only interface correction resolved the
  initial canonical lint failure.
- Final `mise run ci` passed: 581 Vitest tests, 59 Python tests, format, lint,
  types, scoped coverage, build and ShellCheck. The packaged skill validates.
- Cycle071 reports and routing policy remain unchanged. This prospective metadata
  cannot reconstruct historical malformed responses or the unknown author failure.

## Cycle073 — bounded worker failure origins and denial preservation

- A single bounded Luna worker authored the enum and job-stage tracking; host
  tests caught and corrected an invalid awaited-function invocation before
  integration. Unit tests use mocks only; live worker execution is separate.
- Failure origins are fixed enum values and remain independent of retry kind.
  Tests cover schema rejection, job stage, response unknowns, unsettled cancellation,
  IPC transport, journal reopen and winning late-denial provenance. Review attempts
  can retain origin without recording provider messages.
- Independent review identified a pre-existing IPC precedence bug: malformed replies
  or child errors could erase an already received policy denial. Regression tests
  failed first and passed after strongest-failure merging preserved the denial.
- Canonical `mise run ci` passed: 588 Vitest and 59 Python tests, format, lint,
  types, scoped coverage, build and ShellCheck. Skill validation passed. Read-only
  load of the legacy047 admission still returns six observations.
- Evidence is saved in `.harness/self-improve-073`. No historical cohort or project
  routing policy changed. Earlier unknown failures remain unresolved.

## Cycle074 — live diagnostic cohort

- Frozen source/test bytes were independently checked against071; copied stubs,
  tests and Pi settings use a separate project. Four trials allow one author attempt
  and review pair each, at most four candidate VMs, with no source installation.
- Actual usage: four author calls, five review calls, one successful candidate VM.
  Three failures record Qwen invalid_json with fenced prefixes (51/956/808 bytes).
  No author failure was recorded. All four outcomes were admitted; no route meets
  the unchanged sample and success thresholds.
- Runtime code unchanged; canonical gate remains073's 588 Vitest/59 Python passes.
  Live inference is outside unit tests. Artifacts: `.harness/self-improve-074`.
- Measured review estimates total $0.0003285, not total cost or invoices. The small
  fixed-order cohort diagnoses formatting; it cannot rank general coding ability.

## Cycle075 — explicit review-format instruction

- Independent contract audit confirmed the only substantive change from074 is
  the review prompt. Source/test hashes and limits remain unchanged; contract and
  suite hashes changed, and evidence is stored in a separate project.
- Four author calls and eight schema-valid reviews produced three verified VM
  outcomes. Both reviewers found an in-domain conflict-detection defect in the
  fourth candidate; independent read-only source inspection confirmed it.
- All four observations admitted, including the failed candidate; unchanged ranking
  thresholds qualify no route. No repairs or source installation occurred.
- No runtime code changed. Canonical gate remains073's 588 Vitest/59 Python passes;
  this live experiment is separate from unit tests. Artifacts: `.harness/self-improve-075`.
- Partial metered review estimates total $0.0015986; total cost is unknown. New
  candidates and fixed order prevent causal attribution of improvements to the
  prompt alone. The packaged skill recommends this instruction prospectively.

## Cycle076 — conditional repair from faulty code

- Initial one-case creation was rejected by the real schema before dispatch. The
  revised two-case contract was independently validated and froze four trials with
  at most eight author calls, sixteen reviews and eight candidate VMs, plus two
  baseline VMs. Models remained pinned; feedback repair within budgets was allowed.
- Both starting implementations failed inside pinned VMs. The facts seed is an exact
  copy of075's actual failed candidate; eligible is the original incomplete stub.
- Actual four author calls, six reviews and three candidate VM passes produced
  three verified first-attempt repairs. Luna facts has one untagged unknown before
  review. All outcomes admitted; no second attempt or escalation occurred.
- Runtime unchanged; canonical gate remains073's 588 Vitest/59 Python passes.
  Live inference is separate from unit tests. Artifacts: `.harness/self-improve-076`.
- No source integration or old attempt reset occurred. Cost known only as a partial
  $0.0009807 metered review estimate; rankings remain empty under fixed thresholds.

## Cycle077 — outer coding-attempt origin diagnostics

- A bounded Luna worker supplied the candidate in one checked attempt. Host tests
  failed before implementation; a post-write check test also caught missing stage
  transitions in the candidate, corrected before final review.
- Tests cover malformed output, checks before/after candidate writes, publication,
  preservation of provider denial origins and unsettled cancellation. Independent
  review cleared the final logic; its focused compatibility set passed65 tests.
- Final `mise run ci` passed: 592 Vitest and 59 Python tests, format, lint, types,
  scoped coverage, build and ShellCheck. Skill validation passed; read-only reload
  of076 admission still returns its four observations.
- Artifacts are in `.harness/self-improve-077`. No new calibration or policy changes;
  prospective origin labels cannot explain the earlier076 unknown failure.

## Cycle078 — fresh Luna repair diagnostics and local readiness

- Independent contract audit checked the real planner, two source/test hash pairs,
  reviewer independence and budgets. Both trials finished first-attempt verified:
  two authors, four reviews, two candidate VMs; no new baseline VM was needed.
- All observations admitted without changed thresholds; no ranked route. No failure
  or repair feedback was observed, and076's unknown is not retrospectively explained.
- Read-only curl to127.0.0.1:18080 failed to connect; installed files exist. No local
  inference/server startup/download occurred. Artifacts: `.harness/self-improve-078`.
- Runtime unchanged; canonical gate remains077's592 Vitest/59 Python passes. The
  experiment ran outside unit tests. Partial metered review estimates $0.0008555
  are not total costs. No source installation or old cohort mutation occurred.

## Cycle079: managed local lifecycle

Canonical `mise run ci` passed: 600 Vitest tests and 64 Python tests, including
five new real-process lifecycle tests; format, lint, types, coverage and build
passed. Red evidence precedes the new configuration, lifetime and snapshot
implementations in `.harness/self-improve-079/`. Skill validation passed.
Independent review required closing the artifact verify/reopen race; the final
implementation hashes private copies and executes those copies.

A separate authorized real Pi/Qwen smoke accepted expected JSON in 14.3 seconds,
then confirmed the endpoint closed and no owned snapshot directories remained.
Unit/process tests use fixtures and do not invoke models. Active project settings
remain unchanged. Named-library pins do not establish a hermetic loader graph,
and process/file limits do not establish a hard host-memory ceiling.

## Cycle080: Pi-native goal registration

Canonical `mise run ci` passed with 604 Vitest and 64 Python tests. Focused
registration/extension tests cover preserving policy and constraints without
dispatch, rejecting configuration overrides, dependency cycles, invalid contracts,
cancellation and revoked trust before ledger creation. A Relentless Luna worker
authored the adapter; host corrections addressed refined-schema projection and
the local test fixture's concurrency requirement. This validates goal registration,
not the still-pending representative end-to-end project run.

## Cycle081: dependent project completion

A two-task local job dispatcher completed through the real Pi command handler:
two Luna author calls, four independent Qwen/Muse reviews, two passing candidate
VM runs and verified installation of both modules. The dependent task waited for
its prerequisite's admission. No runtime changes were made this cycle; the last
canonical gate remains cycle080 (604 Vitest and 64 Python tests). This run adds
live integration evidence, not outage, feedback-repair or abrupt-crash evidence.
See [project acceptance](project-acceptance.md) for scope, artifacts and next steps.

## Cycle082: recovery boundary evidence and output failure

A test-only defective candidate and outage consumed two attempts. SIGKILL after
the saved retry checkpoint preserved feedback, identity, lease and cooldown;
restarts did not spend another attempt before the deadline. The final real Luna
repair failed at `coding_output` with unknown specific cause. The exhausted
workflow remains blocked and no source was installed. No budget reset or model
capability admission was performed. Next: bounded edit-validation reasons and
reason-specific recovery, followed by a fresh declared repair exercise. See
[acceptance evidence](project-acceptance.md#cycle082-crash-cooldown-and-failed-repair).
Runtime unchanged; cycle080 canonical gate remains the last full gate.

## Cycle083: coding output reasons

Canonical `mise run ci` passed: 610 Vitest tests and 64 Python tests, plus format,
lint, types, coverage and build. Independent review passed 96 focused parser,
runner, journal, failure and legacy-worker tests. Skill validation passed.
The cycle082 journal reopens under the new build with its three consumed attempts
and unspecified output cause intact. No live inference was used in unit tests;
one separate Relentless Luna author call produced the parser proposal. Red/green,
gate and legacy inspection evidence is retained in `.harness/self-improve-083`.

## Cycles084–085: verified feedback repair

084 exposed `invalid_replacement` on its only real repair call and remains blocked.
085, a fresh task requiring complete-file output, completed review-feedback repair
with one actual Luna call, four Qwen/Muse reviews, isolated verification and managed
installation. No prior budget or result was reset. See [acceptance scope](project-acceptance.md#cycles084085-diagnosed-rejection-and-successful-feedback-repair).
Runtime unchanged; cycle083 remains the canonical gate (610 Vitest/64 Python).
Next product acceptance work: actual Pi UI installation/configuration and execution,
then broader representative task/role evidence; do not treat this tiny example as
general capability qualification.

## Cycle086: Pi terminal package and review path

Actual Pi PTY startup loaded the local package, skill and extensions. Terminal
commands prepared a configuration proposal, opened confirmation, and declined it
without changing settings. An isolated Pi config directory avoided an unwritable
global trust lock; no credentials were copied and no inference ran. See
[UI coverage](project-acceptance.md#cycle086-actual-pi-terminal-installation-and-configuration-review).
Runtime unchanged; cycle083 canonical610/64 gate remains current. Affirmative
application and interactive model execution remain distinct unverified coverage.

## Cycle087: Pi goal status

Canonical `mise run ci` passed: 613 Vitest tests and 64 Python tests, plus format,
lint, types, coverage and build. Independent review passed 24 focused tests.
The new command was exercised in an actual Pi PTY against cycle084: it displayed
zero goal-recorded attempts alongside two of two consumed author attempts and the
saved `invalid_replacement` failure. No dispatch or progress synchronization was
performed; the session exited cleanly. The test used an isolated Pi agent directory
and an explicit local Relentless extension. Evidence is in `.harness/self-improve-087`,
including `ui-status.json`. This is actual interactive status coverage, not live
inference coverage. Existing journals remain authoritative.

## Cycle088: session inventory

Canonical `mise run ci` passed: 617 Vitest tests and64 Python tests, with format,
lint, types, coverage and build. Independent review passed19 focused inventory
checks and11 focused checks after pagination. Skill validation passed. Tests
cover billing/cooldown exclusions, scope/effort filtering, unknown catalog input,
no journal initialization/dispatch, and explicit discovery pagination.

An actual Pi terminal run rendered session inventory but exposed excessive output
from hundreds of available unconfigured models. That prompted pages of20 with
totals/continuation; the final pagination was verified offline, not rerun in the
terminal. Evidence and the truncated initial capture are in
`.harness/self-improve-088`. One separate Relentless Luna call authored the projection;
no provider probes or live inference occur in inventory or unit tests.

## Cycle089: completed outage-recovery drill

Fresh-goal baseline failed isolated tests; synthetic provider outage then preserved
author budget and deadline across an immediate Pi command retry. After cooldown,
one real Luna author and two Qwen/Muse reviews led to isolated test success and
verified installation. The same goal completed without resetting its two consumed
slots. Runtime unchanged; cycle088 remains the canonical gate (617 Vitest/64 Python).
See [acceptance scope](project-acceptance.md#cycle089-provider-cooldown-through-completed-installation).

## Cycle090: broader coding evidence

Independent review strengthened two new task oracles before freezing a four-case,
two-model cohort. Four isolated baselines failed; seven of eight real workflows
verified, including a review-driven repair of a genuine event-map lookup defect.
One Qwen review timeout remains a negative observation. All eight results admitted
after independent proof/pin inspection; existing per-case sample threshold blocks
ranking. Nine author calls, 17 reviews, seven candidate VMs; no runtime changes.
Cycle088 remains the canonical gate (617 Vitest/64 Python). See
[acceptance scope](project-acceptance.md#cycle090-four-task-coding-cohort-and-real-feedback-repair).

## Cycle091: bounded review cancellation settlement

Four regressions reproduced lost late blocking failures and unconfirmed shutdown.
Relentless's Luna worker authored the fix; strict typing/lint corrections were
integrated locally. Canonical `mise run ci` passed 625 Vitest and 64 Python tests,
plus format, lint, types, coverage and build. Final independent review passed
47 focused checks with no actionable findings. Tests include late auth/policy/
permission/approval, late successful output, quota retry metadata, stale
checkpoints and cost callbacks during/after cancellation. No live inference ran
in unit tests; one separate author call generated the patch. See
[settlement semantics](recovery.md#review-cancellation-settlement). Historical
timeouts remain unchanged; ordinary review timeouts still do not authorize retry.

## Cycle092: explain task-specific routing evidence

Relentless's Luna worker refactored the scorer into a shared assessment used by both
ranking and the new read-only `/relentless explain` command. Red tests reproduced
missing assessment/command behavior; canonical `mise run ci` passed 629 Vitest and
64 Python tests, with format, lint, types, coverage and build. Skill validation
passed. The admitted cycle090 evidence explains Terra's per-case sample shortage
and Luna's sample/success-rate gaps without changing scores, configuration or
dispatching inference. Both remain unqualified with null scores. The helper was
exercised against actual admitted evidence; command dispatch was tested offline,
not in an interactive Pi terminal. Evidence is in `.harness/self-improve-092`.

## Cycle093: bounded cross-provider continuation

Fresh baseline failed isolated tests. One synthetic Luna outage triggered one real
Muse author within the same two-slot budget; its candidate is retained. Qwen review
passed; Grok review failed authentication during worker setup. Workflow correctly
blocked before VM/installation with source unchanged. Static preflight required
two reviewers outside both author providers. Runtime unchanged; cycle092 remains
the canonical gate (629 Vitest/64 Python). See
[acceptance scope](project-acceptance.md#cycle093-cross-provider-author-fallback-and-review-authentication-block).

## Cycle094: explicit reviewer authentication recovery

Canonical `mise run ci` passed 637 Vitest and 64 Python tests plus format, lint,
types, coverage and build. Independent review passed 42 focused checks. Initial
regressions covered missing recovery and command behavior; a review-found stale
publication race gained its own red/green cancellation test. Final save now holds
the exact coding checkpoint and rechecks goal authority. The Relentless author call
failed edit validation; the host implemented the change and retained that failure.

Synthetic tests prove preserved candidates/counts/reports, setup-auth-only gating,
stale/denial/exhaustion refusal, project trust and no-dispatch behavior. A real
read-only Pi command-handler inspection of cycle093 returned the unchanged auth
block and one remaining review pair. No real login retry or interactive UI run
was performed; provider refresh remains pending. Evidence is in
`.harness/self-improve-094`; see [recovery semantics](recovery.md#explicit-reviewer-authentication-recovery).

## Cycle095: complete repeat cohort

Eight new terminal trials retained: five verified, three unknown Qwen inference
failures near the review deadline. Independent proof inspection passed; all eight
rows admitted and merged with all090rows. The original policy now has two samples
per case/model but still rejects both workflows on observed success rates. No
thresholds or project routing changed. Runtime unchanged; cycle094 remains the
canonical gate (637 Vitest/64 Python). See
[acceptance scope](project-acceptance.md#cycle095-retained-repeat-cohort-rejects-premature-optimization).

## Cycle096: preserved-candidate reviewer deadline probe

Separate bounded live diagnostic used two reviewer calls, zero authors, with a
120-second per-review deadline. Qwen returned findings after 75.012 seconds; Muse
returned no findings after 31.813 seconds. Original checkpoint and workflow
bindings were checked using fresh readers before dispatch and after completion.
Preflight review caught a pinned read-only transaction that could hide workflow
changes; the diagnostic now opens a fresh workflow reader for every check.
No product runtime or tests changed; cycle094 remains the last canonical gate
(637 Vitest/64 Python). See the acceptance scope and retained diagnostic artifacts.

## Cycle097: SDK terminal recovery acceptance

Pinned dispatcher baseline failed in the isolated VM. Actual Pi SDK terminal
commands created a goal, observed a synthetic cooldown, exited/restarted, refused
an early dispatch, then completed one real author/two reviewer calls, isolated
verification and verified installation. Independent pre-install inspection passed
exact candidate/test/proof bindings. Final goal/task are completed with both
slots and the original outage retained. No product runtime changed; the last
canonical gate remains cycle094 (637 Vitest/64 Python). See acceptance scope for
stock CLI sandbox restrictions and the read-only SDK credential adapter.

## Cycle098: workflow-aware status

Four status regressions failed before Relentless's Luna worker patch; all seven
status tests pass afterward. Independent review passed 14 focused checks.
Canonical `mise run ci` passed 641 Vitest and 64 Python tests, plus formatting,
lint, types, coverage and build. Documentation edited afterward passed its scoped
format check. Reading the actual completed cycle097 goal now reports a verified,
current-revision workflow alongside the retained coding snapshot and outage.
No status read dispatches inference or revalidates installation proof. Evidence:
`.harness/self-improve-098`.

## Cycle099: absent-original installation primitive

New creation regressions failed against the original installer before executable
changes. A single Relentless Luna proposal was rejected before execution because it
removed existing authority fences. The host implemented targeted changes while
preserving those guards. All 30 promotion tests passed, including eight new tests;
independent review found no actionable issue. Canonical `mise run ci` passed 641
Vitest and 72 Python tests, formatting, lint, types, coverage and build.
Subsequent documentation edits passed scoped formatting. This verifies the Python
installation primitive only; Pi coding-schema/checkpoint/review integration and a
new-file end-to-end run remain pending. Artifacts: `.harness/self-improve-099`.

## Cycle100: explicit absence across coding workflows

New-file tests failed before executable changes. Coverage includes private source
projection, nullable checkpoint recovery, existing-empty-file rejection, parent and
symlink boundaries, Pi creation and calibration source pins. Independent review
caught contradictory instructions banning all new files; two prompt regressions
then failed before correction. `prompt-red-actual.log` records that failure;
`prompt-red.log` was an earlier passing run and is not red evidence.

Canonical `mise run ci` passed 648 Vitest and 72 Python tests, formatting, lint,
types, coverage and build (`.harness/self-improve-100/ci-final.log`). The earlier
`ci.log` records a lint failure corrected before that gate. A real new-file task
failed twice in isolated execution after both reviewer pairs approved it. No file
was installed and no goal acceptance was recorded; see cycle100 acceptance scope.

## Cycle101: repair guidance and execution facts

One prompt contract regression failed before a Relentless Luna proposal was applied;
36 focused tests passed in independent review. Canonical `mise run ci` passed
649 Vitest and 72 Python tests, formatting, lint, types, coverage and build. The
later skill/document edits received scoped formatting and independent review.

Live diagnostic evidence distinguishes the prompt-only failure from the subsequent
runtime-context pass; neither constitutes reviewed goal delivery. See cycle101
acceptance scope. The skill validator could not start because its Python environment
lacks `yaml`; no dependency was installed to conceal that limitation. Frontmatter
was unchanged; the added instructions were checked against actual memory/context
schemas and the VM packager.

## Cycle102: Pi new-file repair and installation acceptance

No runtime code changed; the last canonical gate remains cycle101 (649 Vitest,
72 Python plus format/lint/types/coverage/build). A fresh pinned baseline failed
with the target absent. A real Pi SDK terminal then exercised author/review,
failed VM, bounded repair/review, successful VM and verified source installation.
Independent pre-install inspection passed all proof bindings. The final journal
records a completed goal, admission, original-null baseline and unchanged budgets;
installed bytes match the verified candidate. Prior failed cycle100 remains intact.
See cycle102 acceptance scope; documentation edits passed scoped formatting.

## Cycle103: measured effort selection

A routing regression demonstrated that qualified higher-effort evidence was
ignored whenever a lower effort was supported. A separate Pi explanation
regression exposed the same omission. Relentless's Luna worker extracted a shared
eligible-route enumerator; the host connected Pi explanation to it. With explicit
optimization it considers all supported efforts at or above the task floor;
without optimization it preserves the original minimum-effort choice.

Focused checks passed for measured selection, missing evidence, model/provider
pins, billing, quality, effort floors, Pi session effort pins, review independence
and evidence qualification. These use synthetic observations to test selection;
no new model capability claim or routing qualification follows from them.
Evidence is in `.harness/self-improve-103`.

Independent review found two affected boundaries. Goal dispatch authorization
must qualify the exact selected effort against goal-authorized evidence, rather
than accept a different qualified effort. Partial review continuation must retain
an already completed permitted higher-effort assessment without reranking history
or dropping the task floor. Both regressions failed before their fixes and passed
afterward. Existing nonoptimized continuation behavior remains unchanged.

Final canonical `mise run ci` passed 653 Vitest and 72 Python tests, formatting,
lint, types, coverage and build (`ci-complete.log`). Earlier gate logs retain two
corrected test-lint failures. Independent re-review passed 34 focused tests across
seven suites with no remaining actionable finding. Documentation edits afterward
passed scoped formatting.

## Cycle104: complete prospective workflow cohort

Eight fresh trials covered four existing pinned harness cases with Luna/Terra low,
independent Qwen/Muse reviews, declared 120-second worker deadlines and inspected
execution context. All eight passed on one author attempt: eight author calls,
16 reviews and eight VMs. Independent inspection revalidated every proof chain,
original source pin, review independence and stage accounting before complete
cohort admission. No source installation or runtime code change occurred.

The admitted suite hash is
`576a2515807fcca42732491bdc62655942d45ebf62f8438fac030b0708ba6552`.
Both route assessments report four successes from four trials, null score,
`qualified: false` and `case_samples`: the existing two-samples-per-case floor was
not lowered. Historical cohorts have a different suite hash and remain separate.
Partial metered reviews total $0.003346788; total cost stays unknown. All foreground
processes exited; Personal-plan steps were explicitly dispatched, without an
unattended loop. Last canonical gate remains cycle103 (653 Vitest/72 Python);
scoped documentation formatting passed. Artifacts: `.harness/self-improve-104`.

## Cycle105: matching repeat and evidence-driven route selection

An unchanged bounded repeat of104 completed eight verified trials with eight
author calls, sixteen independent reviews and eight VMs. Every proof chain,
source pin, review and stage record passed independent inspection before complete
cohort admission. Project sources remained unchanged. All sixteen 104/105 rows
were combined under the existing policy; unrelated suite rows were not merged.

Both models pass the declared sample/success policy with 8/8 successes, and actual
routing selects Luna low by measured workflow active time. Read-only constraint
previews preserve a Terra pin and candidate exclusion; missing higher-effort or
total-cost evidence refuses selection. A stricter confidence threshold qualifies
neither. This proves scoped policy-based selection, not general competence or a
causal performance advantage. All processes exited; no runtime code changed and
last canonical gate remains cycle103 (653 Vitest/72 Python). Documentation formatting
passed. Evidence: `.harness/self-improve-105`.

## Cycle106: proposed configuration evidence preview

A command regression failed before a Relentless Luna worker implemented the read-only
proposal reader and Pi `explain-proposal` command. The first proposal retained an
overescaped command regex; the same regression caught it before host integration
corrected parsing, strict capture guards and shared timestamp use. Tests cover no
confirmation/dispatch/settings mutation, stale settings, settings changed during
preview, foreign roots, untrusted callers and invalid IDs. Independent review
passed 24 focused checks. Canonical gate passed 655 Vitest and 72 Python tests,
formatting, lint, types, coverage and build.

The first SDK terminal launcher omitted package registration for the calibration
project. Pi treated the slash text as chat and made one unintended OpenAI Codex
GPT-5.5 subscription call with all tools disabled. Its UI displayed a $0.015
estimate; this is not a known billed charge. The session was stopped and exited;
no settings or project sources changed. A subsequent startup assertion rejected an
incorrect loader option before exposing a terminal or making an inference call.
The corrected launcher uses the installed SDK's `resourceLoaderOptions`, explicitly
loads Relentless extensions and requires command registration before startup.

Actual Pi SDK terminal commands then saved a proposal referencing both admitted
cohorts and explained its model/effort evidence successfully, reporting
`proposed: true`, `configured: false`, `dispatched: false`. Settings bytes remained
identical and the successful preview session used no inference. Both terminals
exited. This is SDK terminal evidence, not stock CLI validation. Artifacts and UI
captures are in `.harness/self-improve-106`; the setup failure remains separate.

## Cycle107: ordinary Pi installation and initial discovery

The stock Pi CLI installed this local package into a fresh external project at
`/tmp/relentless-install-107-sh7P8N`, using an isolated writable Pi agent directory.
Verbose terminal startup loaded all four extensions and the configuration skill.
Initial inventory then exposed a real bootstrap bug: missing Relentless policy was
treated as an error, preventing discovery before configuration.

A command regression failed first. One Relentless Luna subscription coding call
proposed the applied fix: null project policy yields no configured candidates and
lists native session-visible models; malformed policy still rejects. Tests also
cover missing settings, install-only settings, unchanged settings, no journal
creation, no dispatch and untrusted callers. Independent review passed 16 checks
across three suites without actionable findings. The canonical gate passed 656
Vitest and 72 Python tests, formatting, lint, types, coverage and build.

The restarted stock CLI successfully returned inventory and a final pagination
page with no Relentless policy or health journal creation. The main inventory capture
is truncated; startup, original failure and final page are separately retained.
All terminals and the coding worker exited. No inference was requested by these
terminal commands; the one development worker call is separate. Pi's offline flag
disables startup networking, not inference. Environment-provided model visibility
does not establish subscription authentication, quota or permission to dispatch.
This proves local installation and discovery, not a stock-CLI coding goal or
standalone archive distribution. Evidence: `.harness/self-improve-107`.

## Cycle108: model-callable discovery for the setup skill

Rechecking stock Pi with the existing global login store reproduced EPERM for
settings/auth lock creation. That terminal exited without inference. This remains
an environment limitation for stock-CLI subscription-backed goal acceptance.

A real Pi loader regression then failed on missing `relentless_inventory`. One
Relentless Luna worker supplied the new read-only tool; host integration corrected
its legacy TypeBox import, optional abort-signal handling and number formatting.
The tool reuses command inventory, validates pagination input, checks trust and
session lifecycle before/after reading, and returns model metadata to the caller.
Tests reject arbitrary arguments, malformed settings, cancellation, trust loss
and shutdown, and prove no policy or journal creation. Independent review found
no actionable blocker. Canonical gate passed 656 Vitest and 73 Python tests plus
formatting, lint, types, coverage and build. The first lint failure is retained.

Two bounded Pi SDK Luna subscription sessions each invoked the tool once and
produced two assistant responses (tool request and final response). The first
diagnostic had not initialized native availability and correctly returned zero
models; its result is retained separately. After explicitly refreshing the native
registry, the second returned 386 session-visible entries, paginated, with no
configured candidates. The count is not quota, capability or billing entitlement.
Both sessions allowed only `relentless_inventory`, used existing read-only OAuth,
disabled automatic retries, created no project settings or journals and exited.
These are tool-call acceptance checks, not full setup-skill or coding-goal runs.

TypeBox 1.3.7 was promoted from the existing locked dependency graph to a direct
dependency; its package has no install scripts. The package-manager add command
could not resolve an unrelated existing Prettier pin from offline metadata, so the
importer reused the existing TypeBox snapshot. Frozen offline installation with
scripts disabled passed; all previous dependency versions were preserved. The
first worker request was rejected before inference because it declared a hidden
extension path; the corrected request left extension registration to the host.
Evidence and retained failures: `.harness/self-improve-108`.

## Cycle109: setup skill drafts a reviewable policy

A real Pi loader regression failed on the absent proposal tool. One Relentless Luna
worker supplied `relentless_config_propose`, applied unchanged with host extension
registration. It accepts only a configuration object, reuses bounded proposal
persistence, checks trust/cancellation/session generation, and returns the exact
proposal and human apply command. It exposes no confirmation or apply operation.
Tests verify invalid and approval-shaped inputs reject, no settings mutation,
unrelated settings remain private, idempotent proposal saving and shutdown refusal.
Independent source review passed all three loader/runtime tests. Canonical gate
passed 656 Vitest and 74 Python tests plus formatting, lint, types, coverage and
build; subsequent documentation/skill formatting passed.

A bounded Pi SDK Luna low subscription session invoked the installed
`/skill:relentless-configure` with only read, inventory and proposal tools. Its scope
was a fresh small TypeScript project, two named OpenAI candidates, no metered use,
no probes, no restart intent and no application. Nine tool calls and four assistant
responses produced one valid proposal:
`3168da5853197fe083f8a68a6c5d4c825d7b87b397767cd46d2c90684d6be159`.
Three reads returned expected missing fresh-project paths; their errors remain in
the transcript. The saved proposal has subscription-only Luna/Terra at low effort,
metered access disabled and no resume intent. The skill explicitly reported that
the same-provider reviewer pool is not coding-workflow-ready, and that task
qualification and measured cost/latency remain unknown. Tier and preferences are
proposed policy, not measured competence. No settings were created or applied.

The session and author worker exited. The proposal remains pending in the
diagnostic project; it is not the repository's active configuration. This verifies
the SDK setup skill through drafting, not stock-CLI authentication, human approval,
or a coding goal. Artifacts: `.harness/self-improve-109`.

## Cycle110: deterministic independent-review pool coverage

A failing inventory regression showed missing provider-count advice. The first
bounded Luna author returned invalid edits and applied nothing; that attempt and
its consumed budget remain preserved. One separately bounded full-file author
call produced the coverage implementation. Host integration preserved the existing
proposal description and validation, used portable paths, and added a final trust
check after reading native model data. A real-loader regression caught that missing
check in the worker proposal before correction.

Inventory now reports distinct eligible reviewer providers excluding each author,
and excluding the union of all currently eligible author providers. It reuses role
filters for billing, session scope, supported effort, availability and cooldowns.
Empty author pools cannot be sufficient. Tests cover same-provider aliases,
single-author versus combined-author exclusions, and filter-related loss of
coverage. The proposal tool returns the same advisory result without changing the
saved proposal schema or digest. Independent review passed six inventory and three
loader tests; canonical gate passed 657 Vitest and 74 Python tests plus formatting,
lint, types, coverage and build.

With actual Pi native availability metadata, the tool reevaluated cycle109's
pending proposal and reported zero independent reviewer providers for both Luna
and Terra. The proposal ID and file bytes stayed identical, settings remained
absent, and the check made zero inference calls. This is a direct SDK tool check,
not another model-driven setup run. Coverage describes current role pools, not
task-specific eligibility, quota, capability or historical authors. Runtime author
history exclusion is unchanged. All processes exited. Artifacts and both retained
failure records: `.harness/self-improve-110`.

## Cycle111: ordinary Pi CLI delivery completed

The user launched the prepared ordinary Pi CLI from their Terminal in a separate
project, avoiding this executor's global Pi lock-write restriction. The saved goal
`fbeae196-85f3-459d-8f33-700647ed0195` completed after one author attempt, one
independent Qwen/Meta review pair, accepted isolated VM verification and guarded
installation. The user's final command returned `action: admitted`, `phase: completed`.
No host code copying or manual candidate repair completed this goal.

Fresh read-only inspection revalidated the verification proof against the pinned
execution specification and matched installed files to the promotion transaction.
Installed dispatch.ts SHA256 is
`3afd303f1baddcd4b52a275c3775f6cede30f7a4f63c934a83814c8ee6bd38e0`.
Independent review confirmed the same tested/reviewed revision, unchanged graph.ts
and test oracle, and preserved two-author/four-review limits. Evidence is saved in
`.harness/self-improve-111/completed.json` and the prepared project's journals.
An initial host inspection used a mistyped promotion directory hash and failed
ENOENT; reading the actual directory corrected the inspection without mutation.

The run exposed poor progress feedback: the user initially reported that nothing
happened while persisted work was advancing. This delivery milestone does not
prove progress UI, broad capability/cost optimization or unattended operation.
No product source changed in this acceptance check; the latest full gate remains
cycle110 (657 Vitest/74 Python).

## Local alpha release — 0.1.0-alpha.1

Completed the three local alpha release items after cycle111: immediate Pi footer
progress with elapsed time and saved goal phases, a portable private archive, and
explicit release scope/install instructions. No publication occurred.

Red evidence: the original npm archive omitted `dist/worker-entry.js` and included
this checkout's `.pi/settings.json`; the package assertion failed. Four new
progress tests failed before `src/pi-progress.ts` existed. Relentless's first bounded
Luna author attempt returned `invalid_edits` and remains in private evidence. A
second, smaller request produced the progress helper; host review corrected stale
cleanup, elapsed-only updates, callback typing and wiring. Both attempts remain
recorded, rather than resetting a failed attempt's budget.

Green evidence: helper tests cover immediate/phase updates, nonoverlapping reads,
abort and late-reader fencing, headless/untrusted operation and UI/read errors.
The real Pi lifecycle regression now checks immediate footer publication and
cleanup on shutdown. Independent review found no actionable blockers in the
progress and packaging source. Initial full-gate lint findings were corrected.

The archive test extracts into a temporary directory outside the checkout,
restores its included release lock, installs frozen production dependencies from
an existing cache, loads all four extensions plus the setup skill through Pi,
checks inventory/footer behavior, reaches invalid-job validation in the compiled
worker over IPC, and imports all three Python helpers. It makes no model calls,
uses no credentials and copies no project settings. The initial install exposed
npm's lockfile omission; `release-lock.yaml` addresses it. A default-store offline
miss was resolved by explicitly selecting the populated dependency store. This
proves archive independence from the source tree, not an uncached registry install
or bundled VM/model assets. See `tests/package_release_test.py` and
[release instructions](release-alpha.md).

Final canonical gate passed: 661 Vitest tests, 74 Python tests, formatting, strict
lint/types, build and shell checks. The separate extracted-archive acceptance
also passed. Coverage reporting remains scoped to the existing configured subset;
these counts do not imply whole-product coverage.

## GitHub Pi distribution — 0.1.0-alpha.2

The user selected the public `alexlopashev/pi-relentless` repository and MIT
license. The package keeps the Relentless name and `/relentless` interface, adds
repository metadata and a Git-install prepare hook, and supplies public setup
instructions. npm publication is separate and was not requested.

A fresh-source regression first failed because there was no prepare hook. An
initial npm install with development dependencies passed, but independent review
caught a mismatch with Pi0.85.1: its default Git installer uses `npm install
--omit=dev`. Reproducing that command failed with missing Node type definitions.
Moving the existing pinned `@types/node` dependency into production dependencies
fixed it; the lockfile was updated without introducing another package version.
The corrected regression starts with no dist directory or node_modules, installs
production dependencies, then checks the real Pi loader, configuration skill,
offline demo and invalid-job worker IPC. No model calls or credential copies are
part of that test. This regression and archive validation now run in GitHub CI.

The prepare hook builds a source clone with its installed TypeScript compiler;
packed installations validate prebuilt entrypoints instead. npm's Git install
resolves transitive versions, while archive users can restore the included pnpm
lock. Pi SDK remains a runtime dependency because subprocess workers need their
own module resolution. Installing the package does not provision VM/model assets.

Publication uses an explicit source/docs/tests/examples/extension allowlist and
MIT license, excluding `.pi/settings.json`, authentication, `.harness`, dependency
stores and build artifacts. A secret-pattern scan found no credential matches in
the selected files. The original checkout's read-only Git metadata is untouched;
GitHub publication uses the repository API.

Pre-publication validation passed: canonical gate (661 Vitest and 74 Python
tests plus formatting, lint, types, build and shell checks), fresh production-only
source installation, packed-distribution smoke, and independent re-review after
the missing-types fix. These are local results; GitHub Actions results are
reported separately after publication.

## Relentless naming — 0.1.0-alpha.3

Renamed the package, Pi command, configuration namespace, setup skill, tool names,
local-provider identity, service identifiers and VM proof-channel paths to
Relentless. Examples, documentation and tests use the same names. Source changes
were prepared in an isolated worktree on `codex/relentless-rename`.

Two new regressions failed before the change: the package did not expose the
Relentless extension/skill and the configuration loader ignored the new namespace.
Both now pass. The canonical gate passed 663 Vitest and 74 Python tests, plus
formatting, lint, types, build and shell checks. A fresh production-only source
installation also passed extension/skill loading, demo and worker validation.
Independent review found no actionable naming or upgrade blockers.

This is a breaking alpha change. Existing runtime journals, proposals and proof
bundles are not rewritten. Upgrade instructions require retaining the previous
revision for old work and rebuilding affected VM/service assets. The original
main-branch GitHub Actions run had macOS VM test failures before this rename;
those are separate from the local green gate and remain outside this naming change.

## Pi host runtime diagnostic

A user installation exposed a coverage gap: package installation succeeded, but
standalone Pi0.87.0 (Bun1.3.14) could not import `node:sqlite`. Earlier install
checks exercised Node/npm Pi only. The same installed extension loaded and
registered successfully under Node24.21.0. Node24.21.0 and SQLite availability
were also checked from the affected project's directory without reading auth.

The extension now checks its host runtime before importing the durable engine.
Three regressions cover standalone Bun rejection, a missing SQLite module with
redacted loader errors, and the supported Node path. The actual standalone Pi
binary now emits the documented Node launch command instead of the raw import
error. This is a diagnostic and documented workaround, not a Bun SQLite adapter.
No credentials, private settings or journals were copied or migrated. The Node
launch command uses the already-installed package's Pi CLI and existing project.

Final canonical gate passed 666 Vitest and 74 Python tests plus static/build/shell
checks. The first full run had one source-promotion test failure; its focused
13-test file and the complete rerun both passed without a runtime-code change.
The initial failure is retained in local evidence rather than treated as a clean
first pass. Independent review found no actionable blockers.

## Standalone Pi support — 0.1.0-alpha.4

Supersedes the earlier Bun rejection/workaround. Native Node and Bun SQLite
adapters share the journal format. Node is discovered automatically for worker
forks and TypeScript checks; ordinary standalone `pi` loads the extension.

Red evidence: the new SQLite regression first failed before the adapter existed.
Real Bun execution additionally exposed the precreated VACUUM destination,
unfinalized statements at close, and a remaining static TypeScript-erasure import;
all were corrected before acceptance. Independent review identified missing
fsync of the restored destination; the final implementation flushes it before
success and rejects symlinks, nonempty files and FIFOs without blocking.

Validation on Node24.21.0, Bun1.3.14 and standalone Pi0.87.0: canonical gate passed
664 Vitest tests and76 Python process tests, including SQLite rollback, WAL read
snapshots, mixed-runtime locking, Node/Bun persisted checkpoints, safe restore,
syntax validation, worker IPC and actual standalone extension registration.
Five additional managed-local process tests passed with a Bun parent; the fresh
Git-source installation test built workers and loaded extensions/skills. No model
inference or credentials were used. Independent final source review found no
remaining actionable blockers. Default CI remains lightweight Ubuntu-only;
standalone runtime tests require explicit local executable paths.

Evidence: `.harness/bun-support/` (local, excluded from distribution).

## Configure provider omissions and Grok4.7 worker catalog

A real setup session discovered400 available models, including Astra, Grok4.7 and
11 Alibaba Personal models, but its proposal omitted Astra/Alibaba and chose
Grok4.3. Unpaginated provider coverage now makes those omissions visible in both
inventory and proposal results. The skill requires explicit requested-pool
accounting, current IDs and frontier escalation policy; native CLI routing gaps
are reported separately rather than mistaken for absent authentication.

The standalone Pi catalog also proved newer than the bundled worker SDK:
`xai/grok-4.7` was visible interactively but absent in the worker. A conservative
additive worker supplement preserves existing entries, transport and OAuth
registration. It does not prove quota, entitlement or successful inference.

New inventory and real-SDK catalog regressions failed before implementation.
Final canonical gate passed666 Vitest tests and74 Python process tests; the two
opt-in standalone tests skipped in this run. Independent final review found no
remaining actionable findings. A proposal checked against a fresh read-only Pi
registry snapshot resolved all11 enabled models in the worker catalog and previewed
Astra, Alibaba Qwen Max and Grok4.7 routes. Cross-provider author pools retained two
independent reviewer providers. Claude Code remained disabled: native Pi routing
and strict subscription-only extra-usage enforcement are still unfinished.
No model inference, billing permission changes or routing settings application.
Evidence: `.harness/configure-coverage/` (private local diagnostics).
