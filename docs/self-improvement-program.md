# Active Relentless self-improvement program

User objective: iterate Relentless toward a local agentic coding harness that knows available models and chooses appropriate models/reasoning levels using verified strengths, cost and time. The objective remains active; this document does not mark the overall product complete.

Each cycle selects a bounded issue, establishes failing acceptance tests, asks Relentless's model workers for a proposal, reviews the exact resulting code independently, repairs findings, runs the deterministic gate and retains evidence. Only verified results update capability conclusions. User constraints remain authoritative; model suggestions cannot grant spending, publishing, tools or policy bypass. No deployment, AWS resource or background subscription loop is enabled.

## Completed increments: measured routing and inventory

- Muse through Relentless reviewed the design.
- GPT-5.6 Luna through `relentless code` implemented the evidence ranker in a private copy against failing tests.
- Independent review found mismatched case distributions and billing identity. Another Relentless coding run repaired those issues against expanded regressions.
- The outer assistant checked source hashes before copying proposals into the local working tree, made small TypeScript/lint corrections, and implemented routing integration, host evaluation, telemetry and regression tests.
- Muse reviewed the ranker/router/evaluator proposal. Further independent review found deadline, child revalidation and zero-price issues; those were reproduced and fixed. Review agreement was not treated as deterministic correctness.
- A real identical three-case Muse/Codex probe supplied host-checked evidence; routing selected a model using the measured latency. See [scope and evidence](model-efficiency.md).

This is supervised self-improvement using Relentless's actual workers. The outer assistant still runs full tests and integrates changes. It is not an unattended, self-authorizing daemon.

## Sequenced remaining work

1. Implemented: read-only [inventory](model-inventory.md) of catalog presence, saved authentication, supported efforts and provider cooldowns, distinct from actual entitlement/capacity. A Relentless coding worker authored the inventory core; live inspection caught a Pi partial-effort-map issue, now covered by a regression.
2. Broader task-specific evaluations: held-out implementation/review cases, repeated trials, confidence and drift handling; avoid fitting the router to tiny probes.
3. Basic durable coding checkpoints and fenced writers are implemented in cycle 003, preserving committed patches, frozen contracts and cumulative attempt budgets across interruptions. Cycle 004 adds structured failures, per-run cooldowns and constrained fallback. Cycle 005 adds cancellation. Cycle 008 adds explicit versioned prompt updates. Cycle 009 shares cooldowns across coding runs. Next: broader constraint revisions and integration with goal scheduling.
4. Enforced execution isolation for project tests, followed by exact-revision independent review and hash-checked promotion. Nested OS sandbox creation is unavailable here; the dedicated Colima/VZ probe also failed because virtualization is unavailable in this execution environment. See [verified isolation status](execution-isolation.md).
5. A resumable self-improvement scheduler with bounded model calls, recorded cost estimates and explicit spending ceilings; cumulative budget accounting and recoverable waits must survive restart.
6. Compare successful-task cost, elapsed time and human intervention against a single-model baseline before claiming efficiency gains.

Continue bounded cycles in this active task. No recurring app automation or OS service has been installed. Current local files have no Git history/remote, so no commits, PRs, merges or publication are implied.

## Cycle 003: coding recovery

Relentless Luna produced the journal and two runner proposals against failing tests. The proposals needed host corrections: TypeScript errors, attempt lifecycle, actual-file syntax checking and timer cleanup. Independent review identified constructor cleanup and export consistency issues; regressions reproduced them before fixes. The outer assistant integrated the corrected journal/runner/CLI. A live Codex recovery run succeeded after SIGKILL, retaining the consumed first attempt. See [coding commands and limitations](coding-workers.md). Model-produced code passing syntax was explicitly insufficient for acceptance.

## Cycle 004: provider recovery

Relentless Luna authored the pure recovery route/backoff helper against failing tests. The outer assistant integrated transactional dispatch/failure records, constrained fallback, durable waits, model pins and cancellation settlement. Independent review found missing Pi cancellation forwarding and discarded late denials; regressions reproduced both, including the actual Pi session adapter boundary. A live two-attempt run received Grok quota exhaustion and completed its review candidate using Codex with subscription-only configuration. The full gate passes 192 tests. This completes the per-run recovery increment, not the broader product goal.

## Cycle 005: cancellation

Relentless's durable coding worker generated a cancellation proposal against failing tests. The outer assistant retained its cancellation logic as a minimal patch and added CLI wiring and cross-process verification. Cancellation revokes the lease and retry schedule while preserving committed state and failure history. Independent review found no blockers; the full gate passed 197 tests and four subprocess checks. Container prerequisites were inspected read-only: Colima is installed but stopped, and its Docker socket is absent. Execution isolation still needs an actual verified backend.

## Cycle 006: execution backend feasibility

A dedicated Colima/VZ instance was attempted with no host mounts or credential forwarding and bounded local resources. VZ reported virtualization unavailable; the stopped state was verified and the temporary runtime removed. This is concrete evidence that behavioral tests cannot yet be enabled through that backend here. No project code was executed. The full goal remains active: contract revision, shared health and capability-evidence improvements can proceed independently while an enforceable execution backend remains outstanding.

## Cycle 007: per-case capability evidence

Relentless's durable Luna worker authored the Wilson-bound helper against failing tests. The outer assistant integrated per-case acceptance, sample-count and optional lower-bound requirements into evidence routing, and added a four-case synthetic review calibration suite. A route cannot qualify by hiding a failed case inside a high aggregate score. Independent review found no blockers; the full gate passed 201 Vitest tests and existing lifecycle/subprocess checks.

The bounds are an optional sample-size guard with explicit independence assumptions, not a general capability guarantee. Held-out tasks, drift detection and demonstrated end-to-end efficiency remain open. Evidence and calibration results are retained under `.harness/self-improve-007/`.

## Cycle 008: durable instruction revisions

Added explicit optimistic prompt revision through the journal and CLI, retaining previous instructions without resetting attempts or changing routing authority. Running/cancelled updates are rejected; waiting and blocked states persist. Review candidates are invalidated by updated instructions. Export metadata distinguishes artifact revision from latest state.

Relentless's Luna worker returned a comment-only replacement for the journal; syntax checks accepted it as a candidate, but semantic tests rejected it. The original was restored and the outer assistant implemented the focused change. This failed proposal is retained as evidence that syntax acceptance is insufficient for automatic integration. Independent review required explicit artifact/dispatch revision metadata, now covered by regressions. This increment remains supervised.

