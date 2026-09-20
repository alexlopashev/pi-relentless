# Local project profile

- Project: clanker.
- Purpose: personal multi-provider software factory using Pi with local orchestration.
- Repository identity / visibility: `alexlopashev/pi-relentless`, public, MIT.
- Current phase: local Pi alpha with durable goals, bounded coding/review/VM delivery, and portable packaging; no installed background service.
- Release: `0.1.0-alpha.2` with GitHub installation; see `docs/release-alpha.md`. Later cycle sections below retain historical implementation checkpoints.
- Canonical CI: `mise run ci`.
- Domain checks: model/effort floors; explicit billing policy; bounded concurrency; Pi session cleanup; failure/truncation handling; no tool/resource discovery in brainstorm mode.
- Evidence: `docs/validation.md`; architecture and roadmap are local canonical documents.
- Target OS: macOS and Linux. Real macOS checks performed; GitHub Actions defines Linux/macOS checks. Check remote run results separately.
- GitHub adapter, if enabled: gh; native `blockedBy` relationships authoritative with body mirrors.
- Future remote labels: `status:*`, `priority:*`, `kind:*`, `risk:*`, `area:*`, `concurrency:parallel`, `mutex:*`, `semaphore:*:<capacity>`.
- Future lock namespaces: `codex-locks/project-bootstrap`, `codex-locks/issues/<id>`, `codex-locks/mutex/<resource>`, `codex-locks/semaphore/<resource>/<slot>`; compare-and-create acquisition and fenced compare-and-delete release only.
- Completion: foundation is not completion of the product. M1 requires a real isolated coding/verification/review/repair demonstration and interruption recovery.
- Whitepaper, GitHub wiki, milestone/issues and steady-state automation: not provisioned.

This file stays under docs because the session permits no writes beneath `.codex`. A future full GitHub bootstrap should reconcile it with the project-profile skill contract before automation handoff.

- Persistent-goal requirement: deterministic local supervisor, durable waits/retries, explicit completion/cancellation, versioned project/task constraints and source-provenanced memory; optional local LLM is advisory. See `docs/goal-supervisor.md`. The tool-free durable core is implemented; see `docs/durable-operations.md` for boundaries.

- Local inference: Qwen3.5 4B Q4_K_M via llama.cpp and the public Pi custom-provider API; one worker, local billing, 8K context. See `docs/local-inference.md` for exact pins and operational limits.

- Experimental native CLI workers are implemented for durable tasks. Live smoke: Claude Code, Pi Codex and local Qwen passed; Grok inference returned HTTP 403. Claude included-only billing remains unverified and future calls require explicit metered authorization. Native Codex startup and session resume remain unverified. See `docs/four-provider-smoke.md`.
- Grok routing repaired: OAuth proxy plus version negotiation now reach the service; latest live response is HTTP 402 usage-balance exhaustion. Login is verified, successful inference still awaits capacity. New responses are classified as quota without enabling metered fallback.

- Alibaba Personal: dedicated subscription endpoint admitted for `qwen-token-plan-individual` API-key authentication. User-initiated Qwen3.6 Flash smoke passed; no unattended subscription service enabled.
- Latest Personal coding routes: Qwen3.8 Flash/Max, DeepSeek V4.1 Flash and GLM 5.3. Project-local Pi catalog supplement preserves older pins and subscription endpoint/auth; no global installation changed.
- First assisted self-improvement cycle completed through real Clanker Qwen/Codex workers; external patch application, red/green tests and final review. Fully autonomous repository modification remains unimplemented.

- Bounded coding workers: separate user-initiated `code` CLI, explicit file allowlist, disposable copy, host edits, fixed syntax checks and hashed review artifacts. The additional `coding create/resume/status/cancel` path provides frozen-source restart recovery and fenced cumulative attempts; per-run cooldowns and constrained provider fallback now work, including a live Grok quota → Codex repair. No project code execution or automatic integration yet. See `docs/coding-workers.md`.

- User-selected Muse variant: Muse Spark 1.3 Contributor. The direct Meta route uses provider `meta`, model `muse-spark-1.3-contributor`, and a dev.meta.ai key through Pi login. Direct low-effort inference is live verified. The checked-in example remains disabled; the local single-provider smoke config enables metered Meta use without altering subscription fallback policy. See `docs/muse.md`.

- Active self-improvement program: `docs/self-improvement-program.md`. Initial evidence ranker was produced and repaired by real Clanker coding workers; outer assistant still integrates/checks. Opt-in measured routing and bounded evaluation are implemented; read-only candidate inventory is implemented; autonomous scheduler, live capacity checks and broad capability evaluation remain pending.

- Execution backend probe: dedicated Colima 0.10.3/VZ failed with virtualization unavailable; terminal state verified and temporary runtime removed. Behavioral execution remains unavailable; see `docs/execution-isolation.md`.

- Coding prompt revisions: explicit local CLI updates preserve budgets/routing authority and invalidate review candidates. Running/cancelled updates reject; automatic memory ingestion and live steering remain pending.

- Coding runs now share provider cooldowns within the project coding journal. Routing uses validated persisted records under a transaction; inventory now combines goal and coding cooldowns read-only; dispatch state remains separate.

Cycle 011 adds optional persisted required-export declaration checks to coding tasks. Both runners reject interface erasure and request bounded repair; behavioral correctness remains unverified.

