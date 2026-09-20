# Persistent goals, supervision and project memory — required design

Status: the tool-free subset is implemented: SQLite goals/events, revisions, explicit memory records, retries/cooldowns, constrained fallback, child-process supervision, verification predicates and backup/restore. See [operating guide](durable-operations.md) for exact supported behavior and limits. The broader coding-side-effect, native-session and fully verified project-memory requirements below remain the target design. Service templates are generated, but OS autostart is not installed.

## Persistence contract

Clanker must retain a goal until its acceptance criteria are verified or the user cancels or supersedes it. A worker crash, provider outage, exhausted quota, failed resume, or denied action must not silently discard the goal or report it complete. Persist progress and the reason work cannot currently advance. Keep independent authorized tasks running where possible.

Goal persistence does not mean an endless stream of model calls. Workers have bounded attempts and runtime; the supervisor retains the goal and waits for a meaningful trigger when those limits are reached. If no authorized solution exists within current constraints, keep the goal blocked and explain what must change. Neither a local model nor a new provider can guarantee that an impossible or restricted task will become feasible.

The machine must be running to execute work. On sleep, shutdown or process failure, preserve state and reconcile overdue work on restart. A service-manager integration should restart the supervisor; installation and autostart are explicit lifecycle features, not side effects of a CLI brainstorm command.

## Control plane

The supervisor is deterministic local code backed by a transactional SQLite ledger. No LLM is required to retain goals, acquire leases, read the clock, honor budgets, classify recognized error codes, calculate backoff, or schedule wakeups.

Components:

- Goal store: versioned desired outcome, acceptance contract, constraints and cancellation state.
- Task graph and event ledger: append-only events, attempts, artifacts, evidence and checkpoints.
- Scheduler: persisted due times, priorities, dependencies, concurrency limits and provider cooldowns.
- Adapter registry: Pi, native Claude Code, native Codex, and optional local inference.
- Health and quota tracker: provider/model/account scope, known reset times, uncertainty and last observation.
- Policy gate: route eligibility, allowed tools and destinations, cumulative budgets, approvals and task restrictions.
- Memory reconciler: resolves applicable user instructions and verified facts for the current revision.
- Verifier: determines completion from evidence at the current acceptance revision, not worker prose.

Separate the control plane from inference workers so model errors do not crash the scheduler. Supervise worker processes, bound output/log size, apply disk retention and reserve enough disk space for durable state. If the ledger cannot commit, stop new side effects and surface storage failure rather than pretending a checkpoint exists.

## Goal and task states

Goals retain an active lifecycle while individual tasks move among `ready`, `running`, `waiting_retry`, `waiting_capacity`, `waiting_input`, `blocked_policy`, and `blocked_constraints`. A goal projection may display the blocker while retaining all completed work. Terminal goal states are `completed`, `cancelled`, and `superseded`.

Every nonterminal task has a durable reason plus one of:

- A persisted next eligible attempt time.
- An external event predicate such as provider recovery, login restored, quota reset or dependency completion.
- An explicit user action or constraint decision needed before proceeding.

A pending approval, active command, or long model response must not be mistaken for a dead worker merely because it produces no text. Track transport heartbeat, process health, task progress and tool-specific deadlines separately. Completion requires all mandatory checks and reviews against the accepted artifact revision. Changing the acceptance contract invalidates affected completion evidence.

## Retry and fallback rules

Use structured adapter error categories first. For retryable errors, apply bounded exponential backoff with jitter and honor provider retry-after values. Persist cooldowns and attempt counts so restarting Clanker cannot reset them. Use a provider circuit breaker to suppress repeated failures; permit a small probe after cooldown. Avoid waking every task simultaneously when a quota window resets.

Route selection must still satisfy access, capabilities, model/effort floors, data destination constraints, permissions and billing. A change of model, provider, adapter or session does not reset task budgets or erase a denial. Metered fallback remains opt-in. Unknown quota is not unlimited; unknown reset times use conservative bounded probes rather than invented capacity.

