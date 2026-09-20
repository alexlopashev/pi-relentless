# Bounded coding workers

`relentless code` performs a user-initiated coding run: snapshot explicitly named files → ask the selected model for replacements → validate the entire edit batch → apply it to a private copy → check syntax → feed failed checks back, within an attempt limit → save a review candidate. The original project is never modified. This is implemented; unrestricted shell agents and automatic integration are not.

```sh
mise exec -- pnpm build
mise exec -- node dist/cli.js code examples/personal.config.json coding.json
```

Use an existing provider config with an available route. Each call uses the process worker and existing authentication, billing, provider, quality and effort restrictions. It does not silently substitute a provider or grant metered access. Native adapters retain their existing restrictions. Pi inference remains tool-free: the host coding loop performs only validated edits. This allows the same edit protocol across providers without granting model-generated commands shell access.

A `coding.json` example:

```json
{
  "sourceRoot": "/absolute/path/to/project",
  "task": {
    "id": "repair-parser",
    "prompt": "Repair the syntax error in parser.ts, preserving its API.",
    "minQuality": 1,
    "effort": "low"
  },
  "files": [
    { "path": "src/parser.ts", "writable": true },
    { "path": "README.md", "writable": false }
  ],
  "maxAttempts": 3
}
```

Only existing, explicitly listed UTF-8 regular files are read. Paths must be relative, with no hidden components, traversal or symbolic links. Inputs are limited to 20 files, 32 KiB per file and 128 KiB total. Keep secrets out of the explicit input list: these contents are sent to the selected model. This is not an automatic secret scanner or a sandbox against another hostile process running as the same OS user.

The host accepts strict JSON full-file replacements, validates all paths and sizes before applying any edit, and rejects duplicate or unauthorized paths. Models cannot add files, delete files, alter permissions, invoke tools or change the run contract. Read-only context is never writable through the protocol. Each run gets its own private temporary workspace.

## Checks and outcomes

Every writable file receives a fixed check:

- JavaScript (`.js`, `.mjs`, `.cjs`): `node --check`, with an empty environment, bounded time and output, and no shell.
- TypeScript (`.ts`, `.mts`, `.cts`): Node's type transformation followed by the same syntax check; `.ts`/`.mts` use module syntax, `.cts` uses CommonJS syntax. This is not TypeScript type checking or a project compiler configuration.
- JSON: host JSON parsing.

None of these checks executes project code. Model-generated scripts, package-manager lifecycle hooks, network commands and arbitrary test runners are unavailable. The current Codex environment rejects nested macOS sandbox creation, and a dedicated Colima/VZ probe failed with virtualization unavailable. See [execution isolation evidence](execution-isolation.md); behavioral execution awaits a verified backend. A Git worktree alone would not enforce it.

`ready_for_review` means a nonempty change passed these syntax checks. It does **not** mean the goal is satisfied, behavior is correct, a reviewer approved it or the patch was integrated. `exhausted` means the bounded edit/check loop did not pass. `blocked` records a provider failure, invalid edit batch or unchanged result. Provider failures are classified and stop this run; no refusal, approval or authentication block is bypassed.

The CLI prints the artifact directory. It contains the request and route, baseline checks, pre-dispatch intent, per-attempt snapshots/checks, final status, and `changes.json` with full before/after text and SHA-256 hashes. These files allow review against the exact original snapshot. Any future application must verify the original hashes first. The host does not automatically apply them. Temporary artifacts can be removed by OS cleanup; copy a run directory to project evidence storage if it must be retained.

## Durable coding commands

The separate durable path stores authoritative coding state in `.harness/coding.sqlite`:

```sh
mise exec -- node dist/cli.js coding create examples/personal.config.json coding.json
mise exec -- node dist/cli.js coding resume <returned-run-id>
mise exec -- node dist/cli.js coding status <returned-run-id>
mise exec -- node dist/cli.js coding cancel <returned-run-id>
```

