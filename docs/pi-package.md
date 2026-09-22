# Relentless as a Pi package

Relentless is both a reusable TypeScript engine and a local Pi package. Pi extensions
register `/relentless` and the existing Meta and Alibaba catalogs. The durable engine
keeps its SQLite journals, billing constraints, provider health and worker process
boundaries; those responsibilities do not move into chat history.

For a portable local archive, follow [alpha installation](release-alpha.md). The archive includes built workers and a frozen dependency lock; it does not need this checkout. Development installation still works as follows.

For GitHub installation use `pi install -l git:github.com/alexlopashev/pi-relentless`; npm installs dependencies and builds worker entrypoints automatically.

Build Relentless first for development from this checkout:

```sh
mise exec -- pnpm build
```

From another project, use that project's Pi installation to register the local
package (this changes the project's Pi settings):

```sh
pi install -l /absolute/path/to/pi-relentless
```

Start Pi in that project, or `/reload` after installing. The current checkout
also discovers `.pi/extensions/relentless.ts` after project trust is established.
Local packaging needs no npm publication. Rebuild after engine changes: Pi loads
extension source, while subprocess workers execute the compiled `dist` entry.
The development installation follows this checkout. The alpha archive can instead be extracted into a stable directory with its own production dependencies.

Local installation and model discovery have also been exercised through the
ordinary Pi CLI in a fresh project outside this checkout, with an isolated Pi
agent directory. The package loaded its extensions and configuration skill.
`/relentless inventory` works before a `relentless` settings section exists: it lists
session-visible models with no configured roles or dispatch permissions. Invalid
existing configuration still fails validation. This startup/discovery check does
not establish stock-CLI live coding or subscription authentication on its own. The separate user-operated cycle111 subsequently verified live authoring, review, VM verification and installation through the ordinary CLI.

Available commands:

- `/relentless inventory [offset]` inspects the active Pi registry, project roles and recorded health without provider probes.

- `/skill:relentless-configure` discovers models and proposes task-specific policy
  changes for human review. It is included in the installed Pi package.
- `/relentless goal-status <goal-id>` reads goal-recorded progress and observed coding attempts without dispatch.
- `/relentless goal-create <contract-json>` saves a goal using current project routing without inference.
- `/relentless goal-run <goal-id>` keeps advancing workflow tasks and waits for saved retry times.
- `/relentless goal-step <goal-id>` advances one eligible declared goal workflow action.
- `/relentless config-propose <relentless-json>` saves an exact configuration proposal without applying it.
- `/relentless config-apply <proposal-id>` requests interactive confirmation and applies an unchanged proposal.
- `/relentless config` validates and displays the project policy.
- `/relentless route <role> <task-json>` previews a permitted model selection.
- `/relentless create <task-json>` snapshots a bounded coding/review workflow.
- `/relentless calibration-plan <suite-json>` previews a prospective coding cohort.
- `/relentless calibration-create <suite-json>` saves the complete cohort without inference.
- `/relentless calibration-status <cohort-id>` inspects that saved cohort offline.
- `/relentless calibration-report <cohort-id>` accounts for every planned trial without dispatch.
- `/relentless calibration-admit <cohort-id>` validates and records complete coding evidence without changing routing policy.
- `/relentless calibration-prepare <trial-json>` prepares one reserved coding workflow.
- `/relentless calibration-step <trial-json>` explicitly advances that trial through coding/review or verification.
- `/relentless status <coding-id>` reads the active project's workflow.
- `/relentless run-verified <coding-id> <execution.json>` runs the bounded review/verify/repair loop.
- `/relentless resume <coding-id>` explicitly advances one bounded workflow step,
  using its saved model, review and billing configuration.

Workflows live in that project's `.harness` journals. Calibration-step supports
verification and receipt reconciliation for saved trials; other verification
workflows and source promotion use the CLI. Loading the package
does not launch workers. The adapter does not yet offer a background service,
model-callable dispatch tools. Interactive commands show immediate footer activity and elapsed time; goal-step/run also sample saved workflow phases every two seconds. Footer cleanup is fenced on completion, pause, abort and session changes. The display reports persisted observations, not provider streaming or proof that remote inference has stopped. The read-only `relentless_inventory`
tool lets the setup skill discover session models, including before configuration;
its only input is an optional nonnegative integer `offset`. It uses the same
inventory projection and pagination as the command, rejects stale, cancelled or
untrusted sessions, and cannot apply policy or dispatch work.
`relentless_config_propose` accepts a `configuration` namespace object and saves its
validated, content-bound proposal. It returns the before/after policy, digests and
exact `/relentless config-apply` command for human confirmation. It has no approval
argument or apply operation; saving a proposal cannot authorize dispatch. The
setup skill uses these tools to discover and draft, then hands application to the
user. Cycle 032 adds normal
session-shutdown cancellation as described below. A running step remains bounded
by worker timeouts and durable leases; full crash reconciliation is unfinished.

Validated against the installed Pi 0.85.1 package and its extension/package docs.
An offline regression uses Pi's real loader and a deliberately invalid job to
prove the worker subprocess starts and rejects input without provider inference.

## Runtime requirement

Use Node/npm Pi or the standalone Bun executable. Both use native SQLite for
local journals; Bun-hosted sessions locate Node on `PATH` for workers and fixed
TypeScript checks. Node 24.21.0 remains a prerequisite. See
[host compatibility](../README.md#standalone-pi-executable).

## Pi-first direction and project configuration

The packaged [relentless-configure skill](../skills/relentless-configure/SKILL.md)
guides model discovery, role assignment and bounded calibration planning. It
reads project constraints and Pi's effective registry, distinguishes entitlement
and cooldowns from measured capability, and presents an exact settings diff before
application. Configuration approval does not authorize live probes. It preserves
unrelated Pi settings and rechecks the source settings before applying an approved
diff. The extension now enforces interactive confirmation for its configuration
application command, with source digest and project checks. Discovery and role
recommendation remain agent-guided; they do not run as a background service. The
runtime continues to enforce existing routing and dispatch constraints. Install the whole local
package to discover the skill; loading only the extension file does not load it.

The primary product direction is a Pi extension, not a parallel interactive
harness. Use Pi's authentication, effective model registry, scoped models,
project trust and session lifecycle. The engine remains reusable internal modules;
the CLI is for diagnostics and recovery. Durable facts, goals, budgets and pending
operations remain in the engine's journal rather than depending on chat context.

Project policy now has a validated extension-owned `relentless` namespace in Pi's
project `settings.json` (normally `.pi/settings.json`). No `pi-relentless.toml` is
needed. `/relentless config` reads and validates it only in a trusted project. The
installed Pi 0.85.1 settings manager preserves the namespace when writing native
settings; a compatibility regression verifies this. Pi's typed Settings interface
does not itself define the field. Relentless reads project policy without inheriting
implicit global billing permissions and never rewrites unrelated settings.

```json
{
  "relentless": {
    "version": 1,
    "routing": {
      "candidates": [
        {
          "name": "local-controller",
          "provider": "relentless-local",
          "model": "qwen3.5-4b",
          "billing": "local",
          "enabled": true,
          "quality": 1,
          "preference": 1,
          "efforts": ["off"]
        }
      ],
      "maxConcurrency": 1,
      "allowMetered": false
    },
    "roles": { "scheduler": ["local-controller"] }
  }
}
```

The example is a minimal schema example, not a recommendation to run the whole
project on the local controller. The model pool can enumerate cloud and local
candidates using the existing routing schema. Roles currently supported in the
configuration are planner, coder, reviewer, verifier and scheduler; their lists
express eligibility, not measured competence. Deterministic verification remains
the acceptance authority, even when a model helps prepare or diagnose tests.

Project settings now drive scoped route previews and creation of bounded coding
workflows. New work freezes its policy; existing workflows keep their saved
configuration and are checked against current Pi permissions before dispatch.
Completed evaluation journals can inform workload-specific routing. Policy
migration for active work, automatic coding calibration and the complete durable
goal loop remain unfinished. Session shutdown cancellation is integrated;
ambiguous remote outcomes still require reconciliation rather than blind replay.
The local controller can assist planning when hosted models are unavailable;
deterministic retry scheduling itself must remain available without any model.

## Role routing and dispatch scope — cycle 031

`/relentless route <role> <task-json>` previews the route for a task without inference.
The task uses the existing task schema: `id`, `prompt`, `minQuality`, `effort`, and
optional provider/model pins or workload optimization policy. For example:

```text
/relentless route scheduler {"id":"retry-plan","prompt":"Plan pending retries","minQuality":1,"effort":"off"}
```

Selection intersects the configured role pool with Pi's currently available model
registry, its session-scoped models, supported reasoning levels and exact scoped
thinking pins. It applies billing permissions and shared goal/coding provider
cooldowns. An empty Pi scope means unscoped, matching Pi's API contract. A missing
role grants no candidates. The existing router preserves task floors and pins;
workload optimization requires matching current evidence and does not invent
subscription cost. Output distinguishes configured policy from configured
workload evidence and keeps capacity unverified. This command neither validates
the provenance of imported observations nor runs evaluation trials.

The package now registers the local Qwen provider in Pi using the same fixed
loopback catalog as the workers. Registration does not start its server or prove
its capacity. Other model catalogs and credentials continue through Pi.

Actual `/relentless resume` also rechecks each coding/reviewer selection before its
worker starts. It requires a valid trusted project policy and a current Pi model
snapshot; selected identity, billing, reasoning and role must remain permitted.
It conservatively requires the current policy tier to cover the saved tier. An
incompatible selection blocks rather than silently revising the durable workflow.
Thus pre-existing workflows with no project policy can still be inspected, but
need a matching `relentless` configuration before Pi can dispatch them. Saved time,
review and attempt budgets are not replaced by new project settings. Existing
workflow code still enforces author/reviewer independence and provider health.

This is a dispatch constraint, not full policy migration or automatic role
assignment. Binding new goals to policy versions, using Pi's effective provider
configuration in worker sessions, automated capability evaluation and session
shutdown/reload reconciliation remain active work. Until those are connected,
custom providers present only in an interactive Pi registry may not be executable
by the separate worker runtime. The CLI remains a separate diagnostic/recovery
entry point and does not implicitly acquire a Pi session scope.

Relentless's own `.pi/settings.json` now enumerates the existing ten-model ensemble
and initial role eligibility, including the local scheduler. These are policy
assignments, not measured strengths. The existing billing permissions are retained;
Anthropic API access remains disabled. The file contains no credentials and does
not trigger work when loaded.

## Pi session lifecycle — cycle 032

The extension handles Pi's session start/shutdown events, including reload and
session replacement. Shutdown closes local command admission and aborts active
workflow/worker signals. An admitted command owns its slot until its promise
settles; reopening the same instance cannot erase an old active slot. Results
from an aborted or older session generation are not published into Pi's UI.
Commands invoked against a closed instance do not publish errors into that stale
UI either. Startup opens admission without automatically dispatching work.

Workflow resume now accepts an external abort signal. Cancellation while awaiting
dispatch policy checks prevents worker launch, and cancellation during a worker
reaches its abort signal without starting a replacement. Known interruption is
persisted through the existing failure path, which may leave the workflow blocked.
These controls are local to an extension instance: abort requests do not prove
remote inference stopped. A new extension instance still relies on durable
workflow/coding leases to coordinate with an old process.

**Remaining recovery gap:** the coding journal currently permits another bounded
attempt when a running lease expires. Lease expiry alone does not confirm the
previous inference terminated. This differs from the evaluation ledger's
ambiguous-dispatch behavior and must be reconciled before claiming crash-safe
continuous goal pursuit. Current tests preserve that existing journal behavior;
cycle 032 does not silently change it. Normal Pi lifecycle cancellation, process
crash reconciliation, and safely resuming a blocked goal are distinct work.

## Expired-dispatch update — cycle 033

The lease-expiry gap described in cycle 032 is now closed against automatic
replacement dispatch: expired running coding attempts become durable `ambiguous`
state and workflows block with that reason. No additional attempt is consumed,
including when the budget is already exhausted. Late blocking denials remain
accepted evidence. Recovering useful work from that ambiguity without blind
replay is still unfinished; see [coding recovery behavior](coding-workers.md#ambiguous-expired-dispatches--cycle-033).

## Creating work inside Pi — cycle 035

`/relentless create <JSON>` snapshots a bounded coding request and its independent
review policy from the active trusted project's `.pi/settings.json`. There is no
separate routing file. Example (enter as one command):

```text
/relentless create {"task":{"id":"fix-sum","prompt":"Correct sum; preserve the public signature.","minQuality":1,"effort":"low"},"files":[{"path":"src/sum.ts","writable":true,"requiredExports":["sum"]}],"maxAttempts":2,"reviewTask":{"id":"review-sum","prompt":"Review correctness and regressions against the requested change.","minQuality":1,"effort":"low"},"maxReviewPairs":1}
```

Optional `context` contains explicit `requirements` and background `facts` arrays.
The source root is the active Pi project; overrides are rejected. Input is bounded
to 64 KiB and uses the existing coding file/snapshot limits. Only existing declared
files are snapshotted. Creation never invokes inference, runs candidate code,
changes source files, or starts an unattended loop. It returns the coding ID;
`/relentless status <id>` inspects it and `/relentless resume <id>` advances it.

Coder and reviewer configurations are copied from the project policy, intersected
with Pi's available catalog and exact session model/effort scope. Task pins,
reasoning floors, evidence requirements and billing permissions are retained.
Task-ineligible coding candidates are excluded. Each remaining potential coding
provider must have two independently routable review providers. Providers may
remain eligible for several roles across projects/tasks. Actual review excludes
ALL providers in the candidate's coding history, so a multi-provider fallback
history can still exhaust independent reviewers and block. Creation is not a
promise of future quota or reviewer availability. Cooldowns are evaluated at
execution, rather than permanently removing temporarily unavailable providers
from the saved task.

The saved coding/review configurations are frozen; existing resume checks also
consult current project permissions and Pi scope. This is not automatic policy
migration or full binding of every later project-setting change. Normal trust
revocation/cancellation and a policy change during source reads reject creation.

**Historical cycle 035 limitation:** coding and workflow creation originally used
separate, non-idempotent commits. Cycle 036 below adds a recoverable intent to new
Pi-created tasks. Older tasks without that intent require explicit recovery.

## Idempotent creation recovery — cycle 036

A new Pi task's `task.id` is its project-local creation key (1–200 characters).
Repeating `/relentless create` with the same normalized input returns the same coding
ID. Reusing the key with changed task text, files, context, attempt budget, review
request or review budget is rejected. Use a new task ID for genuinely new work;
creation does not revise an existing task.

The coding journal commits the source snapshot and a hashed creation intent in
one SQLite transaction. The intent binds the normalized request hash, canonical
project root, frozen review policy/budget and original checkpoint hash. If a crash
occurs before commit, neither task nor intent survives. After commit, repeating
creation retrieves that intent before reading current sources or project settings.
This preserves the original snapshot and permissions even if those files changed.
No model invocation is part of recovery. Current permissions/model scope are still
checked separately before actual workflow dispatch; recovery does not authorize
using a route that the project has since disallowed.

Workflow attachment is idempotent and holds the coding checkpoint write fence.
A missing workflow is attached only to the original ready, revision-one,
zero-attempt snapshot. An existing matching workflow is returned in its current
phase, preserving attempts, reviews and verification. A changed/cancelled coding
snapshot, mismatched review contract, corrupt intent or changed creation request
fails closed. An observed attachment failure returns `creation_incomplete` and the
retained coding ID; repeating the original creation request can retry attachment.

Creation still spans two databases; the durable intent provides reconciliation,
not an atomic cross-database transaction. Real SIGKILL tests cover the uncommitted
source insertion, committed intent before attachment, and attachment committed
before the UI result. Concurrent requests with an initialized coding journal
converge on one task. These tests do not establish power-loss behavior on every
filesystem, recovery from damaged storage, or interruption of initial database
schema setup. Existing legacy tasks with a matching root/task ID but no intent are
rejected rather than guessed or duplicated. Automatic legacy migration and a
background recovery scheduler remain unfinished; recovery here occurs when the
user repeats the creation command.

## Local evaluation evidence — cycle 037

Pi role previews and newly created work can load completed evaluation journals
listed in the project's `relentless.evidence` settings. Add this alongside `version`,
`routing` and `roles`:

```json
{
  "evidence": {
    "evaluations": [".harness/evaluations/your-evaluation-id"]
  }
}
```

The existing `relentless evaluate <config.json> <suite.json>` command creates these
directories. Merely listing a directory, opening Pi, previewing a route or creating
work never runs an evaluation or starts a model. Evaluation execution remains an
explicit, separately bounded operation. Paths must name immediate directories
inside `.harness/evaluations`, with at most 32 unique sources. Missing or invalid
sources fail closed rather than silently reverting to preference routing.

The loader reads the frozen request and a read-only SQLite snapshot. It verifies
checkpoint integrity, normalized contract, full planned cohort, suite/case/model/
effort/billing bindings, and absence of pending/stopped execution. Incomplete or
ambiguous evaluations are excluded wholesale. Request reads are bounded; symlinked
directories/files are rejected, and directory identities and resolved containment
are rechecked across the read. No evaluation configuration is imported as project
permissions, candidate eligibility, billing authorization or concurrency policy.

Completed host-assessed observations merge with explicitly configured observations.
Failed trials and unknown costs remain present. Identical IDs deduplicate;
conflicting IDs reject the load. This prevents counting copied trials repeatedly.
Existing workload/suite/case matching, recency, balanced samples, per-case success
requirements and cost-availability checks still govern optimization. Model pins,
reasoning floors, Pi scope and current billing constraints remain mandatory.
New coding work freezes the loaded observations; replaying creation preserves that
original policy rather than replacing it with newly discovered measurements.

These are **trusted local host records**, not signed attestations. Hashes detect
inconsistent artifacts, not an owner rewriting both records and hashes. The loader
does not rerun acceptance from archived outputs, and explicit observations in
configuration retain their existing trusted-input status. A route preview labels
this mixed source `local_evaluation_and_configured_evidence`; it does not certify
all configured rows as independently verified. Never populate observations from
model self-assessments. A suite proves only its declared acceptance predicates;
JSON fixture success is not evidence of general coding ability. Automatic suite
selection, coding-outcome calibration and unattended evaluation remain unfinished.

## Prospective coding calibration preview — cycle 041

`/relentless calibration-plan <suite-json>` uses the active project's coder and
reviewer roles intersected with Pi's available/scoped models. Input supplies
`version: 1`, `id`, `workload`, `repeats`, `maxReviewPairs`, `reviewTask` and
`cases`. Each case supplies `id`, a coding `request` rooted at the canonical
active project directory, `sourceHashes` for exactly its declared files, and an
`execution` contract with pinned VM runtime/test artifacts and acceptance policy.
Input cannot supply routing configurations or broaden billing permissions.

The preview requires 2–10 cases sharing one ordered author cohort, 1–3 repeats,
at most 30 trials, and two independent reviewer providers for each eligible
author. It hashes the normalized contract and comparable suite inputs, including
prompts, source/test/runtime pins and attempt/time budgets. Each prospective slot
receives a deterministic ID. Role assignments remain eligibility policy; they
are not inferred capability claims. Optimization-based task selection is rejected
here so prior leaderboard results cannot silently replace the declared cohort.

The output explicitly reports `dispatched:false`, `persisted:false` and
`artifactsVerified:false`. These are declared hashes, not inspected artifact
bytes. The command performs no inference, journal reservation, source edit or VM
launch. Durable reservation, execution against verified pins, complete failure
accounting and verified outcome admission are still required before these plans
can supply coding capability observations. A preview does not authorize execution.

## Durable calibration cohorts — cycle 042

`/relentless calibration-create` accepts the same JSON as the preview. It saves the
normalized contract and all planned slots atomically in the active project's
`.harness/calibration.sqlite`. The user-supplied cohort `id` is the creation key:
repeating the same resolved contract returns the saved state, including existing
reservations; changing its model/policy/case contract under the same ID rejects.
A changed project policy or available model set can therefore make repeated
creation conflict. Use status to inspect the original contract; nothing silently
migrates its cohort or permissions.

`/relentless calibration-status <cohort-id>` opens the journal read-only and needs no
model registry or provider connection. The stored root must match the active
project. Both commands report `persisted:true`, `dispatched:false` and
`artifactsVerified:false`. Creation freezes declared pins; it does not inspect
source/runtime/test bytes or authorize later inference.

The journal's internal `reserve` operation commits one stable coding identity per
planned trial. Concurrent or repeated reservations reuse it, and unknown trials
reject. These are durable intents, not worker leases. The execution adapter must
create/recover the same coding identity, enforce current project permissions and
verify the contract's source/test/runtime pins before dispatch. Cycle 043 below
connects preparation to these reservations; full automatic cohort execution
remains unfinished.
There is no API for turning a reservation into success or routing evidence.

SQLite uses WAL/FULL and immediate write transactions. An application/schema
marker is committed with initialization; foreign databases and marked journals
with missing or malformed tables reject rather than silently resetting identities.
Real SIGKILL tests cover
before/after schema, cohort and reservation commits; three competing processes
share one identity. Stored state is hashed and revalidated against the complete
planned cohort. These checks detect inconsistent local records, not an owner
rewriting both data and hashes, and process-kill tests do not prove every
filesystem's power-loss behavior. Complete trial execution/failure accounting
and independently verified outcome admission remain unfinished.

## Preparing coding trials — cycle 043

`/relentless calibration-prepare {"cohortId":"your-cohort","trialId":"<trial-hash>"}`
connects a saved trial to a coding workflow. It returns `codingId`, `phase`,
`dispatched:false`, `sourcePinsVerified:true` and `artifactPinsVerified:true`.
Use the existing `/relentless resume <codingId>` to explicitly advance coding or
review under Pi's current pre-dispatch role/scope/billing checks. Preparation
itself never calls a model, packages an image, launches a VM or grants acceptance.

The reservation UUID becomes a namespaced creation key (`calibration:<uuid>`).
The existing atomic Pi creation transaction maps that key to exactly one coding
ID and commits the source snapshot together with its creation intent. A recovered
reservation therefore reuses the same coding task even after interruption between
cohort reservation, source insertion and workflow attachment. The coding ID need
not equal the reservation UUID. Preparing again preserves attempts and workflow
progress rather than taking a new source snapshot.

New preparation requires the assigned author and two independent reviewers to
remain eligible under current project policy and Pi scope. It freezes a singleton
author configuration with the exact planned provider/model/effort and existing
budgets: a trial cannot silently switch authors after quota exhaustion. Original
source bytes must match the declared hashes. Saved-source recovery can proceed
with a changed working file or unavailable model registry because it dispatches
nothing; ordinary Pi resume must still enforce current permissions.

The bounded artifact reader verifies runtime and test hashes on every preparation,
including recovery. It rejects final-component symlinks, nonregular files,
changed metadata, oversized input and cancellation. Runtime files are capped at
512 MiB each, tests at 8 MiB each/32 MiB aggregate. Parent directory symlinks are
not containment boundaries for these explicitly pinned operator artifacts.
Verification is a point-in-time byte check: files can change later, so VM packaging
and execution still must recheck their pins. No test result or capability score is
inferred from successful preparation.

Process tests interrupt four actual preparation boundaries and recover one coding
run/workflow with zero attempts. They use initialized coding journals; the older
coding/workflow database initialization limitations still apply. Automated cohort
execution, binding verification receipts back to the planned acceptance contract,
complete failure accounting and routing-observation admission remain next.

## Advancing a trial — cycle 044

`/relentless calibration-step {"cohortId":"your-cohort","trialId":"<trial-hash>"}`
prepares or recovers the trial, then performs one bounded workflow advancement.
Coding and independent review use the existing worker budgets and the shared Pi
pre-dispatch guard. A reviewed candidate is packaged and tested using the cohort's
saved execution/acceptance contract. Call again to advance a permitted repair or
to reconcile completed verification. This command can perform model inference or
launch the local VM; unlike preparation it is an execution command.

Verification directories are fixed by trial ID and reviewed checkpoint beneath
`.harness/calibration-verification`. A new directory permits one verification
attempt. An existing directory is reconciliation-only: complete evidence is
revalidated against the saved execution contract, while partial/ambiguous evidence
rejects without another VM launch. A repaired, independently reviewed checkpoint
gets a separate directory within the same attempt/review budgets. Previous failed
receipts remain bound to their own checkpoints rather than blocking the repair.
No source promotion occurs automatically.

Pi session cancellation is forwarded to the owned Python verification supervisor;
the call waits for that process to close. The supervisor retains responsibility
for VM interruption and reaping. The adapter checks session/trust boundaries
before packaging and VM execution. Cancellation or trust loss can leave partial
artifacts requiring reconciliation; it does not grant permission to replay them.

The result reports coding ID, phase and action (`workflow`, `verified_attempt`,
`reconciled` or `blocked`). `verified_attempt` means verification was attempted;
the returned phase determines whether it passed, needs repair or is blocked.
No capability observation is created by this command. Full cohort scheduling,
complete failure denominators, aggregate cost/latency accounting and verified
routing-evidence admission remain unfinished. Alibaba Personal remains limited to
explicit bounded interactions; this adds no unattended service or cohort loop.

## Cohort accounting — cycle 045

`/relentless calibration-report <cohort-id>` reads the saved cohort and local coding/
workflow journals without contacting a model or creating missing databases. Every
planned slot remains in the report with its case, model, billing mode and effort.
Unreserved slots are `planned`; reserved identities without coding creation are
`reserved`. Missing workflow attachment, running/waiting work, ambiguous ownership,
review, repair and required verification remain visible rather than being omitted.
Cancelled, blocked and exhausted work is terminal accounting, not a successful
coding result. Expired coding ownership and uncertain review ownership remain
nonterminal `ambiguous` states; the report never authorizes replay.

The report validates creation-key, frozen author configuration, source snapshot
and review-policy bindings. A matching verified workflow is labeled
`verified_unadmitted`; it does not revalidate the VM artifact chain or emit routing
observations. `complete` means every planned slot is terminal in the observed
journals, while `rankingEligible` remains false even for a complete cohort.
Independent SQLite read snapshots are not one atomic cross-database snapshot;
concurrent work can require another inspection before the state is consistent.

`authorElapsedMs` sums available durable author-attempt measurements, including
failed attempts, only when all attempts have matching provenance. It excludes
reviews, VM time, waiting and scheduling overhead. `authorEstimatedUsd` remains
null for incomplete telemetry, subscription/local billing or any unknown metered
estimate; unknown usage is never substituted with free usage. These fields are
observations about author work, not complete workflow price/latency. Receipt
admission, complete workflow measurement and the model-selection feedback loop
remain unfinished.

## Verified coding evidence admission — cycle 046

Declare `"measurement": "author-attempts-v1"` when creating the prospective
calibration contract. This protocol is part of the suite identity; older cohorts
cannot acquire it retrospectively. Once every planned trial is terminal, use
`/relentless calibration-admit <cohort-id>`. Pending or ambiguous trials prevent
admission. Failed/cancelled slots remain failed observations, including unknown
timing and cost; they are never discarded to improve a model's score.

Successful observations require the exact reviewed coding checkpoint, two
independent reviewer providers, and an accepted host-validated VM receipt matching
the frozen execution contract. Admission rechecks checkpoint hashes under coding
and workflow write fences before committing the immutable cohort record. It
neither launches inference nor changes project settings. Artifact corruption or
subsequent workflow changes cause evidence loading to fail closed.

To authorize use of an admitted cohort, review a project settings proposal adding
its ID under `relentless.evidence.calibrations`, for example:

```json
{ "evidence": { "calibrations": ["typescript-cohort-001"] } }
```

This fragment belongs inside the existing `relentless` object, not at the top level
of Pi settings. `evaluations` and `calibrations` may coexist; at least one nonempty
source list is required. Loading revalidates every calibration's artifacts and
checkpoint provenance without dispatch or timestamp refresh, then merges its
observations. It imports no candidate, billing or role permissions from the cohort.
The configuration skill proposes this change for approval; admission alone never
authorizes it.

Latency and estimated cost in this protocol cover **author attempts only**, including
failed attempts. They exclude reviewers, VM execution and queue time. Unknown
latency disqualifies latency ranking; unknown cost disqualifies cost ranking.
Success-rate, sample-count, balanced-case, recency, workload and suite requirements
still apply, so admission is not a sufficient-confidence claim. The route basis
`local_calibration_and_configured_evidence` may also contain explicitly configured
observations and tool-free evaluations when configured. It does not certify those
other inputs as coding evidence. The raw accounting report remains non-authoritative
for acceptance (`rankingEligible: false`); only admission validates proofs.

Representative live multi-provider cohorts, full-workflow metrics and automatic
cohort scheduling remain unfinished. Tests use offline synthetic review/VM fixtures,
which are validation of the mechanism, not measurements of provider capability.

## Review and model-attempt accounting — cycle 049

`calibration-report` now includes `reviewAccounting`: observed attempt count,
completeness, elapsed time, estimated cost and `knownMeteredUsd`. Every recorded
review attempt counts, including failed validation, provider failures and stale
responses. Missing reserved-pair reports or legacy reports without attempt
telemetry make totals unknown. A known metered subtotal may still be reported but
is not a total-cost estimate. Unknown subscription/local cost and missing or zero
metered estimates are never converted into free inference.

`modelAttemptElapsedMs` and `modelAttemptEstimatedUsd` combine author and review
attempt totals only when both are known. They exclude queue time, packaging, VM
execution and orchestration overhead; `workflowElapsedMs` and
`workflowEstimatedUsd` explicitly remain null. These are observational fields,
not a new evidence-admission protocol or optimization metric. The existing
`author-attempts-v1` contract and frozen pilot observations remain unchanged.

## Verification timing receipts — cycle 050

New verification assessments and saved workflow proofs include optional `timing`
with scope `prepare_to_assessment`: packaging, the supervisor call interval,
setup/assessment overhead, the combined active interval, and the VM's own elapsed
time. The VM interval sits inside the supervisor interval and must not be added
twice. Reconciliation preserves the measurements and checks the VM value against
the bound execution report. Timing does not influence the acceptance decision.

`calibration-report.verificationTiming` shows the latest saved verification
interval, including a failed assessment when recorded. It is not a sum across
repairs. Invalid/nonmonotonic clocks produce unknown host durations; exceptions
before a complete assessment leave no completed timing receipt. Old proofs keep
absent timing, so no fresh timestamp or zero duration is fabricated by reading
them. Full workflow totals remain unknown: queue waits, all verification attempts,
and persistence/orchestration outside this interval are not fully captured yet.

## Verification attempt history

Calibration reports now expose `verificationHistoryAccounting`: observed, recorded
and pending attempts, a known active-time subtotal, and a total only when every
attempt has timing and the history is complete. Reservations are journaled before
packaging, bind the reviewed checkpoint and package digest, and survive restart.
A reserved directory cannot be dispatched again; existing artifacts must be
reconciled. Failed receipts remain after repair. Each workflow allows at most
20 verification reservations; reaching that limit fails before packaging. Legacy
history remains explicitly incomplete. These measurements cover verification
activity through assessment, not queueing or total workflow duration.

Reviewer attempt latency is nullable when the monotonic clock fails, regresses or
returns invalid data. Such failures do not alter review decisions or signal/timer
cleanup. Review accounting preserves independently known metered cost but leaves
total latency unknown when any attempt lacks timing. Its `complete` flag describes
report coverage, not certainty of every individual measurement.

## Continuous verification and repair — cycle 053

Run `/relentless run-verified <coding-id> <execution.json>` in a trusted Pi project
(or `relentless workflow run-verified <coding-id> <execution.json>` from the CLI).
The JSON uses the existing execution schema: pinned package/runtime/test artifacts
plus the declared acceptance rule. The file must be a regular file of at most
64 KiB. Relative paths are resolved against the active project.

This explicitly runs one existing workflow through coding, two independent
provider reviews, verification and any permitted repair. It retains the original
coding and review budgets, pins and billing policy. Pi rechecks current dispatch
permissions, and trust before and after packaging/VM operations. Session shutdown
cancels the run. Alibaba Personal remains excluded from continuous execution.

The execution contract digest is immutable and must be bound before verification
starts. Each reviewed checkpoint has a deterministic artifact directory. Existing
artifacts or pending reservations are reconciliation-only; incomplete evidence
stops the run without replay. Restart with the same command and execution contract.
Verified completion revalidates saved evidence. Source promotion remains a separate
explicit action. The command does not install a service or plan a graph of goals.

## Assessment recovery from supervisor receipts — cycle 054

New verification runs durably save `supervisor.json` before the assessment. It
binds the observed supervisor exit to the exact checkpoint, execution contract
and report. If assessment storage was interrupted, reconciliation can derive the
same decision from that receipt and revalidate the source, tests, runtime and VM
report without running another process. Inspection remains read-only. Recovery
without the original assessment leaves host timing unknown.

An absent receipt and absent assessment remain unresolved. Corrupt assessment
files are rejected rather than replaced, and conflicting receipts are rejected.
Legacy complete assessments remain supported without a receipt. This closes the
receipt-to-assessment crash window; interruption before the receipt is persisted
still requires reconciliation of the unresolved outcome.

Read-only workers now preflight stored OAuth expiry against Pi's five-minute
validity window. Refresh-required credentials produce `auth` before inference;
use Pi's `/login` path to renew them. Inventory reports `oauthFreshness` separately
from credential presence and unverified capacity. No paid fallback is enabled.

## Reviewer retry waits — cycle 056

Recognized reviewer inference failures (`quota`, `outage`, `unavailable`) now save
an exponential-backoff retry time, honoring a longer provider Retry-After, when
the original review-pair budget has capacity. A resumed workflow before that time
makes no calls and consumes no additional pair. When due, it reruns the independent
review pair against the same author checkpoint; the author is not rerun. Every
failed report remains in history and accounting.

The continuous runner waits using this persisted time. Bounded `resume` and
calibration-step return the waiting state for later advancement. Pair exhaustion
blocks the workflow; restart never replenishes budgets. Authentication, denials,
validation failures, timeouts, interruptions and unknown/stale outcomes do not
enter this automatic retry path. These waits are per workflow; global reviewer
cooldowns and immediate selection of alternative reviewers remain unfinished.

## Shared reviewer availability — cycle 057

Workflows now persist provider cooldowns from recognized reviewer failures,
including the final budgeted attempt, and share them with other reviews in the
same project. Pair preflight occurs before reservation: use two permitted,
independent, non-author providers if available, otherwise wait until the earliest
time an entire eligible pair is available. Waiting alone consumes no review pair.
Provider pins, effort floors, billing and measured-routing requirements still
apply. Each actual retry consumes the original pair budget.

Legacy waits without provider metadata preserve their original deadlines.
Inventory includes workflow cooldowns observationally. This does not merge goal,
author and reviewer dispatch into one transactional ledger, and a cooldown that
appears during an already reserved pair can still stop that pair at its existing
routing guard. No unknown or blocking failure becomes a cooldown automatically.

## Reviewer replacement within a pair — cycle 058

Before each reviewer call, Relentless checks current eligibility under the saved
policy. It prefers the preselected route; if unavailable, it can select another
permitted provider excluding the author and all reviewers already used in the pair.
This retains completed assessments, records actual routes and uses the existing
pair reservation. It does not retry an inference failure or bypass billing, pins,
reasoning floors or evidence requirements. If no eligible alternative exists, the
report retains partial evidence and the workflow still blocks. Durable partial-pair
waiting is not implemented yet.

## Durable partial reviewer waits — cycle 059

When eligible remaining reviewers are temporarily cooling down, Relentless persists
a `waiting_retry` report and its deadline in the workflow. Restart validates the
exact source checkpoint, review request, routes, findings and attempt provenance
before reusing completed evidence. Only missing reviewers are dispatched; a saved
pair can finish even at the original pair limit. Before dispatch, the workflow
records `reviewing`, preserving the existing ambiguous-operation stop after an
interruption. No policy/auth/unknown inference failure is converted to a partial
wait. Partial reports remain incomplete for cost/time totals; final reports replace
the same slot and retain earlier attempts without double-counting.

A saved deadline is conservative: resume waits until it even if the originating
health source is no longer available. Once due, current eligibility is checked
again. Static route failures remain blocked. This covers a known pre-dispatch
cooldown, not interrupted in-flight inference or resumption of old blocked runs.

## Goal-to-workflow handoff — cycle 060

A goal task can explicitly require a coding workflow instead of a text result:

```json
{
  "kind": "workflow",
  "specificationSha256": "<canonical digest of the parsed execution contract>",
  "reviewTask": {
    "id": "review-parser",
    "prompt": "Review parser correctness and compatibility",
    "minQuality": 1,
    "effort": "low"
  },
  "maxReviewPairs": 2
}
```

Put that object in the task's `acceptance` field. The digest binds the complete
normalized `executionSchema` object using `canonicalDigest`; it is not a hash of
arbitrary JSON file formatting. Existing text acceptance continues unchanged.
Create the goal through the existing goal contract interface, then invoke in Pi:

```text
/relentless goal-work {"goalId":"<goal-id>","taskId":"fix-parser","expectedRevision":1,"files":[{"path":"src/parser.ts","writable":true}]}
```

This snapshots source and creates a recoverable workflow without inference. The
same goal/task key always identifies the same creation intent, independent of
revision. Repeating unchanged input returns the same work; changed input cannot
allocate another attempt budget. Author attempts are capped at the smaller of
five and the goal's saved task limit. Review policy and pair budget come from the
explicit workflow acceptance. Both author and reviewer routes must satisfy the
intersection of goal permissions, Pi project roles and current scope; restrictive
authentication, billing, concurrency and timeout settings are preserved.

The goal's objective, task instructions, constraints and scoped user instructions
become coding requirements. Scoped facts/hypotheses and verified dependency outputs
remain labeled evidence. Expired memories are excluded. Oversized context is
rejected rather than truncated. Dispatch and result consumption revalidate goal
revision, active status, deadline, context and routing restrictions. Revised,
cancelled or expired context blocks old work; automatic revision migration is not
yet implemented. The generic stateless/generic-create paths cannot duplicate
bound goal work. The verification contract is committed with workflow creation,
including when Pi attachment is interrupted.

Source promotion remains explicit and recoverable per file. Its Python mutator
holds goal then coding locks, checks the exact goal reference and deadline before
further publication, and retains those locks after parent death. If interruption
or deadline leaves a captured original, preserve the backup and transaction for
reconciliation; this is not an atomic project update.

After creation use the usual Pi resume/run-verified commands. The text supervisor
never dispatches or completes these workflow tasks. Explicit admission below
completes verified artifacts; the bounded goal scheduler in cycle 064 can invoke
that admission. Continuous DAG execution, revision migration and unified usage
accounting remain unfinished.

## Verified goal artifact admission — cycle 061

Run `/relentless goal-admit <coding-id>` for a goal-bound workflow that has reached
`verified`. This command makes no provider calls, reruns no VM, and changes no
project source files. It inspects the saved execution specification, manifest,
supervisor assessment and report; verifies the final independent review pair;
and binds the result to the exact coding/workflow checkpoints and current goal.

The goal ledger commits the receipt while holding goal, coding and workflow locks
in that order. The receipt includes origin, checkpoint and specification hashes,
file hashes, author attempts, and the original admission time. Identical retries
retain that time and spend no attempts. Conflicting receipts, cancellation,
revision, expired context, changed checkpoints or lost Pi trust reject admission.
The task becomes completed at its current revision; the goal completes only when
all tasks have valid current completion evidence. Dependencies receive a JSON
artifact reference with `sourceApplied: false`, not an instruction or an assertion
that their working tree contains the artifact.

Admitted artifacts remain inspectable and explicitly promotable through their
exact receipt. Resume preserves verified terminal state without dispatch. Current
context and cancellation checks still apply. Revision removes admission evidence
without resetting attempts. Source promotion, automatic DAG scheduling, cumulative
accounting for unfinished coding attempts, and revision migration are separate
from this admission command. A project that requires installation before a
dependent task must perform and verify that explicit step.

## Unfinished goal workflow accounting — cycle 062

Use `/relentless goal-sync <coding-id>` to synchronize a bound workflow's progress
into its goal task. The command reads fresh coding/workflow checkpoints under
goal→coding→workflow locks held through the goal commit. It performs no inference,
VM execution, retry or source write. Cancellation, changed revision/context, lost
trust, conflicting identity, and decreasing cumulative counters reject the sync.

The optional `workflowProgress` record includes coding ID/origin, both checkpoint
hashes, author attempts and limit, review pairs and limit, raw phase/status, separate
coding/workflow retry times, normalized coding failure and workflow reason, and
observation time. Running work remains an observation of running work, not proof
that remote inference stopped. Progress never authorizes a dispatch or completes
a task. Repeated unchanged syncs retain their time and add no event.

`workflowProgress.authorAttempts` and the legacy/admitted task `attempts` describe
the same lineage; do not add them together. Coding journals still enforce attempt
limits. Admission records final progress and completion in one transaction. Goal
revision retains historical progress with its original origin; it does not relabel
that record as current, and migration remains explicit future work.

If interrupted repair left the coding revision ahead of the workflow checkpoint,
resume the workflow to reconcile its saved repair intent before syncing. Sync
rejects inconsistent revisions rather than inferring their relationship. Automatic
scheduling and periodic progress polling remain unfinished.

## Progress collection after Pi execution — cycle 063

Pi `resume` and `run-verified` collect goal progress after the workflow settles,
including a thrown action. The collector checks for an existing bound coding
checkpoint and uses the same fenced synchronization path. Generic workflows do
not create goal ledgers. Status, extension loading and session startup do not
collect or dispatch work.

Collection cannot overwrite the main result or failure. If synchronization fails,
Pi reports that progress is pending; reconcile an interrupted workflow if needed,
then use `goal-sync`. Lost trust or shutdown prevents collection, and the existing
session guard retains command ownership through settlement. Abrupt process death
may leave progress stale; the coding/workflow journals still own all execution
state and budgets. This is collection after foreground execution, not periodic
polling, automatic admission, or a dependency scheduler.

## Bounded goal scheduling — cycle 064

`/relentless goal-step <goal-id>` advances one eligible workflow task through its
next action: coding/review, verification, or verified-artifact admission. Selection
is deterministic in contract order and does not require a scheduler LLM. A single
coding/review action may make multiple calls within the workflow's existing bounds.
The command returns after that action; it does not start a background loop.

Opt a workflow task into scheduling by adding `work` to its existing acceptance:

```json
{
  "work": {
    "files": [{ "path": "src/parser.ts", "writable": true }],
    "verificationFile": "verification.json"
  }
}
```

This fragment belongs inside `acceptance`, alongside `kind: "workflow"`,
`specificationSha256`, `reviewTask` and `maxReviewPairs`. The verification file
contains the full execution specification (`package` and `acceptance`), whose
normalized digest must match `specificationSha256`. Files must include a writable
path and may not repeat paths. Existing manual workflow declarations without
`work` remain valid but are skipped by `goal-step`.

Creation reuses the goal/task identity and original budgets. Cooling, blocked or
running work is skipped so independent eligible tasks can proceed; the returned
`skipped` entries explain waits and include known retry times. The scheduler reads
the authoritative coding/workflow journals and collects progress after settlement.
Policy denials retain their block and do not authorize provider substitution.

A shared supervisor lease prevents concurrent text and coding schedulers. Goal
revision, session trust, deadlines and ownership are rechecked at effects and
publication, including coding validation, review, saved verification recovery and
admission. A killed scheduler leaves a 30-second lease; expiry permits recovery,
not replay of an ambiguous in-flight operation.

Admission records verified artifacts without applying source files. Dependent
coding tasks wait until the admitted dependency file hashes match the project
working tree. Promote source explicitly using the existing reviewed promotion
flow. Continuous wakeups, automatic source integration and revision migration are
still pending; repeatedly invoking this command does not bypass those boundaries.

## Reviewed configuration application — cycle 065

Use `/relentless config-propose <relentless-json>` with the complete proposed `relentless`
namespace. The command validates policy and saves a content-addressed proposal
under `.harness/config-proposals/`; it neither edits settings nor calls a provider.
The proposal retains the old Relentless namespace, normalized new namespace and
hashes of the exact source/target settings bytes. Unrelated setting values are
not copied into the proposal or shown in the dialog.

`/relentless config-apply <proposal-id>` shows the project, source digest and full
before/after namespace through Pi's confirmation UI. Declining, lacking interactive
UI, cancellation, lost trust, changed settings or an invalid proposal prevents
application. Confirmation covers settings only: it does not certify entitlement,
probe models, enable an inference run or migrate frozen workflows. Current
routing/dispatch checks still apply. The skill must also recheck user constraints;
the file transaction itself does not interpret chat or memory changes.

After confirmation, publication uses Pi 0.85.1's cooperative `settings.json.lock`
directory, a bounded synchronous critical section, an fsynced temporary file and
atomic rename. Existing locks are never reclaimed by this command. Ownership and
elapsed time are checked before rename, conservatively below Pi's stale threshold.
Unrelated settings retain their values; JSON formatting is normalized. Editors
that ignore the cooperative lock are outside this serialization guarantee.

If exact target bytes are already present, the command reports `already_matches`
without writing or claiming a new approval. A crash may leave a temporary file or
lock; inspect the owner/process and current settings before recovery, rather than
blindly deleting them. This approval flow protects Relentless's command path, not
arbitrary shell edits by software with the user's filesystem privileges.

## Foreground goal execution — cycle 066

`/relentless goal-run <goal-id>` repeatedly invokes the bounded goal scheduler for
one goal revision. It advances eligible coding/review, verification and admission
without separate commands between stages. Selection and waiting are deterministic;
no local or cloud model is needed to manage the loop itself.

When only temporarily unavailable work remains, the controller waits for the
earliest known coding/reviewer retry or active-worker lease expiry, bounded by
the goal deadline. It checks cancellation, trust, revision and deadline at most
one second apart while waiting, without dispatching inference or writing polling
events. A retry that becomes due during the preceding step is rechecked at once.
Independent eligible tasks still run before a wait. Enabled Alibaba Personal
candidates in either goal or current project policy reject this unattended mode;
explicit bounded foreground trials remain separate.

The loop stops on completion, cancellation, supersession, deadline, trust loss,
revision change or interruption. If no timed retry can resolve the remaining work,
it returns `needs_attention` with the last skipped-task reasons. A repeated action
with unchanged coding/workflow snapshots returns `no_progress`. Policy denials,
ambiguous operations and unapplied dependency sources are not automatically
replayed, bypassed or promoted.

The goal and workflow journals retain progress, retries and original budgets.
After process death, explicitly invoke `goal-run` again in a trusted Pi session;
it recovers from those journals. The run does not install a service or restart
automatically when Pi opens. Its summary's action count is local to the invocation
and is not an inference/billing counter. Use the journal/report counters for usage.

Progress messages appear after scheduler steps, not each timer poll. Shutdown
cancels the foreground controller; existing step fences continue to govern late
results and publication. Source promotion and revision migration remain separate
work, so this is not yet unattended goal-to-integrated-source completion.

## Verified source installation — cycle 068

A workflow task may explicitly set `acceptance.work.integration` to `"verified"`
alongside its existing `files` and `verificationFile` declaration. Both `goal-step`
and foreground `goal-run` then inspect complete independent review and verification
proof, install the candidate under goal/coding/workflow fences and current scheduler
ownership, and admit completion only after observing matching installed source.
Omitting this field, or selecting `"manual"`, retains artifact-only admission.
This setting is task contract permission, not a global automatic deployment switch.

Transactions persist under `.harness/goal-promotions/<coding-id-digest>/<checkpoint>`.
An interruption after installation but before admission can reuse the transaction
without another model call. Admission records installation request/state digests
and reports `sourceApplied: true`. This means installation was observed at admission;
it is not a continuing guarantee against editor changes. A conflicting source edit
prevents admission and is retained. Changed goal or review evidence can invalidate
recovery and require reconciliation rather than silently adopting new authority.

Installation currently supports declared existing files only, with recoverable
per-file changes. It is not an atomic project update or an editor/filesystem sandbox;
keep concurrent editors quiescent during installation. File creation, deletion,
new parent directories, service restart and deployment are outside this path.

## Opted-in Pi session restart — cycle 069

Project configuration can include `"resumeGoal": { "id": "<goal-id>", "revision": 1 }`
inside `relentless`. Prepare and review this through `config-propose`/`config-apply`.
The confirmation explicitly authorizes future trusted Pi session-start execution
within the goal's existing attempt, billing, verification and integration limits.
Applying settings does not itself start execution. Inspect the actual goal and
revision before approving; there is no default opt-in or revision migration.

On startup, resume, new session, fork or reload, Relentless can launch the named goal
asynchronously without blocking Pi startup. Session ownership excludes overlapping
commands, and a prior cancelled run must settle before a successor can run. If it
is still settling, automatic resume reports that condition; it does not force a
second runner or promise a daemon retry. Goal/workflow leases still govern other
processes. No OS service is installed and Pi must be running.

`/relentless pause` remains reachable while busy, aborts this session's work and
suppresses its late notifications. It preserves restart configuration. Pause, then
remove `resumeGoal` through configuration review to disable future starts. Unchanged
settings bytes, the exact goal revision, current trust, session generation and
deadline constrain resumed work at waits and publication boundaries. Settings changes
stop it; quota waits retain their saved times and budgets. Remote cancellation is
not guaranteed by local abort. Independent terminal blockers return for attention.

Automatic source installation also pins the project settings digest in its native
transaction. Revocation after capture prevents replacement publication and retains
the original backup; recovery requires the original authorization and matching
transaction evidence. Installation remains per-file, with small check/write windows,
not a concurrent-editor lock or atomic project update. Older interrupted transactions
without the settings pin require reconciliation if their request no longer matches.

## Active-time calibration routing — cycle 070

Register a new coding calibration with `measurement: "workflow-active-v1"` to
measure summed author, review and verification stage time. After all trials settle,
`calibration-admit` validates the existing proof requirements and preserves failed
or unknown slots. Reference the admitted cohort through `relentless.evidence.calibrations`
and request `optimization.metric: "activeTime"` with its exact suite/workload/cases.
The same samples cannot satisfy latency or cost optimization: those fields remain
unknown. An old cohort cannot be upgraded by changing its measurement declaration.

`calibration-report` exposes `workflowActiveMs` separately from the still-unknown
`workflowElapsedMs` and `workflowEstimatedUsd`. Missing stage telemetry yields null.
Reports alone never authorize ranking. See [measurement semantics](model-efficiency.md#summed-measured-active-time--cycle-070).

### Managed local fallback — cycle079

Optional `routing.managedLocal` now pins and snapshots the local executable, model
and bundled libraries, starts a CPU server per authorized local call, checks
readiness and cleans up the owned process and files. Pi's configuration skill and
exact proposal confirmation cover this permission; it is absent from active
project settings. One real Pi/Qwen call passed in 14.3 seconds with confirmed
cleanup. This is lifecycle evidence, not model qualification or total-cost evidence.
See [configuration, bounds and limitations](local-inference.md#optional-managed-lifecycle--cycle079).

## Creating a goal inside Pi — cycle080

`/relentless goal-create <contract-json>` accepts the goal contract defined by
`src/goal-types.ts`, with the `config` field omitted. It freezes the current
project's `relentless.routing` configuration and preserves the supplied objective,
constraints, memories, task dependencies, acceptance requirements and budgets.
An explicit `config` override is rejected. The command returns `goalId` and
revision 1; it does not dispatch models, install source, change settings or add
restart intent. Missing policy, invalid contracts and inactive project trust fail
before goal creation.

For coding goals, declare workflow acceptance with `work.files`, the prepared
`work.verificationFile`, its `specificationSha256`, independent `reviewTask` and
`maxReviewPairs`. Existing-file installation additionally requires explicit
`work.integration: "verified"`. Then use `/relentless goal-step <goal-id>` for one
bounded action or `/relentless goal-run <goal-id>` for the foreground workflow loop.
Those execution commands retain their current billing, scope and verification
checks. The Pi loop handles declared workflow tasks; creating a JSON/contains
advice goal does not make that loop support tool-free tasks.

Creation removes the separate CLI registration step. Preparing the verification
specification and a representative complete project run remain necessary; this
command alone is not a natural-language project planner or end-to-end proof.

## Inspecting goal progress — cycle087

`/relentless goal-status <goal-id>` reports the saved objective, revision and task
statuses alongside each associated coding run. `goalRecordedAttempts` comes from
the goal ledger; `work[].authorAttempts` comes from the coding journal and can be
higher before progress synchronization or admission. Older goal revisions are
explicitly labeled and their budgets are not combined. Bounded failure diagnostics
include `outputReason` when recorded. Source text and model prompts are omitted.

This is a read-only observation, not an atomic snapshot across journals, a progress
synchronization or a retry action. `work[].retryAt` covers coding retries. Each
work item now also includes `workflow`: the recorded phase, blocking reason,
review pairs used/maximum, workflow retry deadline and `currentCodingRevision`.
Missing workflow files or rows produce `null`; corruption is an error. A completed
goal can retain `codingStatus: "ready_for_review"` for its immutable candidate
while `workflow.phase` is `verified`. The goal/task status reports completion;
the workflow summary explains its recorded stage. It does not revalidate proof or
installation, and a stale coding revision must not be read as current acceptance.
The command uses the existing
Pi session command queue and cannot inspect while another command holds that slot.
It rejects corrupt journals and projects with more than1,000 coding runs instead
of silently truncating. Missing goals do not initialize databases.

## Session model inventory — cycle088

`/relentless inventory` uses the active Pi registry rather than constructing the
CLI's separate registry. Configured rows distinguish catalog presence, Pi available
model presence, project role membership, permitted role pools, billing permission
and future provider cooldowns. Available models absent from project policy appear
as `unconfiguredAvailable`; they are not automatically enabled. Role pools reuse
the existing Pi scope/effort/billing/cooldown filters. They do not apply a specific
task's quality floor, provider/model pin or evidence optimization requirements.

Capacity and capability remain unverified by this read. Availability is not proof
of entitlement, remaining quota or local server readiness. No credentials are
printed, provider probes run, servers started or evidence invented. The command
requires trusted session models; missing Relentless policy is supported for initial
discovery. Unknown catalog input remains null for non-native callers. Health is a
non-atomic read across existing journals.
It uses the same busy command queue as other Pi commands.

Inventory and the configuration-proposal tool also return `reviewCoverage` for
the current eligible role pools. `byAuthor` counts unique reviewer providers after
excluding each coder's provider. `allEligibleAuthors` excludes the union of current
eligible coder providers, showing whether that prospective recovery pool retains
two independent reviewer providers. No eligible authors means insufficient
coverage. Billing, scope, availability, supported effort and cooldown filtering
reuse the role-routing logic. This is advisory provider-count coverage, not
task-specific routing, verified capability, quota or a check of historical authors.
Runtime review routing still excludes every provider in actual author history.
Proposal coverage is returned as current advice; it is not stored in the proposal
or included in its digest and is not approval to dispatch.

The unconfigured discovery list is paginated in groups of20. Use
`/relentless inventory 20` (or the reported `nextOffset`) to continue. Responses
include the total, current offset and null continuation on the final page. All
configured models remain visible. Pages are independent observations, so changes
to the live catalog can shift entries between reads. This pagination was added
after a real terminal run exposed hundreds of unconfigured model entries.

### Explain evidence without dispatch

`/relentless explain <role> <task-json>` requires an explicit task `optimization`
policy and uses the same configured/admitted evidence as route preview. It reports
matching samples, per-case success rates and confidence bounds, qualification
and exclusion codes. Scores remain null for unqualified routes. Normal Pi scope,
project roles, cooldowns, task pins, reasoning floors and billing permissions
filter candidates first; zero eligible routes describes policy/availability, not
measured inability. No provider calls or settings changes occur. This explains
evidence for the declared workload/suite, not general model competence or quota.

### Resume after reviewer login repair

`/relentless review-auth-status <coding-id>` reads the current workflow digest and
review budget. After repairing login, explicitly use
`/relentless review-auth-retry <coding-id> <workflow-digest>` to reopen an eligible
authentication failure from reviewer setup. This changes only saved workflow
state; use the normal goal-step/resume command afterward. It does not refresh
credentials, dispatch a model or reset attempts. See
[eligibility and boundaries](recovery.md#explicit-reviewer-authentication-recovery).

## Declaring a new source file

Pi coding and goal-work file manifests accept `create: true` on a writable path.
For example, `{"path":"src/new.ts","writable":true,"create":true}` requires the
file to be absent and its parent to exist. It does not create a source placeholder
when the goal is registered or snapshotted. The frozen original is null, authoring
uses a private workspace, and verified installation refuses a concurrent new file.
Omit `create` for existing inputs. Read-only creation, undeclared files, deletion
and new parent-directory creation are not supported. Goal installation still
requires independent reviews and the exact pinned verification proof.

## Preview evidence under a proposed configuration

After `/relentless config-propose <relentless-json>` saves a proposal, use:

```text
/relentless explain-proposal <proposal-id> <role> <task-json-with-optimization>
```

This reads the proposal's roles, billing policy and evidence references, revalidates
admitted evidence, and intersects candidate eligibility with the current Pi session
and recorded health. It lists qualification reasons and scores for permitted
model/effort combinations. The result is explicitly `proposed: true`,
`configured: false` and `dispatched: false`; it does not approve or apply settings,
start workers, refresh credentials or establish remaining quota. Stale settings,
wrong project roots and changed proposals are rejected before display. Existing
`/relentless config-apply <proposal-id>` still requires Pi's configuration confirmation.

The command must be registered by the installed Relentless package. The SDK diagnostic
now checks registration before exposing its terminal: an earlier misconfigured
launcher lacked the package and Pi treated slash text as a chat request. See
cycle106 validation for that retained setup failure and successful read-only run.

## Configure provider coverage

Inventory and proposal results include an unpaginated `providerCoverage` summary
with distinct available/configured model counts and omitted-available counts.
Configured includes disabled candidates; counts do not assert quota, billing or
eligibility. The configure skill must account for each requested provider/model,
including frontier escalation routes, and explain exclusions. Native CLI adapters
are listed separately with their current [routing limitations](native-workers.md).

Standalone Pi may have a newer catalog than the bundled worker SDK. Workers now
add `xai/grok-4.7` when absent, preserving the existing Grok4.6 transport/auth and
older pins. An existing Grok4.7 entry always wins. Metadata follows the official
[Grok4.7 model page](https://docs.x.ai/developers/models/grok-4.7):500k context,
low/medium/high/xhigh efforts and API list pricing. Output is conservatively capped
at8192 tokens; list pricing is not evidence of subscription entitlement or cost.