Exhausting a burst of retries parks the task; it does not delete the goal. A user-defined hard deadline or total budget requires a constraint decision after exhaustion, not automatic renewal. No-progress detection triggers a bounded replan or waits for new evidence. Do not spin forever producing plans that never change artifacts or resolve a dependency.

For policy denials, preserve the affected action, scope and diagnostic. Continue independent permitted tasks. Surface clarification or supported review/verification steps. Do not route the denied action through another model, remove its history, or ask a local model to override the restriction. Reconsider only when a supported resolution or material change in the authorized task supplies a legitimate basis.

## Optional local LLM

A small local model can suggest task prioritization, summarize a redacted diagnostic, or propose a classification for an unknown failure when remote inference is unavailable. It is optional and advisory. Known error handling and scheduling must function with every LLM disabled.

Treat its output as untrusted structured input validated against a schema. It cannot grant permissions, clear policy blocks, invent facts, alter user constraints, reset budgets or mark a goal complete. Revalidate any suggested route through the same deterministic gate. Ambiguous classifications cannot automatically authorize replay of an action.

Bound its CPU/GPU/memory usage, context size and deadline. Its own failure must degrade to deterministic waiting and diagnostics. Do not download a model or start a local runtime automatically. The first installed baseline is Qwen3.5 4B Q4_K_M via llama.cpp and Pi's public custom-provider API. A CPU smoke test passed; broad decision-quality and resource-contention evaluation remain pending. See [local inference](local-inference.md). Its worker can now run as a durable task with a checked output contract; it does not make authoritative scheduler decisions.

## Memory and facts

Use explicit, versioned records rather than treating a growing chat transcript as the task contract. Each record needs:

- Stable ID, kind (instruction, constraint, observation, decision or hypothesis), and scope (project, goal, task or attempt).
- Source identity and reference: user message, trusted project file and revision, tool/check result, or agent claim.
- Author/authority, observed and effective times, applicability, optional expiry, supersession links and evidence references.
- Verification status for facts, including the repository/artifact revision or environment against which they were checked.

Import relevant chats and session material through explicit, available integrations or files; do not assume access to every conversation. Preserve user authorship and provenance. Retrieved documents, test output and agent-written memories cannot promote themselves into instructions. Inferred preferences remain tentative until confirmed or backed by an applicable explicit instruction.

Apply the latest applicable explicit user instructions within their scope while retaining hard execution and access boundaries. A newer unrelated chat does not override a project's constraints. A task-specific instruction does not silently rewrite global policy. Where an authorized update relaxes or replaces a user-defined constraint, record that supersession explicitly. Where sources conflict or scope is ambiguous, pause the affected action for clarification and continue independent work.

Facts can become stale: a passing test is evidence for one revision, a screenshot is evidence for one moment, and a quota observation has a timestamp. Mark stale evidence and recheck it as needed. Do not overwrite contradictory observations with whichever summary was most recently generated.

## Live updates and handoff

Material user updates create a new contract revision. Bind every worker attempt, checkpoint and completion decision to the revision it consumed. Before dispatch and before committing an externally visible action, validate the current revision and permissions. If a running worker has stale constraints, steer or interrupt it and reconcile its partial effects before restarting. Never retroactively assume a new instruction undid an already executed action.

A successor receives the current goal/constraint revision, applicable memories with provenance, verified facts, artifacts, outstanding approvals, failures and remaining acceptance work. It does not receive credentials or private reasoning. Preserve both the checkpoint revision and any subsequent user updates; do not let an old checkpoint restore a superseded instruction.

## Durability and recovery invariants

Use transactional state transitions, unique attempt IDs, compare-and-set revisions and fenced leases. Write a dispatch intent before spawning; reconcile incomplete dispatches after restart. There can be only one authorized writer to a workspace or shared desktop. Loss of a supervisor lease must prevent further worker actions before a successor becomes active; storage leases alone do not stop an orphan process.