`create` freezes the explicit source snapshot, request, routing configuration and maximum attempts; it performs no inference. `resume` acquires a 30-second lease, commits the consumed attempt before dispatch, renews the lease while working, and transactionally saves checked replacement text. An interrupted attempt remains consumed. Another process may resume after lease expiry; the old owner's epoch can no longer commit. Remote cancellation is requested, but remote inference may continue after local termination. Workers have no tools or source-writing authority.

Only committed edits survive a crash; an interrupted, uncommitted response may be discarded. Reopening preserves original and current text, read-only boundaries and cumulative attempt count. Checks run against the frozen copy, so later edits in the source project do not silently change the run. Any future application still needs original-hash checks. Multiple resumes cannot publish different authoritative patches under the same attempt.

Every resume exports a private temporary workspace and hashed changes from one authoritative checkpoint snapshot, including terminal runs. Thus a crash between checkpoint commit and export does not lose the deliverable. Temporary exports can be reconstructed; preserve the SQLite journal and its active WAL together. This coding journal does not yet expose the goal ledger's backup/restore commands. Checksums detect accidental inconsistency, not malicious edits by the same OS user.

The durable coding loop records normalized failure kinds and issued-attempt provenance. Retryable quota, outage, unavailable-model, session, context, timeout and interrupted failures cool down that provider within the run. It can immediately select another configured eligible provider; otherwise it persists `waiting_retry` and its timestamp. `resume` before that timestamp performs no inference and spends no attempt. Backoff starts at 30 seconds, doubles with consumed attempts, and honors a longer provider `Retry-After`. The CLI reports `retryAt` and the historical `lastFailure`.

Fallback preserves enabled candidates, billing permission, quality/effort floors, optional `task.provider`, optional exact `task.model`, and requested capability evidence. A pinned model waits rather than changing. Missing or expired evidence blocks the requested optimized route. Cooldowns currently belong to this coding run; they are not shared with other coding runs or the goal ledger inspected by `inventory`.

Policy, permission, authentication, approval and unknown failures remain blocked. A blocking failure received from an identifiable prior attempt can also revoke a replacement lease; stale workers still cannot publish edits or add retryable cooldowns. Cancellation reaches Pi. A bounded cleanup checks prompt errors and final messages before deciding whether retry is permitted; unconfirmed local settlement blocks the run. None of this proves that remote inference stopped billing.

Blocked and exhausted runs cannot reset their budget through `resume`. Source manifests, routing authority and budgets remain immutable; explicit prompt revisions are supported below. Autonomous scheduling remains future work. A `ready_for_review` patch has passed syntax checks and any explicitly requested export-name checks; behavior remains unverified.

## Cancellation

`coding cancel <id>` records a terminal user cancellation and its timestamp, revokes the active lease and clears the retry timestamp. Repeated cancellation keeps the first timestamp. Snapshots, committed edits, attempt counts, cooldowns and failure history remain intact. A running worker observes the revoked lease at its next heartbeat (normally within one second), requests cancellation and cannot commit a late patch. Local cancellation does not prove remote inference or billing stopped immediately.

Cancelled runs cannot dispatch or resume work. `resume` may still reconstruct their historical artifacts, explicitly labeled `cancelled`; it spends no additional attempt. Cancelling an existing review candidate invalidates its current run status but does not delete previously exported historical copies. Late identifiable blocking provider failures remain recorded without replacing the cancelled status. The CLI reports `cancelledAt` alongside status. There is no uncancel or budget-reset command.

## Current limits

The legacy `code` command remains temporary and non-resumable. The new `coding` commands provide transactional coding recovery but are separate from the goal scheduler. Neither automatically requests review, runs behavioral project tests, integrates patches, or installs a background service.

Next: health sharing with goal scheduling and broader revisioned constraints, independent exact-revision review, behavioral checks under enforced isolation, and hash-checked integration. Arbitrary project execution is still unavailable in this environment.

## Explicit instruction revisions

