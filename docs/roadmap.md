# Bootstrap plan and sequenced roadmap

Starting state: empty local Git repository on unborn `main`, no remote, no source or existing roadmap. Purpose is supplied directly by the user. Local-first operation is authoritative; GitHub provisioning from the generic bootstrap skill is deferred until a target repository is chosen. No license or public visibility is inferred. A whitepaper is out of scope before there are measured results.

## Current acceptance checkpoint

The `0.1.0-alpha.2` GitHub package is MIT licensed and adds an automatic Git-install build. The preceding local `0.1.0-alpha.1` release added a distributable archive and command footer progress. Its release boundary and remaining limitations are in [alpha release notes](release-alpha.md).

A bounded Pi SDK terminal run now completes verified source delivery after a
session restart during a persisted synthetic outage cooldown. A fresh new-file
goal also completed after a real failed VM, model repair, fresh independent
reviews and verified installation without manual code repair. A user-operated
ordinary Pi CLI run in a separate project now also completed subscription authoring,
independent Qwen/Meta review, isolated verification and installation (cycle111).
The installed revision and unchanged read-only inputs were independently checked.
This does not close M1: active remote cancellation and wider project delivery
remain unproven. Model
qualification remains limited: two matching four-case cohorts now qualify Luna
and Terra low under the declared sample/success policy, with Luna selected by
workflow active time. Higher-confidence, cost-based and broader model/workload
qualification remain incomplete; earlier failed cohorts stay separate. See [current acceptance](project-acceptance.md) and
[validation](validation.md); cycle sections below are historical checkpoints.

## Foundation — in this change

Implement a strict TypeScript project, Pi SDK boundary, deterministic router, bounded prompt-only swarm, offline demo, local request/result artifacts, and portable lifecycle scripts. Verify negative routing cases, billing refusal, concurrency, cleanup and adapter failures. Document implementation limits separately from the target design. This phase can be exercised without credentials.

## M1: One reliable local coding loop

| Task                                 | Depends on | Acceptance evidence                                                                                                                                                                                                               |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Verify subscription adapters      | Foundation | Live user-account smoke for Codex and Grok; implement native Claude Code subscription worker and verify its active authentication; record active auth mode without secrets; verify native Codex protocol and capability discovery |
| B. Durable run ledger                | Foundation | Transactional goal/task states, durable retries and leases, versioned constraints/memory provenance, provider-independent checkpoints; crash/sleep recovery without duplicate logical completion                                  |
| C. Isolated coding worker            | A, B       | Real disposable Git fixture; isolated worktree; permission enforcement beyond Git; cancellation terminates owned process tree; patch survives failure                                                                             |
| D. Build/test/repair loop            | C          | Execute project-declared checks, capture evidence, fix injected defect; bound attempts and retain goal with a durable wait on no progress or attempt/time limits                                                                  |
| E. Independent review and acceptance | D          | Two independent reviewers, structured evidence-backed findings, fix invalidates review, exact-revision gate; explicit handling of disagreement                                                                                    |

Exit: dogfood a small change in this harness through the harness itself and deliver a patch, without depending on GitHub or external chat. Do not infer completion from agent prose.

## Recovery requirement for M1

The coding worker must distinguish retryable failures from approvals, verification and policy blocks. Before M1 exit, demonstrate broken-session recovery onto an explicitly permitted model/provider while preserving the patch, permissions, acceptance criteria and cumulative budget. Add tests for fencing the old writer and avoiding duplicate external actions. See [recovery design](recovery.md). Computer-use workers additionally need verified tools and an exclusive desktop lease; they are not implied by model access.

## Persistent-goal requirement for M1

The tool-free core now implements the deterministic supervisor and memory/constraint revision contract in [persistent goals and memory](goal-supervisor.md). A failed worker does not terminate the goal. Prove cloud-outage waiting, quota-reset wakeups, interrupted dispatch recovery, current user constraints on handoff, and policy-block isolation. The scheduler must work with all models disabled. Optional local-model assistance follows once deterministic behavior is proven; it is not on the critical path for retry scheduling.

## M2: Efficient orchestration