## Cycle 009: cross-run provider availability

A Relentless Luna worker authored the cooldown merge helper against failing tests. Host integration reads validated historical coding run records inside dispatch transactions, retaining maximum provider expiry across processes. New runs can enter retry waiting with zero consumed attempts. Existing route restrictions remain authoritative. The host corrected TypeScript/lint issues in the generated helper.

This shares health within the coding journal, not yet across projects or with the tool-free goal ledger. Large-history indexing, scheduled wakeups and inventory unification remain future work.

## Cycle 010: availability reporting across local journals

Relentless's Luna worker authored the read-only coding-health adapter. The host added a read-only journal constructor, pinned inspection snapshots, and inventory aggregation of goal/coding cooldown maxima. Missing journals remain absent; corrupted evidence fails closed. Tests check database bytes/permissions, mutation rejection, concurrent writer observations and source attribution.

This improves availability reporting, not cross-ledger scheduling. The ledger samples are independent, authentication remains separate from capacity, and inventory makes no inference calls.

## Cycle 011: reject interface-erasing proposals

Relentless's Luna worker authored an AST-based required-export checker. Host integration adds explicit per-file export contracts to both coding runners, persists them and feeds failures back within existing budgets. Independent review caught unsupported CommonJS manifests; a failing regression preceded the validation fix.

The compiled checker rejects the actual comment-only journal replacement from cycle 008 when `CodingJournal` is required. This closes that acceptance gap without executing model code. It does not prove implementation correctness; isolated behavioral verification remains necessary before automatic integration.

## Cycle 012: exact-checkpoint independent review

Relentless's Luna worker authored the structured finding validator. Host integration added the two-provider review runner and CLI artifacts. Review binds to the saved checkpoint hash and excludes recorded author providers; reviews cannot approve integration or mutate coding state. Independent review reproduced deadline and pinned-snapshot freshness bugs, both fixed against failing regressions.

This adds automated review dispatch and evidence collection. Review runs are not yet durable/resumable, do not schedule repairs and cannot replace behavioral verification.

## Cycle 013: live review validation

A bounded real `coding review` of the original cycle-012 parser proposal used Qwen3.8 Flash (Personal subscription) and Muse Contributor (explicit metered route), one call each, without retry or background polling. Both returned schema-valid no-findings assessments bound to the saved checkpoint.

The trusted compiler rejected that proposal with TS2532 under `noUncheckedIndexedAccess`; the corrected working-tree file passed. Because compiler settings were absent from the review packet, this result identifies a context gap and the limits of model agreement, not a controlled general capability comparison. No reviewed artifact was integrated. Retained evidence: `.harness/self-improve-013/`.

Next iterations must include explicit project acceptance policy in review context and retain deterministic checks. Review cost/latency telemetry is also still missing; the current report cannot support an efficiency comparison.

## Cycle 014: shared project context and bounded repair

Relentless's Luna worker authored the bounded context schema/renderer. Host integration snapshots explicit requirements and background facts, sends the same context to coding and review, and supports versioned context replacement without changing routing authority or attempt budgets. Independent review passed.

A live continuation of the original parser run added the missing compiler policy at revision 2 and consumed its second/final coding attempt. Relentless repaired the unchecked access and deprecated Zod issue code. The exact saved proposal then passed a fixed compiler check with the declared strict flags. This is a supervised repair using preserved budget, not automatic integration or general behavioral verification.

The subsequent live review failed before its first valid assessment; no second reviewer or retry followed. The candidate remains unreviewed. That observation led to stage/route diagnostics and explicit deadline/invalid-response codes for future failures, verified offline. No cause is inferred retroactively for the original unknown failure.

## Cycle 015: persisted coding → review → repair

Relentless run `3051ee5a-4776-4404-9842-51ddd7e52b89` authored the bounded repair-prompt helper. Host integration adds the workflow journal and CLI, exact-candidate handoff, reserved review-pair budgets, quota wait persistence and repair-intent recovery. Independent review identified schema-reset and artifact-history bounds defects; failing regressions preceded both fixes, and final review found no remaining blockers.

Offline fixtures exercise the whole coding/review/repair sequence, and a killed-process test proves ambiguous reviews retain reservations without replay. This is not a demonstrated live autonomous project completion. Safe behavioral execution, automatic wakeups, general model-strength evidence and final integration remain unfinished.

## Cycle 016: live persisted independent-review handoff

The workflow resumed existing Relentless coding run `3051ee5a-4776-4404-9842-51ddd7e52b89` (Codex Luna, one coding attempt) with a single explicitly budgeted review pair. Qwen3.8 Flash on the Personal subscription and Muse Spark 1.3 Contributor on the authorized metered route each returned no findings. The workflow persisted `verification_required` at checkpoint `2da1c1806c11e5010c263116db87aec3545e1dd950a8ec5e23e025242c377b05`. Reopening and resuming retained exactly the same state and report.

A hash-checked copy of the exact reviewed source passed a fixed TypeScript 6.0.2 check with strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and unused-code checks. The source also matches the previously host-reviewed working-tree helper. No new candidate was integrated in this cycle. Artifacts are retained under `.harness/self-improve-016/`.

This proves live review and durable handoff for existing real coding output; it does not exercise live repair, isolated behavioral execution, scheduled recovery or completion of the overall goal. Per-review actual cost and latency are still unmeasured. No executable changes were made; cycle 015 remains the full-gate baseline.

## Cycle 017: measured review latency

Host integration now retains per-attempt monotonic latency and normalized outcome in review reports, including failed calls. The change was driven by the live cycle-016 telemetry gap. Failing regressions preceded implementation; independent review found no blockers. This cycle adds no live inference or new model-authored source.

This removes a reporting blind spot but does not establish model quality or cost. Process IPC still drops Pi's metered cost estimate; transporting that estimate and pairing performance with deterministic acceptance remain outstanding. Failed or no-findings reviews are not treated as verified capability evidence.

## Cycle 018: process-worker cost transport

Host integration carries an optional validated Pi metered cost estimate through child IPC and both review entry points, retaining known estimates on failed assessments. Subscription/native/absent usage stays unknown. Tests cover IPC delivery after child close, billing distinctions, invalid assessment, and observer exceptions racing policy denials. Independent review passed after the final failure-priority regression and fix.