Create an update file with `{"expectedRevision":1,"prompt":"Complete replacement task instructions"}`, then run:

```sh
mise exec -- node dist/cli.js coding revise <id> <update.json>
```

This local user command replaces the prompt and retains the previous prompt with its revision and update timestamp. Include all still-applicable instructions in the replacement. Stale revision numbers fail atomically. The journal retains up to 100 updates; older checkpoints load at revision 1.

Updates preserve source snapshots, committed edits, provider/model/billing/effort policy, failure history, cooldowns and consumed attempts. Revising a review candidate invalidates its ready-for-review state; it becomes ready only if budget remains, otherwise exhausted. Blocked/exhausted runs remain blocked/exhausted. Waiting runs keep their retry timestamp. Running attempts (including expired leases) and cancelled runs reject updates; expiry alone cannot prove inference stopped. This is not yet live steering, automatic memory ingestion or permission-policy editing.

Status includes the latest `revision`. Resume exports and its returned `artifactRevision` identify the snapshot used for that artifact separately; subsequent updates can make it stale. No artifact may be promoted based only on its historical ready-for-review status. Automatic promotion is not implemented.

## Shared coding-provider cooldowns

Coding runs in the same project journal now consult the maximum recorded cooldown for each provider before dispatch. Reads and dispatch decisions occur in the same SQLite write transaction. A quota/outage observed by one run therefore prevents another run from immediately repeating the call. Existing persisted run records supply this evidence, including records retained after cancellation; no new mutable health table or migration is needed.

A newly waiting run consumes zero attempts. At the recorded retry time, dispatch rechecks current health and all existing route constraints. Explicit model/provider pins, billing permission and effort floors still apply. Already-issued work is not retroactively cancelled. Failures from stale attempts cannot add retryable cooldowns, while existing blocking-failure handling remains unchanged.

Sharing is limited to this project's coding journal and conservatively covers all models/billing routes under the recorded provider name. Separate projects and the tool-free goal ledger remain independent for dispatch; `inventory` reports the maximum cooldown recorded in either local ledger. The implementation scans validated run records and retains the longest expiry; large histories will eventually need an indexed projection with equivalent integrity and transaction guarantees.

## Required interface declarations

A writable file can declare `"requiredExports": ["CodingJournal"]` in its request manifest. Supported extensions are `.js`, `.mjs`, `.ts` and `.mts`; these contracts describe ES module declarations. CommonJS files, JSON and read-only files reject this option before inference. Export lists are nonempty, unique and limited to 100 names.

Both coding runners include the constraint in worker context and use a host AST check after each edit. Missing names appear in check feedback and consume the normal bounded repair attempts. Durable checkpoints retain the requirement; prompt revisions cannot remove it. No requirements are inferred automatically, so a task that legitimately renames an interface must declare its intended names when created.

The checker erases TypeScript-only declarations, then reads explicit export declarations, aliases and namespace exports without executing code or resolving imports. Comments and strings cannot satisfy it. Wildcard exports cannot establish a particular name. Explicit reexports count as declarations, but the referenced module and runtime value are not verified. Empty or incorrect implementations can still pass: this is an interface-presence guard, not type checking, behavioral testing or approval to integrate.

The pinned TypeScript 6.0.2 parser is now a runtime dependency; its version did not change.

## Independent model review

Run `coding review <id> <review.json>` on a saved `ready_for_review` candidate. The review request contains `config` (the usual explicit provider/billing configuration) and `task` (review prompt, minimum tier, effort and optional route/evidence restrictions). This is a separate, explicitly authorized inference operation.

Both reviewer routes are selected before any inference. They must use two distinct configured provider identifiers, excluding every provider in the coding run's dispatch history. Incomplete historical author provenance fails closed. Hard model/provider pins, billing limits, effort floors, evidence requirements and recorded coding cooldowns remain in force. Aliases and resellers can share underlying models; distinct configured provider identifiers do not establish statistical independence.