After M1 evidence exists, detail work on dependency-aware scheduling, per-provider concurrency and cooldowns, observed quota, model/effort escalation, routing evals, structured synthesis, and a local TUI. Require a measured comparison against a single-model baseline on the same tasks. Optimize total successful-task cost, latency and human intervention; a cheaper individual call can still make a task more expensive.

## M3: Optional offload and delivery

After M2, add reproducible remote build/test execution, resource thresholds, Spot interruption recovery, spend/lifetime limits, cleanup and artifact verification. Deploy and health/performance loops remain per-project opt-ins with explicit credentials and acceptance policies.

This DAG is acyclic: Foundation → A/B → C → D → E → M2 → M3. No speculative GitHub tickets, milestones, wiki or scheduled autonomous loop have been created. Local code is reviewable before choosing remote identity or visibility.

Local fallback progress: local billing and the Pi/llama.cpp inference adapter are implemented. Durable goal retries, explicit JSON checks and opt-in managed server lifecycle are implemented; broader autonomous fallback selection and resource evaluation remain open; see [local inference](local-inference.md).

Durability progress: SQLite state/events, goal revisions, constrained provider fallback, backoff/cooldowns, child-process lifetime control, acceptance checks and backup/restore are implemented for tool-free Pi work. A real local-provider outage/restart/recovery run passed. Coding/desktop effect reconciliation, native Claude/Codex resume, OS service installation and broader evidence verification remain open.

Provider smoke progress: Claude Code Opus 5, Pi OpenAI Codex GPT-5.6 Luna and local Qwen3.5 4B returned checked results. Grok authentication succeeded but inference returned HTTP 403. Native Codex startup failed in this sandbox. Claude included-only billing remains unverified and now blocks future calls without explicit metered authorization. See [evidence](four-provider-smoke.md). M1-A remains incomplete.

Self-improvement checkpoint: the first assisted find/reproduce/fix/review/gate cycle passed on Clanker's own classifier. This is evidence for the review workflow, not completion of M1's isolated coding worker or autonomous repair loop. See [cycle evidence](self-improvement.md).

Coding-worker checkpoint: `clanker code` implements bounded replacement edits in private file snapshots, syntax-check feedback and review artifacts. M1-C remains partial: OS-sandboxed execution, worktrees, behavioral tests and integration are still pending. The separate durable coding path now recovers frozen snapshots with cumulative budgets and fenced writes. See [implemented scope](coding-workers.md).

Self-improvement cycle 002 implemented an opt-in measured router and bounded host evaluation as M2 groundwork. It does not complete M1 or demonstrate general coding efficiency. Inventory and basic coding checkpoint recovery are now implemented. Shared provider health, execution isolation and statistically meaningful held-out evaluations remain open; see [active program](self-improvement-program.md).

Inventory checkpoint: configured candidates can now be inspected without inference, including saved authentication, partial effort-map defaults and recorded cooldowns. Active entitlement/capacity probes and native/local health discovery remain open.

Self-improvement cycle 003 added durable coding checkpoints and CLI recovery. Offline and live SIGKILL checks preserve consumed attempts and frozen source. Cycle 004 adds recoverable waits/fallback within each coding run. Cancellation is implemented in cycle 005. Shared health, revisions and task scheduling remain open.

Self-improvement cycle 004 verified live Grok quota → Codex coding recovery without metered access. Normalized failures and issued-attempt provenance persist; blocking denials revoke even superseding leases. Pi cancellation now drains boundedly before replay decisions. This is still a bounded foreground coding loop, not an autonomous goal scheduler.

Self-improvement cycle 005 added terminal durable coding cancellation. The CLI revokes active leases, preserves all budgets/evidence and prevents late publication. A separate-process cancellation test verifies heartbeat-triggered abort. Contract revisions and automatic scheduling remain pending.

Execution feasibility checkpoint: the dedicated Colima/VZ probe failed with virtualization unavailable in the current execution environment. The stopped temporary instance was removed; no behavioral execution is enabled. See [evidence and backend acceptance conditions](execution-isolation.md). Other durability and routing work remains actionable.