This is cost telemetry, not a spending cap or settled billing measurement. Coding and goal ledgers do not yet persist the estimates, and execution telemetry alone does not establish verified task capability. No model-generated source was added this cycle.

## Cycle 019: process evaluations feed verified routing evidence

The evaluation CLI now preflights all eligible Pi routes and dispatches each call through the owned process worker. Per-call metered estimates are attached to deterministic host acceptance, retaining unknown subscription cost and suppressing late telemetry updates. Ranking tests cover accepted cases, a wholly failing case rejected despite adequate aggregate acceptance, and qualified cost scoring. Independent review passed. The full gate passed 257 Vitest tests, static/build checks, ShellCheck, lifecycle validation and six subprocess checks.

A bounded live run used one repetition of the existing four-case review-calibration suite: Muse Contributor and Codex Luna each passed 4/4. Total host elapsed time was 24,301 ms for Muse and 15,279 ms for Luna (means 6.08 s and 3.82 s). Muse's estimated total cost was $0.0004423; subscription cost remained unknown. Baseline latency ranking selected Luna; the stricter minimum-sample/confidence policy selected neither. This is a small suite-specific check, not a general capability ranking or an automatic routing-policy update.

Evidence: `.harness/self-improve-019/` and `.harness/evaluations/71892e79-89a5-462a-9ff4-c709fecbe8f3/`. Evaluation checkpoint/resume, broader verified workloads and safe behavioral execution remain pending. No model-generated source was added this cycle.

## Cycle 020: durable evaluation evidence

The host added a checksummed SQLite evaluation checkpoint, immutable normalized contracts and plan validation, dispatch reservations, per-observation commits, and status/resume commands. Completed evidence survives interruption; resume skips completed calls and preserves the absolute deadline. Pending calls are conservatively ambiguous and cannot be automatically repeated. Terminal artifacts can be rebuilt without provider access.

Independent review reproduced two defects: checkpoint methods could rewrite prior evidence or exceed the plan, and reservation delay could dispatch past the deadline. Failing regressions preceded both fixes, and final review found no remaining blockers. A subprocess fixture kills the evaluator after its first committed observation and second reservation, then confirms reopening retains evidence without inference replay. No live inference or model-authored code was added in this cycle.

This does not implement automatic retries of provider failures, operator reconciliation of ambiguous calls, a background scheduler or isolated behavioral tests. Those remain part of the active goal.

## Cycle 021: foreground coding-workflow scheduler

Relentless Codex run `2f4e7f23-c35e-4088-bc3f-72cd3ad5b80b` authored the runner. A host regression caught early resumption after one 30-second sleep chunk; the same run repaired it at revision 2, consuming its second/final attempt. Host integration added `workflow run`, signal propagation and the unattended Personal-route exclusion. The host also applied a lint-compatible abort-state accessor without changing scheduling behavior.

Independent review caught shutdown consuming undispatched fallback attempts, then a second transition incorrectly blocking an otherwise resumable coding run. Regression tests preceded both fixes. Shutdown now reaches reservation boundaries and preserves resumable coding state. Interrupted review reconciliation, installed workflow services and isolated behavioral verification remain unfinished. This was a supervised Relentless author/test/repair cycle, not autonomous integration.

## Cycle 022: local VM feasibility breakthrough

A QEMU 11.0.3 TCG guest successfully booted under software emulation, avoiding the unavailable VZ hardware path. Fixed trusted diagnostics ran as UID 65534 with zero effective capabilities and no-new-privileges, with no NIC or host sharing. Fault probes verified parent wall/output termination and guest CPU/process/file/memory limits; every emulator process was reaped. Initial permission failure and successful results are retained under `.harness/self-improve-022/`.

Independent evidence review supports a feasibility prototype only. No product executable changes or model inference occurred, so cycle 021's 271-test/seven-subprocess gate remains the code baseline. A pinned language runtime, trusted task/result protocol, host resource limits and adversarial validation remain required before project behavioral execution is enabled. See `docs/execution-isolation.md` for exact evidence and limitations.

## Cycle 023: isolated Node and a real Relentless helper

A digest-pinned official Node 24.21.0 ARM64 image ran under local QEMU TCG as UID 65534. A separate root-controlled result channel rejected a stdout success spoof and reported the true failure exit code. The reviewed Relentless scheduler helper then passed three fixed host-authored tests inside the VM; protected candidate/test hashes matched the exact packaged files and current source. Independent evidence review found no blockers to these narrow claims.

The TypeScript probe initially failed under `--jitless` (WebAssembly unavailable); normal guest Node settings passed. Host RSS monitoring through `ps` was denied, so no hard host-memory bound is claimed. All emulator processes were reaped. Evidence, digest-pinned downloads, prototype scripts and retained per-run records are under `.harness/self-improve-023/`.

This is a supervised experiment using Relentless-authored/host-reviewed code, not a general verification command or autonomous promotion. Product executable code did not change; cycle 021's 271-test/seven-subprocess gate remains the baseline. Runtime packaging, acceptance semantics and production lifecycle integration remain active work.

## Cycle 024: reusable prepared-image verification command

Host integration adds `verify-vm run/status`, private verified input snapshots,
protected hash/exit-code validation, bounded capture and emulator lifetime,
SIGINT/SIGTERM cleanup, and durable pending/terminal records. It deliberately
reports `acceptance: not_assessed`; workflow promotion still needs a declared
acceptance oracle and source-to-image packaging.

Independent review reproduced an emulator replacement race and FIFO input hang.
Failing regressions preceded fixes; final review found no remaining blockers in
the experimental operator-reviewed scope. Twelve offline tests cover those
boundaries, CLI cancellation, non-replay and result spoofing. A live public-command
run of the existing Relentless-authored scheduler fixture completed in 5.27 seconds,
with protected source/test hashes matching and the emulator reaped. No new model
inference was used. Artifacts and red/green evidence are in
`.harness/self-improve-024/`.

A prepared trusted guest image remains required. Hard host-memory enforcement,
a watchdog/reconciliation after supervisor death, behavioral acceptance and
workflow integration remain unfinished. The full self-improvement goal is active.

## Cycle 025: source/test packaging into the verification VM