Reviewers run serially in separate worker processes, receive the same before/after files and saved requirements, and do not receive one another's findings. Each response must have a consistent verdict and at most 20 structured findings referencing known proposed files and valid line numbers. Findings remain untrusted model assessments, not executable instructions.

The report records the coding revision, full checkpoint hash, reviewer routes and assessments. Any intervening checkpoint change yields `stale`. Invalid output, provider failure, a newly unavailable selected route or deadline yields `failed` and stops further dispatch. Deadline cancellation requests local worker termination but cannot prove remote inference or billing stopped.

The CLI saves private request/report artifacts under `.harness/reviews/` and returns `reviewStatus` separately from coding status. `reviewed` means both models reported no findings on that historical checkpoint; it does not prove correctness or authorize integration. `findings` means at least one model requested changes. Coding state and sources remain unchanged. Future integration must recheck the hash against current state.

Standalone `coding review` is not resumable: an explicitly repeated command starts new inference. The persisted workflow below reserves review budgets and coordinates repairs. Scheduled wakeups, isolated behavioral verification and promotion remain pending.

### Supply the actual project policy

Reviewers only see the frozen manifest/files, saved task prompt and explicit review-task prompt. They do not automatically load `AGENTS.md`, compiler configuration, dependency declarations or files outside that manifest. Include relevant policy/configuration as read-only coding inputs, or state the acceptance settings explicitly in the review request. For this repository, `strict: true` alone is insufficient context: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are also required.

A live review of the cycle-012 parser proposal illustrated the gap: Qwen3.8 Flash and Muse Contributor both reported no findings, while a fixed compiler check with `noUncheckedIndexedAccess` rejected an unchecked indexed access. The review packet omitted that option. The working-tree correction passes the same compiler check. This is not a valid general model ranking; it demonstrates why explicit project context and deterministic verification remain required.

## Versioned project requirements and facts

Coding requests may include a `context` object with `requirements` and `facts` string arrays. Requirements are explicit task acceptance policy; facts are background data, labeled as not instructions. Each array allows up to 32 nonempty entries of 2,000 characters, and the serialized context is limited to 32 KiB. Context has no fields for billing, tools, model selection or writable paths.

Both coding runners and independent reviewers receive this same saved context. It participates in checkpoint hashing. `coding revise` accepts an optional complete replacement `context`; omission preserves the current value, and supplying empty arrays explicitly clears it. History retains the prior context with the prior prompt. Existing revision checks, live-worker rejection, review invalidation, terminal blockers and cumulative attempt limits still apply.

For example, save compiler settings such as `noUncheckedIndexedAccess` as requirements and the installed toolchain version as facts. This is explicit context supplied by the authorized caller; automatic ingestion of project files, sessions or chat history is not implemented. Retrieved text and worker findings cannot change routing authority through this field.

Failed review reports now identify the selected route and stage (routing, inference or response validation). Local deadlines use `timeout`; schema-invalid responses use `invalid_output`. Provider failures retain normalized codes. No raw provider errors or invalid model output are stored. These diagnostics do not enable automatic retry.

## Persisted coding and review workflow

Create a workflow for an existing coding run with `relentless workflow create <coding-id> <workflow.json>`, then use `relentless workflow resume <coding-id>` and `relentless workflow status <coding-id>`. The strict JSON file contains `review` (the same task/config object accepted by coding review) and an explicit `maxReviewPairs` between 1 and 5. Creation makes no inference calls. Resume uses the saved coding and reviewer configurations, preserving their billing permissions and effort constraints.

A resume advances coding, two-provider review, and repairs from structured findings within the original cumulative coding budget and reserved review-pair budget. SQLite checkpoints preserve requirements, reports, repair intent and quota retry times. External revisions block the workflow; a changed candidate invalidates its verification handoff. Artifact references retain the latest 20 projections; older projection directories are not deleted.