- `coding review` collects two-provider assessments bound to a coding checkpoint, without changing coding state. It is not yet resumable and never authorizes integration.

- Coding `context.requirements` and `context.facts` persist and reach all coding/review prompts. Explicit context revisions retain history and budgets; automatic memory discovery is not implemented.

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

Cycle 051: verification history now includes durable pending intents and retained
failed receipts across repairs. Calibration reports distinguish known subtotals
from incomplete totals. Legacy evidence remains unchanged and incomplete for
these new measurements; this does not establish full workflow efficiency.

Cycle 052: failed reviewer clocks now produce unknown timing without changing
review outcomes, timer cleanup or separately known cost.

Cycle 053: `/clanker run-verified` connects coding/review to deterministic
verification and bounded repair with frozen execution contracts and no replay.
Automatic source promotion and full goal graph orchestration remain absent.

Cycle 054: a persisted supervisor receipt permits read-only reconstruction of a
missing verification assessment. No receipt means no inferred supervisor success,
and recovery does not fabricate lost timing.

Cycle 055: read-only OAuth freshness is checked before inference and shown in
inventory. A live continuous trial retained an unknown Grok review failure.
Separate metadata evidence shows token refresh is required; quota remains unknown.

Cycle 056: reviewer quota/outage/unavailability can wait durably and retry within
saved pair budgets without redoing coding. Denials, auth and ambiguous outcomes
remain blocked; expired Grok credentials still require the supported login path.

Cycle 057: reviewer pair selection now considers cooldowns across the project,
waiting without budget consumption when no complete pair is eligible. Legacy waits
remain preserved. Author and goal dispatch health is not yet unified with reviews.

Cycle 058: reviewer preselection refresh can retain the first assessment and use
an eligible alternative for the second call without spending another pair. No
permitted alternative still means a routing stop; no inference refusal is retried.

Cycle 059: known pre-dispatch reviewer cooldowns can pause and resume the same
reserved pair across restart, retaining checkpoint-bound assessments and observed
cost/time. Ambiguous dispatches and blocking inference failures are not replayed.

Cycle 060: Pi can create bound work from a workflow goal task. Goal revisions and
expired context revoke old dispatch; creation cannot reset budgets. Goal and Pi
permissions intersect, the VM contract binds atomically, and the promotion writer
holds both ledger fences. Completing the workflow still does not complete its goal.

Cycle 061: `/clanker goal-admit` explicitly completes verified goal tasks and
unlocks dependency eligibility. It validates independent review and saved VM
evidence, preserves receipt identity and author accounting across restart, and
retains coding/workflow fences through goal commit. It does not promote source
files or automatically schedule dependent coding tasks.

Cycle 062: goal tasks can retain exact unfinished coding/workflow observations via
`goal-sync`. Counter rollback/identity conflicts fail; unchanged records produce
no new event. Admission updates final counters without double counting. Execution
still reads its own journals, and automatic orchestration remains unfinished.

Cycle 063: Pi execution collects goal progress after success or failure without
hiding the primary outcome. Pending collection is visible, status stays read-only,
and shutdown/trust loss prevents new observation writes.

Cycle 064: Pi `goal-step` handles one declared workflow action with deterministic
selection, shared supervisor ownership and publication fencing. Retry waits are
read from authoritative journals. Dependent coding waits for admitted source
hashes to match the project; source promotion and continuous scheduling remain
separate unfinished automation work.

Cycle 065: configuration application now uses a saved digest-bound proposal and
Pi confirmation rather than relying only on skill instructions. Settings changes,
trust loss, cancellation and competing settings locks reject publication. Model
availability and user constraints still require the skill and dispatch checks.

Cycle 066: `goal-run` continuously advances workflow actions and waits for saved
retries. Goal revisions and authority loss stop the invocation; unchanged workflow
results stop no-progress loops. Existing journals preserve budgets across explicit
restart. Source promotion and service/autostart integration remain unfinished.

Cycle 067: the source installer can enforce current scheduler ownership and
expiry while retaining native goal/coding locks after parent death. New owners
can recover the same filesystem transaction. Automatic source integration remains
unfinished; this is its publication fence, not an opt-in or completion receipt.

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

Cycle 071 adds a complete live repeated scheduler-contract cohort. Luna verified
1/4 and Terra3/4 with shared Qwen/Muse reviewers; neither passed the preset routing
thresholds. Review-format failures and an unknown author failure are distinct from
one confirmed coding defect. No model policy changed. See [empirical scope](model-efficiency.md#live-scheduler-contract-workflow-cohort--cycle-071).

Cycle072 adds capped, content-free output-shape diagnostics for failed review
validation. A bounded Luna worker authored the pure helper; host integration keeps
strict review acceptance and dispatch policy unchanged. Unknown author failure
diagnostics and representative calibration remain open.

Cycle073 retains bounded failure-origin metadata in new coding/review failures and
protects received denials from later IPC faults. Origins preserve diagnosis without
raw errors or altered retry policy. Historical unknowns remain unresolved; future
representative trials are needed to measure whether recovery efficiency improves.

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

Cycle077 completes prospective stage fallbacks within durable coding attempts,
including local checks and edit-payload validation. Provider-origin diagnostics
remain intact; untagged historical failures are not reinterpreted. Representative
feedback repair, escalation and efficient model routing remain open objectives.

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