Do not claim exactly-once behavior for arbitrary external tools. Record intent and result, use service idempotency keys when supported, and inspect uncertain outcomes before replay. Preserve patches and untracked artifacts without collecting secrets. Validate checkpoint integrity and fail visibly on corruption. Provide tested backup and restore procedures for the local ledger.

## Acceptance and fault-injection suite

The goal supervisor is not ready until a disposable fixture demonstrates:

1. All cloud providers unavailable: goal remains durable with scheduled retries and no inference dependency in the scheduler.
2. Quota exhaustion: no busy loop or paid fallback; a permitted alternative runs or the task wakes after reset.
3. Local model unavailable or malformed: deterministic scheduling continues and policy does not change.
4. Supervisor crash/restart and machine sleep: outstanding intents, stale workers and overdue timers reconcile without two writers or duplicate effects.
5. Failed native-session resume: the preserved goal continues from artifacts on an authorized route.
6. Cybersecurity/policy denial: affected action remains blocked, progress is retained and unrelated allowed tasks can continue.
7. Mid-run user correction: the next action uses the new contract; stale worker output cannot satisfy the revised goal.
8. Conflicting or poisoned memory: provenance prevents a document or agent claim from changing authority.
9. Repeated no progress: bounded replanning then a durable wait with a useful explanation.
10. Disk full, corrupt checkpoint and interrupted ledger write: no silent success or dispatch without recorded intent.
11. Verified goal completion, explicit cancellation and supersession: workers stop, ownership is released and no pending retry resurrects the goal.

Track recovery latency, duplicate-action count, lost-checkpoint count, unnecessary retries and human intervention per completed task. “Bulletproof” is an engineering aspiration; support claims must come from these tests and real runs.

## Coding workflow tasks

A task may now declare `acceptance.kind: "workflow"` with a complete execution
contract digest, a review task and a review-pair budget. The text supervisor skips
these tasks without spending attempts or accepting textual claims of success.
Use Pi's `/clanker goal-work` to create the bound workflow; see
[the handoff contract](pi-package.md#goal-to-workflow-handoff--cycle-060).
Use `/clanker goal-admit <coding-id>` after verification to admit the artifact and
unlock dependencies. Bounded dependency selection is available through
`goal-step` below; continuous dispatch remains unfinished.
Source/context revisions block stale work while preserving its
creation identity; automatic migration to the new revision remains pending.

`/clanker goal-sync` records unfinished workflow usage and waits in an optional
`workflowProgress` observation. The text supervisor preserves it and still skips
workflow execution. Its counters are not additive with admitted task attempts;
resuming work must consult the coding/workflow journals. Historical observations
survive revision with their original binding and cannot authorize current work.

Pi foreground resume/run-verified now collects these observations after settlement.
A crash before collection can leave them stale; the supervisor must not treat
the cached observation as fresh execution authority. Manual `goal-sync` remains
available. `goal-step` below also collects after its action; periodic collection
and continuous dependency dispatch remain unfinished.

Cycle 064 adds `/clanker goal-step <goal-id>` for one bounded workflow action.
Tasks opt in with declared files and a verification file under workflow acceptance.
The deterministic planner skips cooling/blocked work and checks current verified
dependencies. A shared supervisor lease fences all result publication. Admission
can complete the artifact task, while dependent coding waits for applied source
hashes. This supersedes the earlier absence of dependency selection; periodic
wakeups, automatic source promotion and revision migration remain unimplemented.
See [Pi scheduling](pi-package.md#bounded-goal-scheduling--cycle-064).

Cycle 066 adds `/clanker goal-run <goal-id>` to advance multiple workflow stages
and wait on known retry times in one foreground invocation. The controller needs
no LLM for waiting, and resumes saved work when explicitly restarted. Untimed
blocks return `needs_attention`; source promotion and automatic process/service
restart remain separate. See [foreground goal execution](pi-package.md#foreground-goal-execution--cycle-066).

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