An interrupted review becomes `blocked` with `ambiguous_review`; its reserved pair is not refunded or replayed automatically. A coding repair committed just before a crash is reconciled without creating another revision. Existing damaged or schema-missing workflow databases fail closed. The foreground `workflow run` command below can wait for coding retries; there is no installed workflow service or operator reconciliation command yet.

`verification_required` means the exact candidate has two no-findings assessments and awaits deterministic behavioral verification. It does not mean goal completion, integration or permission to execute generated code. Resume returns a nonzero exit status for waiting/blocked outcomes. This workflow has offline end-to-end and process-crash coverage. Cycle 016 exercised live review of an existing Codex-authored candidate with Qwen and Muse, reaching a persisted verification handoff. The live repair branch and isolated behavioral acceptance have not yet been demonstrated.

### Review execution telemetry

New review reports include `attempts` with the exact route, monotonic `elapsedMs`, outcome (`assessed`, `failed`, or `stale`) and normalized failure code when applicable. Timing spans dispatch through local response validation; it is not provider-only inference time. Preflight failures do not create attempt records. `assessed` means a valid assessment was returned, including assessments requesting changes; it is not correctness acceptance.

`estimatedUsd` carries an available positive finite Pi estimate for explicitly metered routes through validated worker IPC. It remains null for subscriptions, native workers and missing usage. It is an estimate, not settled billing; subscription charges must not be inferred as zero. A failed assessment retains an estimate already received. A timeout may end observation before usage arrives, and late callbacks cannot alter a completed report. Telemetry observer failures cannot overwrite provider denials or interruption. These execution records are not automatically promoted to capability observations: verified task acceptance and comparable workload evidence remain necessary. Historical reports are not backfilled.

## Run a workflow until it settles

Use `mise exec -- node dist/cli.js workflow run <coding-id>` to keep a local foreground process waiting for persisted coding retry times. It resumes sequentially, preserves coding/review budgets, and exits on `blocked` or `verification_required`. Long waits use cancellable chunks without resuming before the due time. No model is needed merely to schedule a retry.

SIGINT/SIGTERM abort local workers and stop new reservations. Coding shutdown preserves its resumable phase, remaining attempt budget and retry state; another run can continue it. A terminal provider denial remains terminal. Interrupted reviews can remain blocked and require reconciliation; shutdown is not evidence that remote inference or billing stopped. Signals are not equivalent to the explicit terminal `coding cancel` command.

Configurations with any enabled Alibaba Personal route are rejected before unattended work: those subscriptions remain restricted here to bounded interactive operations. Saved metered permissions still apply to other routes. This command installs no background service, performs no deployment and stops before behavioral verification or integration.

## Packaging reviewed candidates