Host integration adds `verify-vm package` for pinned multi-file source and test
bundles, deterministic readonly workspace overlays, a selected test entrypoint
and root-controlled before/after file checks. No model inference occurred; the
live candidate is the existing Relentless-authored scheduler helper.

The public package/run path passed its three scheduler cases in 5.60 seconds.
A second fixture additionally verified UID 65534, loopback-only guest interfaces
and denied writes to source, tests, root metadata and the result channel; it
passed in 5.71 seconds. An intentional assertion failure then produced protected
exit 1 and `test_process_failed` in 5.44 seconds. All emulator processes were
reaped. The first boundary assertion incorrectly used Node's configured-address
view to require a down loopback interface; the corrected fixture inspects sysfs.
Both outcomes are retained under `.harness/self-improve-025/`.

Independent review found that adding an overlay could exceed the runner's image
size ceiling; a failing regression preceded the fix. The full gate passed 271
Vitest tests, strict/static/build checks, lifecycle verification, seven durability
checks, 12 VM-supervisor checks and seven packaging checks. Prepared base images
remain trusted operator inputs. Automatic checkpoint selection, an acceptance
oracle and workflow promotion remain unfinished.

## Cycle 026: exact reviewed checkpoint packaging

`workflow package` now selects source from the authoritative coding journal,
checks the workflow's reviewed checkpoint hash before and after packaging, and
records checkpoint/specification/package-request bindings. The operator supplies
only pinned runtime/tests and limits; working-tree edits cannot replace the
reviewed bytes. Failed packaging or a concurrent revision leaves no binding.

Five focused tests cover exact source selection, unreviewed/stale candidates,
revision during packaging, source substitution/test collisions and failed/reused
outputs. Independent review caught an unbounded CLI specification read; a failing
FIFO regression preceded bounded regular-file reading. Final executable review
found no remaining blockers. No new inference was used in this cycle.

The existing reviewed run `3051ee5a-4776-4404-9842-51ddd7e52b89` was packaged via the
public workflow command, then run inside the VM. Its repair-prompt helper passed
four fixed cases in 4.72 seconds. The protected bundle digests matched and the
emulator was reaped. The binding references reviewed checkpoint
`2da1c1806c11e5010c263116db87aec3545e1dd950a8ec5e23e025242c377b05`.
Evidence is under `.harness/self-improve-026/`. Acceptance remains unassessed;
workflow acceptance/repair integration and promotion remain pending.

## Cycle 027: single-command declared-rule verification

`workflow verify` now packages the exact reviewed checkpoint, runs it under the VM
supervisor and evaluates a mandatory predeclared test-process exit rule. Runtime,
limits, source/test digests and report manifest bindings are checked; a changed
checkpoint prevents assessment. Atomic fsynced assessments retain the rule and
checkpoint/specification/report hashes. This adds host orchestration, not new
model inference or automatic promotion.

The existing reviewed repair-prompt helper passed its four fixed cases through
the single public command and received `accepted: true` for the declared rule.
A second run with an intentionally failing assertion recorded `accepted: false`
and returned a nonzero CLI exit. Both emulators were reaped. Their complete
packages, reports and assessments are under `.harness/self-improve-027/`.

Review identified a Python/JavaScript DEL-encoding mismatch; a failing reference
regression preceded the fix. Runtime-substitution rejection also has red/green
evidence. Independent final review found no remaining blockers. Acceptance still
means only the declared process-exit criterion; specification adequacy remains a
review concern. Consuming these assessments for workflow repair/transitions,
promotion and measured routing evidence remains active work.

## Cycle 028: durable verification outcomes and repair

Verification assessments now drive the workflow journal: a satisfied declared
rule becomes `verified`, a genuine failed test schedules the existing repair
intent within remaining coding/review budgets, and infrastructure interruptions
remain pending verification. A coding-database transaction fences the workflow
commit against concurrent revisions. `reconcile-verification` recovers complete
saved assessments without another VM or inference call.

Independent review identified a large-log feedback failure and a cross-database
revision race; failing regressions preceded bounded-prefix feedback and the
coding checkpoint guard. Tests also cover stale duplicate accepted receipts,
budget-preserving repair, stopped verified runners and interrupted commit recovery.
The actual previously reviewed helper transitioned to verified via the public
command. Reopening and reconciling retained its exact receipt without dispatch.
A terminal-path Personal-route guard failure was reproduced and fixed so completed
runs can be inspected without authorizing unattended inference.

The full gate passed 292 Vitest tests, static/build checks, lifecycle validation,
seven durability checks, 13 supervisor/CLI checks and seven packaging checks.
Evidence is under `.harness/self-improve-028/`. No new inference occurred. Source
promotion and integration with the broader goal ledger and measured routing remain
unfinished; verified describes the declared rule for this candidate only.

## Cycle 029: recoverable source promotion

Explicit `workflow promote` now revalidates verified evidence and installs the
frozen candidate with a writer-owned checkpoint fence, retained originals and
recoverable staging. The live repository check rejected changed review context
without modifying either tracked file. See [the command contract and limitations](source-promotion.md).
Automatic goal-to-promotion orchestration remains unfinished.

## Cycle 030: Relentless-authored verification continuation and Pi adapter

Relentless's subscription-backed Codex worker produced the optional verification
callback for the foreground runner in one attempt. Failing tests preceded the
candidate, and independent review preceded integration. A failed test can now
return to repair and fresh review through the callback; unresolved verification
stops without automatic replay. This callback is not yet wired into the CLI's
full verification lifecycle.

User steering added local Pi package metadata and a thin status/resume command
adapter over the same durable engine. Review caught source-loader versus compiled
worker path resolution; an actual Pi-loader subprocess regression failed before
the fix and passed afterward without provider inference. See [Pi package scope](pi-package.md).
Evidence and the live coding run are under `.harness/self-improve-030/`.

## Cycle 031: Pi-scoped role routing

A Relentless Codex worker implemented the role eligibility intersection in one
attempt after failing tests; independent review preceded integration. Pi now
previews role routes against its effective available model list and session
scope, project billing constraints, exact thinking pins and shared cooldowns.
The existing workload-evidence ranker remains responsible for measured selection.
The same local model catalog is registered for interactive Pi and worker use.