Cycle 008 adds explicit versioned coding prompt updates with preserved budgets/waits/blockers, stale-update rejection and artifact revision metadata. Live steering and permission-policy updates remain pending.

Cycle 009 shares recorded provider cooldowns across coding runs in one project journal, including process restart and zero-attempt waiting. Cross-ledger/project health and inventory unification remain pending.

Cycle 010 unifies local goal/coding cooldowns in read-only inventory reporting. Dispatch state remains separate; cross-ledger scheduler integration is still required.

Cycle 011 adds optional persisted required-export declaration checks to coding tasks. Both runners reject interface erasure and request bounded repair; behavioral correctness remains unverified.

Cycle 012 adds bounded two-provider independent review and exact-checkpoint artifacts. Remaining: durable review budgets/resume, automatic repair scheduling, behavior checks and final promotion.

Cycle 014 adds explicit project-context snapshots and versioned replacement shared by coding/review workers. Automatic memory ingestion and goal-ledger context handoff remain pending.

Persisted coding/review orchestration is now available through `workflow create/resume/status`: bounded repairs, reserved review-pair budgets, quota waits and crash reconciliation. It stops at `verification_required`; unattended wakeups, isolated behavioral tests and automatic integration remain pending. See [coding workflow](coding-workers.md).

Evaluations now checkpoint completed observations and reserve dispatches in SQLite. `evaluation status/resume <directory>` preserves contracts, call limits and deadlines; ambiguous in-flight calls are not automatically replayed. Scheduled retries and operator reconciliation remain unfinished.

`workflow run <coding-id>` now supplies a cancellable foreground retry loop for coding/review workflows, preserving saved budgets and stopping at blockers or verification. Enabled Alibaba Personal routes are excluded from this unattended path. No workflow service is installed; interrupted-review reconciliation and behavioral execution remain pending.

Cycle 022 established a bootable local QEMU TCG isolation prototype with fixed unprivileged resource-fault diagnostics. It avoids the earlier VZ limitation, but project behavioral execution remains disabled until the pinned runtime and verification protocol are implemented and validated. See [execution evidence](execution-isolation.md).

Cycle 023 ran pinned Node 24.21.0 and three fixed tests of the reviewed Clanker scheduler inside QEMU, with a separate privileged result channel and source/test hash checks. This supervised prototype is now accessible through the experimental prepared-image command described below; automatic project verification remains unfinished. See [execution evidence](execution-isolation.md).

Cycle 024 adds `verify-vm run/status`: a reusable supervisor for reviewed, prepared images with pinned private snapshots, bounded execution, protected result validation and durable terminal/ambiguous records. It reports execution evidence with acceptance explicitly unassessed. Source-to-image packaging, acceptance-oracle integration, host-memory enforcement and interrupted-run reconciliation remain pending. See [execution evidence](execution-isolation.md).