`workflow package <coding-id> <specification.json> <new-directory>` packages the exact reviewed journal checkpoint with operator-supplied pinned tests/runtime. It rejects stale candidates and checks the journal again after packaging. The workflow remains `verification_required`; VM execution and acceptance are separate. See [checkpoint binding and commands](execution-isolation.md#binding-a-reviewed-coding-checkpoint--cycle-026).

`workflow verify <coding-id> <execution.json> <new-directory>` now combines packaging and isolated execution, then assesses a mandatory predeclared process-exit rule. It records accepted/failed evidence, while the workflow stays `verification_required`. Automatic repair and promotion are not yet connected. See [declared-rule verification](execution-isolation.md#declared-rule-workflow-verification--cycle-027).

Cycle 028 connects those assessments: success persists `verified`, genuine test failure enters budget-preserving repair, and execution interruption remains `verification_required`. `workflow reconcile-verification <coding-id> <directory>` recovers a completed assessment without rerunning the VM. See [durable outcome semantics](execution-isolation.md#durable-workflow-outcomes-and-reconciliation--cycle-028).

## Cycle 029: recoverable source promotion

Explicit `workflow promote` now revalidates verified evidence and installs the
frozen candidate with a writer-owned checkpoint fence, retained originals and
recoverable staging. The live repository check rejected changed review context
without modifying either tracked file. See [the command contract and limitations](source-promotion.md).
Automatic goal-to-promotion orchestration remains unfinished.

## Ambiguous expired dispatches — cycle 033

An expired running lease now becomes `ambiguous` when resume attempts to acquire
it. Expiry revokes publication authority; it does not establish remote inference
termination. The transaction clears the lease, keeps the consumed attempt and
issued dispatch provenance, and performs no model selection or replacement call.
This occurs before attempt-exhaustion handling, including on the final attempt.
Subsequent resumes preserve ambiguity without spinning or spending another call.
The workflow layer records a blocked `ambiguous` outcome.

Known completed retry outcomes still permit the existing bounded retry logic.
Late retryable failures and stale successful edits cannot clear ambiguity. A late
blocking denial from an issued attempt remains authoritative and changes the run
to blocked. Source snapshots, billing permissions and original attempt budgets
remain intact. Legacy running checkpoints also become ambiguous without inventing
missing historical provenance.

Reconciliation is not implemented yet: ambiguous work cannot currently resume
inference in place. It needs trustworthy outcome evidence or a separately designed,
explicit retry decision; editing a prompt, waiting longer or switching a model is
not treated as proof that the prior dispatch stopped. Do not describe this as a
fully self-recovering goal loop.

## Targeted edits — cycle 034

Both coding runners now include each current file's SHA-256 in the worker context.
Workers may return the existing whole-file `{path, content}` form or a targeted
edit with `path`, `baseSha256` and a `replacements` array. Each replacement contains
`oldText` and `newText`; the worker copies the supplied hash rather than computing
or guessing it. Targeted edits reduce reply size for small changes in large files.

The host verifies the exact source hash, requires each old text span to occur once
in the original snapshot (including overlapping occurrences), rejects overlapping
spans and applies all replacements against that same snapshot. Newly inserted text
cannot become a later match. File paths must be unique, pre-existing and writable;
forms cannot be mixed within one file edit. Every edit is validated and normalized
before private-workspace writes begin. Existing syntax/export checks, journal
fencing, independent review and behavioral verification still apply.

Limits remain 64 KiB replies, 20 files, 32 KiB UTF-8 per resulting file and 128 KiB
for the resulting source snapshot. Targeted edits allow at most 50 replacements
per file; individual old/new text is bounded, old text is nonempty, and NULs are
rejected. Full replacements remain compatible. There is no fuzzy matching,
arbitrary patch command or source-project mutation here. Explicitly declared
new files use the creation boundary described below.

The live fixed-case probe changed one line in a 23,468-byte source file with a
290-byte targeted reply in one attempt. Its entire candidate matched the host's
expected file and the source stayed untouched. This verifies that particular edit
case; it is not broad capability calibration or permission to skip review.

## Durable attempt measurements — cycle 039

New durable coding attempts persist optional execution measurements with the same
transaction as their accepted finish/failure transition: committed dispatch epoch,
candidate, effort, completion time, observed elapsed milliseconds and available
metered USD estimate. Elapsed time covers local preparation, inference, output
validation and bounded cleanup; it is not pure provider latency or time to verified
acceptance. Missing measurements remain missing. Legacy snapshots retain their
serialized shape and checkpoint hashes; historical timing/cost is not backfilled.

Only the current unexpired coding lease can append a measurement. Stale successful
results cannot publish one; an identifiable late blocking denial can still block
work without appending or rewriting timing/cost. Each epoch has at most one row.
Clock failures or invalid telemetry do not change the task outcome. The collector
closes once, ignores late callbacks and preserves a fresh copy of its settled data.

Positive metered estimates are taken from the provider/Pi usage callback. Unknown,
subscription and local cost stay null; catalog estimates are not invoices or hard
spending caps. A timeout can end observation before remote usage becomes available.
The observed interval does not prove remote inference termination or final cost.

Measurements are **not capability observations**. `ready_for_review` establishes
only the existing edit/syntax/export checks. Joining a complete coding/review/VM
outcome to a declared benchmark case, retaining failed attempts and avoiding
multi-author credit assignment are still required before routing can learn from
these coding runs. No automatic ranking, role promotion or spend permission is
introduced by these records.

## Measured candidate through review and VM verification — cycle 040

The cycle 039 Muse addition proposal completed the existing workflow end to end.
The saved measured candidate underwent one independent review pair: GPT-5.6 Luna
and Qwen3.8 Flash, both distinct from the Meta author. Both reported no findings.
No coding retry or extra author call was made.

The pinned offline VM first ran the original subtraction source against the fixed
acceptance test and failed on `sum(2,3)`: -1 instead of 5. The exact reviewed candidate
then passed seven input pairs in both argument orders, plus NaN and infinity, with
a separate non-root guest UID assertion. Both runs used identical test/runtime
pins. A host comparison also checked that only the intended operator changed and
that the source project stayed untouched.

Workflow `ea650f02-d047-4ccd-b3e7-6653fc6d37aa` is now `verified` for its declared
exit-zero criterion. Saved-evidence reconciliation revalidated the same receipt
without rerunning inference or the VM. The evidence connects the author measurement,
review checkpoint and behavioral result through the exact coding snapshot hash.
It does not prove arbitrary software correctness or independent test adequacy.

This was a retrospective single-case integration pilot: the tests were pinned
before VM execution, but were not declared as a benchmark cohort before the author
call. `pilot-proof.json` explicitly marks it ineligible for model ranking. A proper
coding calibration path still needs predeclared cases/runtime/tests, complete
success and failure accounting, trial attribution and comparable latency/cost
semantics. Source promotion was not performed.

## Structured review-validation diagnostics — cycle 048

Future invalid-review reports retain `failure: "invalid_output"` and additionally
record `validationFailure` at report and failed-attempt level. Its closed values
are `output_too_large`, `invalid_json`, `invalid_schema`, `unknown_file`, and
`line_out_of_range`. These distinguish response-format/schema defects from stale
file references without persisting raw output, schema errors, filenames or finding
text in the error. Valid findings remain subject to their existing bounded report
format. Provider quota, timeout and other inference failures carry no validation
code.

Strict acceptance is unchanged: no code-fence stripping, guessed JSON, repaired
paths or silent retry. The detail survives workflow restart; the blocked workflow
still makes no further calls. Existing reports lack the optional field, and the
frozen live pilot's generic invalid-output failures cannot be classified
retroactively because their raw responses were intentionally not retained.

## Goal-bound work

Pi's `goal-work` command projects an explicit workflow goal task into the existing
coding journal. Requirements, evidence and origin hashes persist with the request;
changing goal revision, cancellation, deadline or applicable memory context
prevents further use. Generic creation cannot mint a second budget for the same
bound goal task. See [Pi goal handoff](pi-package.md#goal-to-workflow-handoff--cycle-060)
for the supported boundary. Explicit `goal-admit` validates the full evidence chain
and completes the goal task; it does not install source changes.

## Explicit new-file declarations

A writable manifest entry may specify `create: true` when the target must be
absent: `{"path":"src/new.ts","writable":true,"create":true}`. Omit `create`
for an existing input. The source root and parent directories must already exist;
symlinks and any existing target, including an empty file, are rejected before
inference. A read-only entry cannot authorize creation.

The durable original is `null`, distinct from an empty existing file. Only the
private coding workspace receives an empty initial projection. Prompts explicitly
permit declared new paths; syntax and required-export checks apply normally.
Changes artifacts retain `before: null` and `beforeSha256: null`. Review receives
the null original alongside the candidate. The source project is not modified
by snapshotting or authoring.

Verified promotion uses the absent-original installer and refuses a target that
appeared meanwhile; it never treats matching content as permission to replace it.
Existing files retain their previous behavior. Calibration cases can pin a new
file with `sourceHashes[path]: null`; that pin must exactly match `create: true`,
and participates in the suite identity. Deletions, undeclared paths and creation
of parent directories remain unsupported.