A worker-boundary guard also constrains actual Pi workflow resume, preserving
saved workflow policies while blocking selections no longer permitted by project
roles or Pi scope. Tests mock provider dispatch and verify it is never reached on
scope failure. A real Pi-loader/registry test selects the local model in preview
and rejects an unsatisfied reasoning floor without inference. Evidence is under
`.harness/self-improve-031/`. Full new-goal policy binding, evaluation ingestion,
provider-runtime sharing and session lifecycle orchestration remain unfinished.

## Cycle 032: Pi lifecycle cancellation

Relentless's Codex worker authored the local session-work controller in one attempt;
failing tests preceded implementation and independent review preceded integration.
Pi lifecycle hooks now abort workflow signals, retain admission until settlement
and suppress old-session results. Tests cover cancellation before dispatch and
within an active mocked worker, including no replacement dispatch. A real Pi
loader/event test covers shutdown, stale publication, and restart admission.

Review and inspection distinguish this normal lifecycle behavior from crash
recovery: coding lease expiry still permits bounded takeover, unlike the
ambiguous evaluation ledger. That remains an explicit durability gap. No remote
termination guarantee or fully autonomous recovery is claimed. Evidence is under
`.harness/self-improve-032/`.

## Cycle 033: preserve expired dispatch ambiguity

Relentless's Codex worker exhausted its two attempts at replacing the 20 KB coding
journal module. Its final candidate was a 67-byte comment stating that complete
replacement was unavailable within response constraints. Required-export checks
rejected that candidate; it was not integrated or retried under a fresh budget.
This is a recorded failure on this full-file replacement task, not sufficient
balanced evidence to infer general model capability. Smaller edit representations
are a concrete follow-up for worker efficiency.

The host implemented the minimal journal transition after failing regressions.
Expired running attempts become ambiguous before exhaustion or routing, retaining
source, budget and issued provenance. Known completed retries remain possible;
late policy denials still block. Existing tests that expected expiry takeover were
updated to the new contract while preserving stale-writer fencing on known retries.
A SIGKILL subprocess fixture now requires zero replacement calls. Independent
review found no blockers. Recovery from ambiguity remains explicit unfinished work.
Evidence is under `.harness/self-improve-033/`.

## Cycle 034: efficient worker edits

Following cycle 033's rejected large-file replacement, Relentless's Codex worker
implemented a targeted-edit parser in one attempt. Independent review found no
semantic blockers; the host corrected strict TypeScript/index-access issues and
integrated it into both coding paths. Snapshot hashes, unique non-overlapping
original-text spans, writable-file limits and aggregate byte bounds validate
before any workspace write. Whole-file replies remain supported.

A separate one-attempt live probe used the new durable worker path on a fixed
23,468-byte source fixture. The response used the targeted form and was 290 bytes;
the candidate matched the complete expected file and source bytes were unchanged.
Elapsed host time including validation was about 4.13 seconds. No candidate code
was executed on the host. This is one golden edit case, not a balanced routing
benchmark. Evidence and run identifiers are in `.harness/self-improve-034/`.

Cycle 036 uses a Relentless Codex Luna worker to author checkpoint-fenced, idempotent
Pi workflow attachment (`b5506ab2-6720-40ee-9f50-57f762a6c511`, one attempt). Host
integration saves creation intent with source in one SQLite transaction, keys new
Pi work by task ID, restores saved review policy on repeat, and refuses legacy or
conflicting identities. Actual SIGKILL/concurrent-process tests establish the
covered creation boundaries without model inference. This is durable creation
progress, not completion of the goal/calibration loop. Independent final review
found no remaining blockers in the scoped change.

Cycle 037 uses a Relentless Codex Luna worker to implement observation merging
(`800e6acf-634b-473f-8b63-814585eb3d4d`, one attempt). Host integration connects
read-only completed evaluation checkpoints to Pi configuration, previews and
frozen creation policy. Offline measured fixtures demonstrate an evidence-selected
route overriding static preference without model calls. Independent review found
a directory-swap race, reproduced by a failing test and corrected with repeated
identity/containment checks. Real-provider coding capability calibration remains
unfinished; this cycle establishes the data path rather than a model leaderboard.

Cycle 038 ran the controller-recovery classification suite through Relentless's own
Luna and Muse workers (12 calls, all 12 declared checks accepted). A complete,
unambiguous checkpoint supplied live task-specific latency and metered estimate
observations. The cohort was registered in local Pi evidence settings, and an
inference-free scheduler preview selected Luna under existing role constraints.
This is a small synthetic controller test, not broad model calibration. Exact
scope, sample limits and measurements are recorded in `docs/model-efficiency.md`.

Cycle 039 uses a Relentless Luna worker to author the safe attempt-measurement
collector (`18b6f3ac-f3cd-4f14-b27f-06c89215f077`, one attempt). Host integration
adds lease-fenced journal storage and cost forwarding through durable coding. A
single authorized Muse probe produced the expected small candidate and persisted
4,257.27 ms observed elapsed time with a $0.0001557 estimate through actual worker
IPC. Source files remained unchanged. This is telemetry transport and a fixed edit
check, not verified coding-capability evidence; outcome attribution remains next.

Cycle 040 exercised the full existing pipeline on the measured Muse candidate:
Luna and Qwen independent review, subtraction baseline failure in the offline VM,
exact candidate success, durable `verified` receipt and replay-free reconciliation.
No new author inference or coding retry occurred. The evidence remains an
integration pilot, explicitly excluded from capability rankings because it is
retrospective and single-case. See `docs/coding-workers.md` for the exact scope.

Cycle 041 uses a Relentless Luna worker to author the prospective coding-calibration
planner (`c6f58ebc-a017-4fda-a968-4b324fc025a1`, one attempt). Host integration
adds Pi project-role/scope selection and explicit preview-only output. Independent
review found impossible declared source/test namespaces; a failing regression and
validation fix addressed this, with six focused tests passing on re-review.
Persisted trial reservation and verified coding-result admission remain unfinished.

Cycle 042 uses Relentless's Luna coding worker to author the cohort journal
(`637f5463-6708-421c-82be-57901acb8068`, one attempt). Host tests caught an overly
strict nested parse before integration; host integration added read-only status,
Pi commands, immutable contract checks and actual process interruption tests.
Cohort persistence and stable reservations now exist; these do not supply
capability observations or automatically execute trials.