Cycle 025 adds `verify-vm package`: deterministic multi-file source/test overlays, an explicit test entrypoint, protected bundle digests and before/after file checks. Reviewed base images are still required. Cycle 026 adds `workflow package` to select the exact reviewed journal checkpoint and bind its source/specification hashes; Cycle 027 adds `workflow verify` with an explicit test-process exit rule and checkpoint-bound assessment. Cycle 028 consumes assessments into durable `verified`/repair states, preserves budgets, and reconciles completed assessments without replay. Cycle 029 adds explicit recoverable source promotion from verified checkpoints; see [promotion contract](source-promotion.md). Automatic orchestration and broader goal-ledger/routing integration remain pending. See [packaging contract](execution-isolation.md#reusable-source-and-test-packaging--cycle-025).

Cycle 030 adds a local Pi package with explicit status/resume commands over the
same engine, and a Clanker-authored optional verification continuation callback.
Full CLI verification orchestration and Pi lifecycle controls remain pending.
See [Pi package architecture and setup](pi-package.md).

Cycle 031 adds Pi-scoped role route previews, shared local-provider registration
and pre-dispatch checks on actual Pi workflow resume. Automatic goal creation,
policy migration and full Pi session lifecycle integration remain pending; see
[role routing contract](pi-package.md#role-routing-and-dispatch-scope--cycle-031).

Cycle 032 connects normal Pi session shutdown/reload to command admission,
workflow cancellation and stale UI suppression. Crash recovery remains incomplete:
expired coding leases can still authorize another bounded attempt without proof
of prior remote termination. See [lifecycle limits](pi-package.md#pi-session-lifecycle--cycle-032).

Cycle 033 prevents automatic inference takeover on coding-lease expiry. Expired
runs become ambiguous without new spend; workflows block and retain provenance.
Explicit evidence-based reconciliation remains pending. See [coding ambiguity](coding-workers.md#ambiguous-expired-dispatches--cycle-033).

Cycle 034 adds snapshot-hashed targeted text edits to both coding runners. A live
large-file golden case used a 290-byte reply and preserved the complete expected
source. Broader measured role calibration and ambiguous-outcome reconciliation
remain pending. See [targeted edit boundaries](coding-workers.md#targeted-edits--cycle-034).

Cycle 035 adds explicit Pi-native coding/workflow creation from project roles,
current catalog/scope and task constraints, without inference. Frozen policy and
per-author independent-review preflight are implemented. Atomic/idempotent creation
recovery, full goal orchestration and automatic capability calibration remain
pending. See [creation contract](pi-package.md#creating-work-inside-pi--cycle-035).

Cycle 036 makes new Pi task creation idempotent by task ID. Source and review
intent commit together; repeated creation attaches the workflow under a checkpoint
fence or preserves its progressed state. SIGKILL and concurrent-creation tests
cover commit-boundary recovery. Legacy migration, storage-initialization recovery
and automatic goal/calibration orchestration remain unfinished. See
[creation recovery](pi-package.md#idempotent-creation-recovery--cycle-036).

Cycle 037 connects explicit completed local evaluation journals to Pi route
previews and creation policy. It preserves host-assessed failures, deduplicates
trial IDs and rejects incomplete/ambiguous sources without importing permissions.
Automatic coding-suite calibration and the complete goal loop remain pending.
See [evidence loading](pi-package.md#local-evaluation-evidence--cycle-037).

Cycle 039 adds fenced durable coding-attempt latency and metered estimate
telemetry, retaining unknown cost and legacy checkpoint hashes. These measurements
do not grant acceptance or capability credit. Verified coding-outcome attribution,
failed-trial accounting and automatic calibration remain pending. See
[measurement boundaries](coding-workers.md#durable-attempt-measurements--cycle-039).

Cycle 041 adds `/clanker calibration-plan <suite-json>` as a read-only Pi command.
It derives coding/review eligibility from project roles and Pi model scope, binds
prospective source/test/runtime pins and budgets, and enumerates every declared
model/case/repetition slot. It neither verifies artifact bytes nor persists or
dispatches trials. Durable reservations, execution admission and complete verified
coding-outcome accounting remain next. See [calibration preview](pi-package.md#prospective-coding-calibration-preview--cycle-041).

Cycle 042 adds atomic cohort persistence, immutable trial identity reservations
and Pi creation/offline status commands. SIGKILL and competing-process tests cover
commit recovery. The calibration execution adapter, pinned-input verification and
verified outcome admission remain next; reservation is not dispatch or acceptance.
See [durable calibration cohorts](pi-package.md#durable-calibration-cohorts--cycle-042).

Cycle 043 connects saved trial reservations to coding workflows through Pi.
Preparation verifies declared input pins, preserves exact author/budget assignment,
and reuses atomic creation/attachment recovery. It does not execute the cohort or
admit observations; verified receipt attribution and complete trial outcome
accounting remain next. See [trial preparation](pi-package.md#preparing-coding-trials--cycle-043).

Cycle 044 adds explicit Pi calibration-step execution through coding, independent
review and the frozen VM contract, including bounded repair. Existing verification
directories are reconciliation-only; session cancellation reaches the supervisor.
Automatic cohort scheduling and complete outcome/cost admission remain next.
See [trial advancement](pi-package.md#advancing-a-trial--cycle-044).

Cycle 045 adds read-only accounting for every planned calibration slot and
provenance-checked author-only telemetry. Pending/ambiguous/failed work remains
visible; verified states are explicitly unadmitted and no routing observations
are emitted. Complete workflow metrics and verified admission remain next.
See [cohort accounting](pi-package.md#cohort-accounting--cycle-045).

The Pi package now includes the discoverable `clanker-configure` skill for model
discovery, task-specific role proposals and exact configuration diffs reviewed by
the user. It uses the existing project settings namespace and separates permission,
availability and measurements. This is an agent-guided workflow; automatic
background discovery and a runtime-enforced configuration approval transaction
remain future work. See [the skill](../skills/clanker-configure/SKILL.md).

Cycle 046 adds explicit verified coding-cohort admission and opt-in
`clanker.evidence.calibrations` references. Complete-cohort failed slots and unknown
metrics are retained; successful slots require independent reviews and bound VM
proofs. Fenced checkpoint checks prevent stale admission commits, and loading
revalidates evidence without importing permissions. The prospective protocol measures
author attempts only. Live representative cohorts, full-workflow accounting and
automatic scheduling remain next. See [admission](pi-package.md#verified-coding-evidence-admission--cycle-046).

Cycle 048 adds bounded validation reason codes to future review failures, while
keeping `invalid_output` as the blocking category. Diagnostics distinguish JSON,
schema, size, file and line failures without raw provider content, survive restart
and authorize no additional calls. Existing reports and frozen cohorts remain
unchanged. See [review diagnostics](coding-workers.md#structured-review-validation-diagnostics--cycle-048).

Cycle 049 exposes review and combined model-attempt accounting in read-only
calibration reports. Failed attempts remain in totals; missing reports/legacy
telemetry and unknown cost remain unknown. Known metered subtotals are labeled
separately. Full-workflow totals remain null pending complete overhead capture;
no new routing/admission metric is introduced. See
[accounting scope](pi-package.md#review-and-model-attempt-accounting--cycle-049).

Cycle 050 records optional verification timing in assessment/ workflow receipts,
separating packaging, supervisor and setup/assessment time without double-counting
the inner VM interval. Reconciliation preserves timing; broken clocks remain
unknown and do not alter acceptance. Reporting shows the latest receipt only.
Whole-workflow accounting across queue waits, repairs and incomplete operations
remains unfinished. See [timing receipts](pi-package.md#verification-timing-receipts--cycle-050).

Cycle 051 implemented durable verification reservations, retained failed receipts
across repair, package-bound completion and calibration history accounting.
Remaining efficiency work includes interrupted-attempt timing, queue/persistence
overhead, representative repeated cohorts and routing on complete workflow
measurements. Unknown legacy or pending time must not be ranked as zero.

Cycle 052 removes zero-imputed reviewer clock regressions and makes measurement
exceptions nonfatal to review cleanup. Full workflow metrics remain unfinished.

Cycle 053 implements explicit Pi/CLI continuous verification and repair for one
bounded coding workflow. Remaining goal work includes goal/task graph linkage,
versioned goal-memory handoff, durable scheduling across multiple coding jobs and
representative whole-workflow efficiency evidence.

Cycle 054 recovers the supervisor-receipt-to-assessment crash window without VM
replay. Earlier interruption before receipt persistence, goal graph linkage and
complete workflow efficiency measurements remain open.

Cycle 055 exercised the continuous runner with live Luna/Muse/Grok routes. It
stopped after an unknown Grok failure, with one author and two reviewer attempts,
no VM and no source promotion. Expired-token preflight is fixed; a successful
three-provider continuous live run remains unproven.

Cycle 056 implements per-workflow reviewer retry waits for recognized transient
inference failures. Global reviewer cooldown integration and immediate permitted
alternative selection remain open, alongside full goal graph orchestration.

Cycle 057 implements shared project reviewer cooldowns, preflight waits without
pair spending and immediate permitted alternative pairs. Mid-pair availability
recovery and unified health across goal/author dispatch remain open.

Cycle 058 implements mid-pair replacement when a permitted independent alternative
is currently available. Persisting partial pairs for later resumption when no
alternative is available remains open, as does unified goal/author/reviewer health.

Cycle 059 implements partial-pair cooldown waits across restart, with bound
completed assessments and unchanged pair budgets. In-flight interruption still
blocks as ambiguous. Full goal graph linkage, unified dispatch health and measured
end-to-end efficiency remain outstanding.

Cycle 060 implements explicit Pi goal-to-workflow creation with scoped context,
policy intersection, stable creation identity and core goal/verification guards.
Text supervision cannot satisfy workflow acceptance. Cycle 061 adds explicit
verified artifact admission into the goal ledger. Next required work is automatic
dependency scheduling, revision migration with preserved attempts, and unified
workflow measurements.

Cycle 062 implements explicit unfinished-work accounting via `goal-sync`, including
wait/blocker observations and final admission reconciliation. Periodic collection,
dependency scheduling, revision migration and complete workflow cost/latency
measurements remain required.

Cycle 063 automatically collects progress after Pi foreground execution. Remaining
work includes dependency scheduling, recovery of interrupted workflows before
observation, revision migration and complete workflow efficiency measurements.

Cycle 064 implements one foreground goal scheduling action: select an eligible
declared task, create/recover its workflow, advance coding/review or verification,
and admit verified artifacts on a subsequent step. Shared leases fence late
publication. Cooling work can yield to independent tasks. Next: continuous
wakeups, authorized source integration, revision migration, runtime configuration
proposal approval and representative full-workflow efficiency evidence.

Cycle 065 adds runtime confirmation and stale-source rejection for configuration
application. Agentic discovery and role recommendations use the packaged skill;
background discovery, current entitlement probing and representative efficiency
calibration remain open. Continuous goal scheduling/integration also remain open.

Cycle 066 supplies foreground continuous goal execution and retry wakeups. Next
orchestration work is authorized source integration, revision migration and
restart/service attachment within Pi’s trust lifecycle. Broader model discovery,
representative calibration and full-workflow efficiency evidence remain open.

Cycle 067 supplies the scheduler-lease fence required for automatic source
integration. Remaining integration work must bind explicit contract permission,
full independent-review/verification inspection before mutation, and source
installation receipts to goal admission and dependent task execution.

Cycle 068 supersedes the earlier automatic-integration limitation: workflow
tasks explicitly opting into `acceptance.work.integration: "verified"` now install
reviewed, verified existing-file changes before goal admission. Native fences pin
goal, coding and workflow evidence; installed-source receipts support recovery
after installation and before admission without another model call. Source equality
is observed at admission, not guaranteed against later editor changes. Creates,
deletes, atomic project installation, revision migration, automatic service restart
and representative full-workflow efficiency evidence remain unfinished. See
[verified installation](pi-package.md#verified-source-installation--cycle-068).

Cycle 069 adds explicit Pi session-start restart intent via project `resumeGoal`
with an exact goal ID/revision and execution-aware configuration confirmation.
Session cancellation and exact settings checks fence resumed work; the native
installer also checks settings authorization. `/clanker pause` is available while
busy. This is Pi lifecycle attachment, not an OS service or forced takeover of
draining work. Revision migration, representative calibration and measured
full-workflow efficiency remain open. See
[session restart](pi-package.md#opted-in-pi-session-restart--cycle-069).

Cycle 070 adds prospective `workflow-active-v1` calibration and `activeTime`
routing. Admitted evidence sums complete measured author, review and verification
stage durations including failures; missing stages remain unknown. This is not
wall latency or total cost, and legacy author-only observations remain unchanged.
Representative live cohorts, wall-clock accounting and total cost measurements
remain open. See [measurement semantics](model-efficiency.md#summed-measured-active-time--cycle-070).

Cycle 071 exercises the full evidence path with real repeated coding, independent
review and VM checks. Neither author route qualified under unchanged acceptance
thresholds. Next: diagnose invalid reviewer output and unknown worker failures,
then prospectively calibrate revised effort/reviewer/repair policies. Preserve
this cohort; do not drop failures or weaken thresholds to manufacture a ranking.

Cycle072 records output-shape diagnostics on new malformed reviews without storing
raw responses or changing acceptance. Next: distinguish safe normalized causes at
the author worker boundary, then use prospective trials to diagnose failure rates;
do not revise the frozen cycle071 cohort.

Cycle073 implements prospective failure-boundary diagnostics and fixes IPC denial
precedence. Next: use fresh bounded trials to diagnose repeat failures, then improve
measured recovery and calibration coverage; keep old negative cohorts immutable.

Cycle074 reproduced three fenced-prefix Qwen review failures in four workflows.
Next: predeclare a stricter no-fences review prompt and test on fresh trials; compare
review formatting and whole-workflow acceptance without resetting old attempts.
No generic model superiority or successful repair is established by these results.

Cycle075 completed the explicit no-fences prompt experiment: all eight reviews
parsed, three workflows verified and one substantive defect correctly blocked.
Next: measure bounded repair/escalation on representative coding tasks with the
clearer format prompt. Do not promote routes from two observations per model.

Cycle076 verified three first-attempt repairs and preserved one untagged unknown.
Next: complete outer durable-runner failure diagnostics (including output validation,
local checks and cancellation settlement) without changing failure permissions.
Feedback-driven repair and model escalation still need representative live evidence.

Cycle077 adds outer coding-attempt stage diagnostics. Next: diagnose new blocked
author outputs and introduce bounded recovery only for verified retryable failure
classes, then measure actual feedback-driven repair/escalation on representative
coding tasks. Existing unknown failures stay blocked and retain their budgets.

Cycle078 passed both fresh Luna trials without reproducing076's unknown failure.
Stop repeating this small sample as a substitute for broader evaluation. The local
endpoint readiness probe failed while runtime/model files exist: next address
explicitly configured managed local-server ownership, readiness and cleanup so
local fallback can become usable on demand. Preserve existing externally owned
servers, resource constraints, and project configuration approval boundaries.

### Managed local fallback — cycle079

Optional `routing.managedLocal` now pins and snapshots the local executable, model
and bundled libraries, starts a CPU server per authorized local call, checks
readiness and cleans up the owned process and files. Pi's configuration skill and
exact proposal confirmation cover this permission; it is absent from active
project settings. One real Pi/Qwen call passed in 14.3 seconds with confirmed
cleanup. This is lifecycle evidence, not model qualification or total-cost evidence.
See [configuration, bounds and limitations](local-inference.md#optional-managed-lifecycle--cycle079).

Cycle080 removes CLI-only goal registration with `/clanker goal-create`, freezing
project routing without inference. Next: prepare and complete a representative
project through Pi, exercising check failure, repair, outage and restart. Do not
substitute additional tiny calibration cohorts for that product acceptance run.

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

Clanker's own Luna worker added allowlisted parser reasons. The durable journal
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

A Clanker Luna worker authored a read-only status reader; Pi exposes it through
`/clanker goal-status`. It distinguishes goal-recorded counters from live coding
attempts and labels historical revisions. This makes exhausted unadmitted work
visible without external SQL inspection. No inference or synchronization occurs.
See [status scope](pi-package.md#inspecting-goal-progress--cycle087); reviewer
cooldowns, atomic observations and inspection during a busy command remain open.

## Cycle088: Pi-native model inventory

Clanker's Luna worker authored a pure session-inventory projection. The native
`/clanker inventory` command now feeds discovery from Pi's effective registry,
scope, project roles and saved health instead of requiring a separate CLI runtime.
The configuration skill prefers this path. Eligibility remains policy-only;
capacity, entitlement and representative task capability require separate evidence.

## New-file delivery: explicit absence integrated

The filesystem writer now supports an explicit absent original with no-clobber
publication and stage-identity crash recovery. Coding requests, durable snapshots,
review context and calibration pins now preserve explicit absent originals, and
Pi file manifests accept `create: true`. The live acceptance scope and evidence
are recorded in project acceptance; this does not establish general project
creation or autonomous efficiency. Never represent absence by creating an empty
project file. Deletes, new parent directories and atomic multi-file installation
remain separate unsupported operations.