Cycle 043 uses Relentless's Luna worker to author the bounded pinned-artifact reader
(`bcbb74f5-0ab1-439c-82a6-c4bc989c2695`, one attempt). Host integration connects
reserved calibration trials to singleton-author coding workflows using existing
atomic Pi creation intents. Preparation makes no inference calls. Mocked author
execution and real interrupted-preparation tests exercise the connection; these
are engineering tests, not model capability evidence.

Cycle 044 uses Relentless's Luna worker to add verification-supervisor session
cancellation (`51322bb6-28ab-401e-b0f1-14d9550bb390`, one attempt). Host integration
adds Pi trial advancement through coding/review and frozen-contract verification.
Tests cover successful verification/reconciliation, partial-output no-replay,
revoked permissions, cancellation and failure/repair/re-review. Independent review
identified the retained-receipt repair boundary, reproduced and fixed before the
final gate. These mocked execution tests do not establish model capability scores.

Cycle 045 uses Relentless's Luna worker to author the trial-state classifier
(`4996d19b-2bf5-43e7-9e0f-661700f196eb`, one attempt). Host type checks caught a
nullable receipt access and an invalid workflow enum comparison. Integration
adds read-only full-cohort reporting, shared frozen trial bindings and explicitly
author-only measurements. Verified workflow state remains unadmitted; no model
ranking is inferred from partial or unverified cohort results.

Cycle 046 uses Relentless's Luna worker to implement the pure calibration-observation
constructor (`34d39a8b-04d8-4df1-9990-a9983f72724c`, one attempt), corrected by host
validation for an invalid Zod array method and strict typing. Host integration
adds immutable admission, independent review/VM proof checks and explicitly
configured evidence loading. Independent review found a stale-snapshot admission
race; the regression reproduced it, and fixed-order journal fences now prevent
commit after concurrent cancellation. No live capability observations are invented
from the synthetic fixtures, and live project policy remains unchanged.

Cycle 047 completed a live six-trial coding pipeline cohort through Relentless's own
Luna/Muse workers, independent Qwen/other-provider reviews and VM verification.
Luna had two accepted outcomes and Muse none; invalid review output contributed
to failures. Neither qualified at 80% success. Complete evidence was admitted
without changing project routing. V1 was retired after mutation tests demonstrated
oracle gaps; V2 preserved a fresh immutable identity. See
[live results and limits](live-coding-calibration.md).

Cycle 048 uses Relentless's Luna worker to add safe review-validation codes
(`121cc728-a9b1-4196-89b9-e4482d72e785`, one attempt). Host integration preserves
these diagnostics in review attempts and workflow reports. Tests prove no raw
provider marker leaks, provider errors remain distinct, strict parsing remains
unchanged, and blocked workflows retain diagnostics without redispatch after
reopen. This prepares evidence-based review recovery; it does not automatically
adjudicate objections or loosen any frozen cohort contract.

Cycle 049 uses Relentless's Luna worker to implement pure review accounting
(`e5a4cd8b-0197-4261-9de4-0334b0ecfd6a`, one attempt). Host integration makes
reviewer time and cost visible alongside authors in calibration reports, retaining
failed and incomplete work. This follows the live pilot's measured reviewer
bottleneck. Full overhead capture and routing on complete pipeline measurements
remain unfinished; author-only admission is unchanged.

Cycle 050 uses Relentless's Luna worker for the pure verification-timing helper
(`b29f4112-5112-44f2-91ce-ad7bbb4487f8`, one attempt). Host integration attaches
measurements to immutable assessment artifacts and saved verification proofs.
Strict typing caught unchecked array access; host corrections preserve unknown
clock handling. Receipt reconciliation and calibration reporting retain the
measurements without replay, refresh or change to acceptance. This captures one
verification interval, not the full workflow's queue/repair/persistence history.

Cycle 051 uses Relentless's Luna worker
(`2fc75796-e408-4e99-a026-2b0d18dc195d`, one attempt) for the verification-history
accounting helper. Host integration adds journaled intents, package bindings,
repair history and report fields. Host corrections remove a deprecated schema
call, an unused type and a redundant boolean comparison. Independent review
found a missing package comparison; recording and reconciliation now enforce it.
The follow-up review passed 48 focused tests with no remaining blockers.

Cycle 052 uses Relentless's Luna worker
(`8b5d64fa-5da3-4961-a91a-5acbc003b056`, one attempt) to isolate review clock
failures and propagate nullable latency through review accounting. Tests first
exposed clock exceptions changing behavior and rejection of unknown latency.
Strict types then exposed a missed nullable report field, corrected by the host.
This improves measurement reliability without claiming full workflow accounting.

Cycle 053 uses Relentless's Luna worker
(`b55dce92-705b-4c7d-b9fb-7340655f0664`, one attempt) for the verification-step
adapter. Host integration adds immutable contract binding, Pi/CLI commands and
continuous-loop tests. Host corrections fix an import, remove unused/redundant
worker code, and enforce the project root. Independent review identified bounded
input reading and live trust checks; both received regression fixes.

Cycle 054 uses Relentless's Luna worker
(`1de32cab-63dc-4b74-8511-131f136e283e`, one attempt) for supervisor-receipt
validation. Host integration adds atomic/fsynced receipt persistence and read-only
assessment reconstruction, retaining source/test/runtime binding checks. A
preimplementation fault test showed the missing-assessment crash window.

Cycle 055's isolated continuous trial (`147da323-f9ab-4b46-b966-8dcf7f12ce92`)
ran Luna once, Muse review once, then failed on Grok review before verification.
The router selected Muse first because quality precedes preference. This trial is
retained as blocked and is not admitted as capability evidence. Main project
settings and source were unchanged.

A separate Relentless Luna worker (`be41d2c2-8c82-472d-a190-879c12038ba4`, one attempt)
authored the OAuth-freshness helper. Host integration preflights read-only workers
and reports inventory freshness without credentials. Validation against actual
stored expiry with a guarded runtime factory confirmed `auth`, zero runtime calls
and zero inference calls. This does not retroactively reclassify the live error.

Cycle 056 uses Relentless's Luna worker
(`ad98988b-47a3-461e-86a2-1fa86cb11375`, one attempt) for retry eligibility and
backoff selection. Host integration preserves normalized Retry-After and saves
workflow retry deadlines. Host corrections reject malformed retry reports and
remove a redundant phase check. Journal restart tests demonstrate no early calls,
no author rerun, retained failures and exhaustion of the original pair budget.

Cycle 057 uses Relentless's Luna worker
(`586fc3da-4140-4833-a383-d08982189839`, one attempt) for pure independent-pair
routing. Host integration adds shared workflow cooldowns, pair preflight and
read-only inventory projection. Independent review exposed a legacy-deadline
regression; an old-format SQLite fixture now proves those waits remain effective.

Cycle 058 uses Relentless's Luna worker
(`f6a0971c-1e86-47ae-a3d9-bd4c085844dc`, one attempt) to refresh reviewer routes
inside the reserved pair. Host tests first reproduced the mid-pair cooldown stop,
then confirmed replacement, billing boundaries and persisted one-pair accounting.
The worker change was integrated after checking the original source was unchanged.

Cycle 059 uses Relentless's Luna worker
(`8721583f-839c-490a-bbca-2cdd952cbfc9`, one attempt) for continuation validation.
Host review added a failing test for different valid assessment/attempt providers,
fixed the missing equality check and removed an unchecked cast. Host integration
persists the partial pair, resumes only missing reviewers and keeps partial
accounting incomplete. New tests cover restart, deadlines, final-budget completion,
findings retention, stale revisions, ambiguity, policy denials and quota exhaustion.

Cycle 060 uses Relentless's Luna worker
(`79003c1f-305a-407b-88ce-ca78f7cba312`, one attempt) for goal-to-coding context
projection. Host integration adds explicit workflow acceptance, Pi creation and
runtime origin checks. Independent review found authentication-intersection,
non-atomic verification binding, generic duplicate-creation and receipt-reuse gaps;
regressions preceded their fixes. Further review found a parent-owned promotion
fence insufficient after process death, so the actual Python mutator now owns
both goal and coding locks and checks context deadlines before publication.

Cycle 061 uses Relentless's Luna worker
(`bc4fbfc2-1492-42a5-bf47-6cdb27c4bf91`, one attempt) for the pure completion
transition. Host integration adds full verification/review inspection, explicit Pi
admission, current goal binding and commit fences. Independent review caught
terminal resume invalidating admitted evidence; a regression preceded its fix.
Controlled fixtures cover artifact admission and explicit promotion; a two-boundary
process-kill smoke recovers before/after goal COMMIT with one receipt/event and
unchanged attempt accounting. These fixtures do not claim new live VM/provider
benchmark evidence. Automatic graph dispatch and complete efficiency measurement
remain unfinished.

Cycle 062 uses Relentless's Luna worker
(`10679978-3eef-4d87-b7cf-24266a99e469`, one attempt) for progress projection.
Host integration adds fenced explicit synchronization, monotonic usage/identity
checks, unchanged-event suppression and final admission accounting. Controlled
quota/in-flight/concurrency fixtures make no live provider calls. A process-kill
smoke verifies rollback and idempotent recovery around goal COMMIT while both
input journals remain fenced. Independent review found no blockers and identified
a repair-revision window that requires workflow reconciliation before sync.

Cycle 063 uses Relentless's Luna worker
(`0fa62914-2a0b-4060-bd51-07abff812138`, one attempt) for best-effort collection.
Host integration attaches it to Pi execution settlement and separately reports
pending synchronization without replacing the primary outcome. Controlled tests
cover quota waits, thrown actions, shutdown, write failure and unbound workflows;
no live inference is used in tests.

Cycle 064 uses Relentless's Luna worker
(`dea46883-8530-46b2-b474-a3f15ce12e64`, one attempt) for the pure goal work
planner. Host integration adds declarations, Pi scheduling, dependency source
checks and publication fences. Independent review found late creation/admission,
verification and coding validation windows; regressions and commit fences address
them. A controlled process-kill smoke exercises restart after creation without
new provider or VM evidence. Continuous scheduling and measured end-to-end
efficiency remain unfinished.

Cycle 065 attempted the pure proposal builder through Relentless Luna
(`69eccfc7-1bc9-44ff-a082-84e120c32616`). Its single allowed attempt failed with
`unknown`, with no source change and unknown cost. The host implemented the
proposal and Pi confirmation path without resetting the worker budget. Tests
cover review rejection, stale settings and lock ownership; this is a failed
worker attempt followed by host implementation, not autonomous worker success.

Cycle 066 uses Relentless Luna (`892c7ea9-9c49-4cb9-9cf1-d14153ad90b9`, one
attempt) for the pure wait planner. The host added foreground execution, Pi command
wiring, no-progress detection and authority checks while waiting. Controlled tests
exercise quota recovery, completion, cancellation, revision and Personal-plan
exclusion; they do not establish provider capability or measured efficiency.

Cycle 067 uses Relentless Luna (`69ee5e16-61dc-42d3-987d-85187f9bebbc`, one
attempt) for promotion-lease validation. The host added ephemeral authority to the
native mutator and wrapper. Tests cover replacement/expiry before writes, expiry
after capture, same-transaction recovery by a successor and mutator ownership
after parent death. No real project source installation or new VM inference was
performed by these tests.

Cycle 068 attempted the installation receipt helper through Relentless Luna
(`7f2ecb9c-34b1-417d-a3fb-982e5679906f`). Its single allowed attempt failed
with `unknown`; the host implemented the helper and integration without resetting
that consumed attempt. Automatic installation is explicit per-task permission;
all installation tests use disposable projects and controlled model/VM responses.
Recovery tests cover interruption between installation and admission without new
model work, plus idempotent admission and retention of conflicting editor changes.

Cycle 069 uses Relentless Luna (`f02c1d73-f08a-4a32-9a22-a81e30f05275`, one
attempt) for the pure restart planner. The host removed redundant deprecated Zod
`safe()` and added Pi lifecycle attachment, exact settings/revision authority and
execution-aware approval wording. Independent review found native installation
could outlive settings revocation; a failing post-capture regression preceded
propagating the settings digest into the native guard. No live project restart
opt-in was enabled, and tests use controlled responses without live inference.

Cycle 070 uses Relentless Luna (`39406643-bc61-475e-9771-ce57d52b3470`, one
attempt) for the pure workflow active-time aggregator. Host integration adds a
prospective protocol, complete-stage report accounting, admission reconstruction
and a distinct routing metric. Independent review confirmed that wall latency and
cost must remain unknown for this protocol. Controlled tests cover full admission
and route selection; they do not establish new live model-efficiency evidence.

Cycle 071 runs a real repeated coding cohort through Relentless's own Luna/Terra
workers, Qwen/Muse independent reviews and isolated verification. Independent
oracle review added two missing cases before registration; reference VM runs
validated the expanded tests. Eight author attempts and twelve reviews yielded
four verified workflows (Luna1/4, Terra3/4). The complete cohort was admitted with
negative slots retained; neither route met the preset acceptance thresholds.
No source integration, model-policy change, credential refresh or retry occurred.
The result identifies reviewer-format failures, a confirmed coding defect and an
unknown author failure separately; it does not establish general model superiority.

Cycle072: Relentless’s bounded Luna coding worker produced the review-output diagnostic
helper in one checked attempt; host integration attaches it only to failed validation
attempts. Red/green tests cover secrecy, byte limits, malformed JSON rejection and
absence of fabricated output diagnostics on provider failures or successful reviews.
This improves prospective observability; it does not fix or relabel cycle071 failures.

Cycle073: one bounded Luna worker supplied the failure-origin enum and job-stage
tracking. Host testing caught an invalid awaited-function `.then` expression and
corrected invocation before integration. Host added IPC, Pi response, journal and
review metadata, and fixed independently identified denial loss after a transport
fault. No calibration reruns or routing policy changes were made.

Cycle074 diagnostic cohort completed four workflows (two cases, Luna/Terra, one
repeat). One Luna workflow passed both independent reviews and isolated VM checks;
three workflows stopped at Qwen invalid-JSON reviews with fenced-prefix diagnostics
of 51, 956 and 808 UTF-8 bytes. All four author attempts returned candidates without
normalized author failures. Five review calls (four Qwen, one Muse) and one candidate
VM ran; no source installation or automatic retry occurred. All four observations
were admitted, and unchanged ranking thresholds qualify neither route. This is
workflow evidence, not proof of relative author coding quality. Only $0.0003285 of
metered review estimates is known; total cost remains unknown. No old cohort was
modified or pooled into the new admission.

Cycle075 tested an explicit raw-JSON/no-Markdown instruction in a fresh four-trial
cohort. All eight reviews (four Qwen, four Muse) parsed successfully. Three workflows
passed both reviews and isolated VM checks; both reviewers caught a real superseded
conflict-detection defect in the fourth, a Luna facts candidate. The single author
attempt budget stopped that workflow without a repair attempt. Four author calls,
eight review calls and three candidate VMs ran. Every outcome was admitted; neither
route qualifies under unchanged evidence thresholds. Known metered review estimates
total $0.0015986; total costs are unknown. Source files and old cohorts are unchanged.

Cycle076 ran four fresh conditional repair trials from two starting implementations:
the actual075 facts defect and the existing incomplete eligible stub. Both baselines
failed the pinned final tests inside the VM. Terra repaired facts, and both authors
completed eligible; all three passed independent reviews and VM verification. Luna's
facts trial stopped before review on unknown failure without an origin. All four
observations remain admitted. Actual usage was four author attempts, six reviews,
three candidate VMs and two baseline VMs. Every success took one author attempt:
review-feedback retry and escalation were not exercised. Partial metered review
estimates total $0.0009807; total cost remains unknown. No routing winner qualified,
source was not installed, and previous cohorts remain unchanged.

Cycle077: one bounded Luna worker proposed outer-runner stage diagnostics and enum
labels. Host review supplied missing post-output workspace/check/authority markers
and failing tests for those boundaries. Failure kinds, billing and routing policy
remain unchanged. Earlier trial outcomes remain immutable.

Cycle078 ran two fresh Luna repair trials with077 outer-runner diagnostics. Both
passed independent review and VM verification on the first author attempt: two
author calls, four reviews and two candidate VMs. No tagged or untagged failure
occurred, so076's unknown cause remains unresolved. No feedback retry or escalation
was exercised. Both observations were admitted; the unchanged minimum sample
thresholds qualify no route. Partial metered review estimates total $0.0008555;
total costs remain unknown. Starting sources and previous cohorts remain unchanged.

### Managed local fallback — cycle079

Optional `routing.managedLocal` now pins and snapshots the local executable, model
and bundled libraries, starts a CPU server per authorized local call, checks
readiness and cleans up the owned process and files. Pi's configuration skill and
exact proposal confirmation cover this permission; it is absent from active
project settings. One real Pi/Qwen call passed in 14.3 seconds with confirmed
cleanup. This is lifecycle evidence, not model qualification or total-cost evidence.
See [configuration, bounds and limitations](local-inference.md#optional-managed-lifecycle--cycle079).

## Cycle080: Pi-native goal creation

Following the usability review, a Relentless Luna worker authored goal creation from
project policy. Host integration added the Pi command and corrected the refined
Zod schema projection. The command saves constraints, budgets and tasks without
dispatch, returning a durable ID for the existing Pi workflow loop. This removes
a CLI detour; the representative project acceptance run remains outstanding.

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

## Cycle083: actionable output-stage diagnostics

Relentless's own Luna worker added allowlisted parser reasons. The durable journal
now preserves `outputReason` only for the winning unknown/coding_output failure,
without raw response data or relaxed acceptance/retry rules. Next: a fresh bounded
repair exercise using these diagnostics; never reinterpret or reset cycle082.
See [acceptance details](project-acceptance.md#cycle083-bounded-output-diagnostics).

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

A Relentless Luna worker authored a read-only status reader; Pi exposes it through
`/relentless goal-status`. It distinguishes goal-recorded counters from live coding
attempts and labels historical revisions. This makes exhausted unadmitted work
visible without external SQL inspection. No inference or synchronization occurs.
See [status scope](pi-package.md#inspecting-goal-progress--cycle087); reviewer
cooldowns, atomic observations and inspection during a busy command remain open.

## Cycle088: Pi-native model inventory

Relentless's Luna worker authored a pure session-inventory projection. The native
`/relentless inventory` command now feeds discovery from Pi's effective registry,
scope, project roles and saved health instead of requiring a separate CLI runtime.
The configuration skill prefers this path. Eligibility remains policy-only;
capacity, entitlement and representative task capability require separate evidence.
