# Project acceptance evidence

## Cycle081: dependent local dispatcher

A fresh project in `.harness/self-improve-081/project` completed a declared goal
through Clanker's real Pi command handler. The entry script called `clankerCommand`
with an explicit trusted project and the authenticated Pi model registry; this
was an API-level integration exercise, not an interactive Pi UI session.

The first task implemented job graph validation. The second depended on its
verified installation and implemented retry-aware selection with a running-job
capacity limit. Both started as throwing stubs. Independent preflight review
added completed-job cycle and frozen diamond cases before model dispatch. The
saved goal was revised from 1 to 2, preserving zero attempts and its history.

Six explicit `goal-step` invocations advanced coding/review, isolated verification
and admission for each task. Every invocation used a fresh process. The graph
was installed before the dependent task began; that task received graph.ts as
read-only. Existing-file promotion used the goal's explicit verified integration
permission. The outer assistant did not copy model output into the project.

The goal ledger reports both tasks completed at revision 2, one author attempt
each. Each candidate passed Qwen and Muse reviews and an isolated VM test run.
Two separate baseline VM tests rejected the unfinished stubs. Actual use was two
Luna author calls and four reviewer calls, within four/eight declared maxima.
The known partial review charge was $0.0006405; total workflow cost remains
unknown because subscription and other costs were not measured as a total.

Evidence is retained under `.harness/self-improve-081/`: `contract-v2.json`,
`bounds.json`, `status.json`, `final-admission.json`, `analysis.json`, six step
logs, two workflow snapshots and baseline VM reports. Do not rerun preparation
or mutate this completed goal to manufacture a different result.

This proves a bounded dependent-project path across three providers, including
verification and installation. Separate process invocations prove ordinary
checkpoint continuation, not abrupt crash recovery. Neither candidate required
feedback-driven repair; no outage or SIGKILL was injected. It does not establish
general model superiority, optimal routing, interactive usability, or larger
project completion. Alibaba Personal was used only in explicit foreground steps;
the unattended runner remains disallowed for that provider.

## Next acceptance work

Use a separately declared recovery exercise with failures identified as injected,
retaining budgets and immutable verification requirements. Demonstrate a failed
candidate followed by feedback repair, retryable provider unavailability and an
abrupt restart. Preserve policy denials and explicit model/reasoning/billing
constraints. Then exercise installation and goal execution in the actual Pi UI.

## Cycle082: crash, cooldown and failed repair

A fresh one-task recovery goal retained the dispatch contract and verified graph
from cycle081. A test-only worker driver supplied an intentionally defective
first candidate and an `outage` on attempt two. Both synthetic events consumed
the real coding budget. Qwen and Muse independently requested changes on the
first candidate. The workflow revised its coding prompt with their findings,
recorded the outage and saved a retry deadline before returning.

The driver then SIGKILLed its controller at that durable checkpoint (exit 137).
No local review process call remained active; this is not proof of remote-provider
termination. An immediate fresh-process attempt failed on the unexpired goal
lease. After lease expiry, another invocation returned idle until the original
cooldown elapsed, retaining two consumed attempts and all feedback. A third
invocation after the deadline dispatched Luna with the revised repair prompt.

That final real author call failed with `unknown` at `coding_output`. The saved
stage does not distinguish malformed JSON, an invalid edit shape, forbidden paths,
or failed targeted replacements; its specific cause was not recorded. The budget
is exhausted. The workflow remains blocked, the overall saved goal remains active,
and the original dispatcher stub remains unmodified. No candidate VM verification
or source installation occurred. Do not reset this goal or use it as a successful
repair or model-capability observation.

Actual usage: one Luna call and two reviewer calls; three author-attempt slots
consumed including the two synthetic events. Known partial review charge was
$0.0003483, with total cost unknown. Evidence in `.harness/self-improve-082` includes
`fault-contract.json`, crash/checkpoint files, early and cooldown restart logs,
`after-repair.json`, `recovery-checks.json` and `analysis.json`.

The exercise proves saved-feedback, lease, cooldown and attempt-budget continuity
across this abrupt checkpoint crash. It leaves successful feedback repair unproven.
The next implementation must retain bounded edit-validation reasons so recovery
can distinguish output formatting from scope/snapshot violations without storing
raw responses, relaxing acceptance, or converting every failure into a retry.

## Cycle083: bounded output diagnostics

New parser failures carry an allowlisted `outputReason` alongside
`kind: "unknown"` and `origin: "coding_output"`. Codes distinguish invalid reply
bytes, JSON, edit shape, path, missing file/snapshot, replacement shape, stale
hash, non-unique text, overlap and size limits. They retain existing parser
acceptance and static error messages. `invalid_path` still groups malformed,
non-writable and duplicate paths; it is not a specific policy conclusion.

The durable runner attaches this metadata only when its local parser raises the
specific validation error. Journal reopening preserves it; if a stronger denial
wins failure precedence, the superseded parser reason is removed. No response
text, paths or replacement content is stored in this field. Retry eligibility,
attempt budgets, billing and scope requirements are unchanged. Historical failures
without the field stay unresolved, including cycle082.

Clanker's Luna worker authored the parser changes. Host integration added the
failure and journal boundary, with regressions for rejection reasons, persistence
and late denial precedence. This diagnostic work enables a fresh repair exercise;
it does not itself establish successful repair.

## Cycles084–085: diagnosed rejection and successful feedback repair

Cycle084 used a fresh two-attempt dispatcher goal with a synthetic defective
candidate followed by one real Luna repair. Two real reviewers requested changes.
The repair was rejected as `unknown/coding_output/invalid_replacement`, consuming
the remaining slot. This identifies replacement-object validation, not the exact
bad key, type, text or size. No source was installed; the failed goal was retained.

Cycle085 declared the same behavioral requirements, fixtures, tests, routes and
budgets in another fresh project, with an added task instruction requesting one
complete-file `content` edit and raw JSON. The objective wording and isolated test
path also changed. Both reviewers again rejected the synthetic candidate. The
real Luna repair preserved that feedback, passed the second Qwen/Muse review pair,
passed isolated VM verification, and was installed by Clanker. The ledger marks
the goal completed with two consumed author slots. No manual source copying or
budget reset was used.

Actual usage across these separate runs was two author calls and six review calls.
Known partial review charges were $0.0003415 for084 and $0.0008099 for085; total
workflow costs remain unknown. Synthetic candidates are not model observations.
This is a successful feedback-repair example under a complete-file prompt, not a
controlled comparison, proof of the precise prior defect, or a claim that the
parser only received that representation. No outage or crash was injected in085;
those boundaries were separately exercised in082.

Artifacts remain under `.harness/self-improve-084` and `085`, including frozen
contracts, bounds, final journals, analysis, review reports and installation
receipts. The bounded example supports recommending simpler complete-file output
for small files when targeted replacements fail. It does not qualify a model for
general coding or authorize retries beyond the declared budget.

## Cycle086: actual Pi terminal installation and configuration review

Pi0.85.1 was launched in a real PTY in a fresh project with the local Clanker
package installed using `pi install -l`. Its startup listed `clanker-configure`
and all four package extensions. `/clanker config` correctly reported missing
policy. A local-only, non-metered proposal was prepared through the terminal;
`config-apply` displayed the actual confirmation dialog. Selecting No returned
`declined`, and the settings retained only the installed package reference.
The session exited cleanly without inference.

Normal startup could not write the global trust lock in this environment. The
smoke used Pi's documented `PI_CODING_AGENT_DIR` override pointing to a fresh
ignored directory, without copying credentials. Pi automatically downloaded its
`fd` utility there during startup. This is an isolated terminal integration check,
not a change to the user's normal Pi account or settings. Some retained terminal
output is truncated; proposal files and unchanged settings corroborate cancellation.

Evidence lives in `.harness/self-improve-086`, including `ui-evidence.json` and the
project's saved proposal. Affirmative human application, live inference inside
the interactive session, and natural-language skill execution were not exercised.
Earlier real model runs used the command handler directly. These coverage claims
remain separate.

## Cycle089: provider cooldown through completed installation

A fresh dispatcher goal consumed one author slot on an explicitly synthetic
OpenAI outage. A normal Pi `goal-step` during the saved 60-second cooldown returned
waiting, with no additional author attempt or reviews and the deadline unchanged.
After the deadline, normal foreground command-handler steps dispatched one Luna
author, obtained Qwen and Muse reviews, passed isolated verification and installed
the exact verified source. The same goal completed with two consumed slots and
the original outage retained. The initial TODO source failed the same isolated
test oracle before dispatch.

Evidence: `.harness/self-improve-089/{cooldown-evidence,final,analysis,status}.json`,
`baseline.log`, `verification.log`, and `admission.log`. This exercises the Pi
command handler, not actual terminal inference, unattended wakeup, cross-provider
fallback or a real provider outage. Total cost is unknown; the reported partial
review estimate is $0.0003174. No capability cohort was admitted from this drill.

## Cycle090: four-task coding cohort and real feedback repair

Frozen suite `clanker-utilities-090` compared Luna and Terra at low effort on
revision merging, dependency validation, retry-header parsing and event replay.
Independent oracle review preceded freezing; all four starting implementations
failed isolated baseline tests. Eight terminal trials consumed nine author calls,
17 review calls and seven candidate VMs. Seven workflows passed; Luna's parsing
workflow stopped on a Qwen review timeout before verification. That failure is
retained as workflow evidence, not attributed to author correctness.

Luna's first event implementation used a numeric sequence to look up a string-keyed
map. Both reviewers found it; Clanker relayed their feedback, and a second author
attempt passed both reviews and isolated tests. This was a real generated defect,
not an injected one. Independent inspection verified all seven successful proofs
and source pins before all eight rows were admitted.

Luna completed 3/4 workflows; Terra completed 4/4. Summed active stage time divided
by successes was approximately 116.7s and 69.4s respectively, including failure and
repair work. These are descriptive observations, not wall latency or a model
ranking. Existing minimum two samples per case remains unmet; both ordinary and
confidence-filtered routing queries returned no qualified route. Total cost is
unknown; partial metered review estimates sum to $0.0030451. No project routing or
source installation changed. Evidence: `.harness/self-improve-090`, including
`suite.json`, `cohort.json`, `report.json`, `admission.json`, `analysis.json`,
baseline/verification logs and independent `review.md`.

## Cycle093: cross-provider author fallback and review authentication block

Preflight identified a reviewer-pool constraint: all dispatched author providers,
including failed attempts, are excluded from review. Luna to Muse required Qwen
and a fourth provider. Before dispatch, the isolated fixture added the existing
root-configured Grok subscription route; independent preflight approved the static
pool while keeping remaining quota unknown. The original baseline failed isolated
tests. No root routing settings changed.

One synthetic OpenAI outage consumed author slot1. Clanker immediately selected
permitted Muse and retained its completed candidate in slot2 before the original
60-second provider cooldown expired. Qwen returned no findings. Grok then failed
with `auth` at `worker_setup`; this is not evidence of quota exhaustion. The same
goal remains active and its workflow is blocked, with the original failure and
candidate preserved. No candidate VM or installation ran; the target source
remains the original stub. No reviewer independence or budget was weakened.

Evidence: `.harness/self-improve-093/{after-fallback,analysis}.json`, fixed contract,
bounds, logs and independent review. The partial Muse author estimate is $0.0003475;
total cost is unknown. This proves cross-provider author continuation through an
authentication blocker, not completed verified delivery or automatic wakeup.

## Cycle095: retained repeat cohort rejects premature optimization

A separately identified eight-trial repeat used the unchanged four-task cycle090
suite, exact source/test pins, model/effort cohort and existing success thresholds.
Both cohorts share suite hash
`5c08889da45d3001b45f4b5fd49a0dff725e404336a586616fcbff2778d4226e`.
The repeat consumed eight author calls, 13 review attempts and five successful
candidate VMs. Three workflows stopped during Qwen review with saved
`unknown / worker_inference` failures around 60 seconds. Their precise cause is
not established; they are not classified as author defects.

Independent inspection passed all five successful proof chains and revalidated
the original eight-row admission unchanged. All eight repeat results were
admitted and merged with all eight original observations. Luna has 5/8 verified
workflows, Terra 7/8. Neither qualifies under the existing policy: Luna misses
per-case and overall success thresholds; Terra misses the event-replay per-case
threshold. Both scores remain null; confidence-filtered ranking is also empty.
No cases or failures were dropped and no thresholds/preferences were changed.

This is repeated workflow evidence on four small tasks, not general coding
competence. Runtime fixes occurred between cohorts, so observed performance
differences are not causal estimates. Total cost is unknown; combined partial
metered review estimates are $0.0049264. Evidence is in
`.harness/self-improve-095`, including `report.json`, `admission.json`,
`combined.json` and independent `review.md`. Initial inventory used repository-root
health and is explicitly retained as `initial-inventory-root-health.json`; it was
not dispatch authority. The next evidence priority is reviewer reliability rather
than further repeats under the same failing review configuration.

## Cycle096: separate longer-deadline reviewer diagnostic

One preserved cycle095 retry-header candidate was reviewed again under a separate,
explicit two-review budget, with zero author calls. The request changed only the
review timeout from 60 to 120 seconds. Qwen completed a structured assessment in
75.012 seconds; Muse completed in 31.813 seconds. The pair returned `findings`,
not approval: Qwen challenged rejection of a 1001-digit header, while Muse returned
no findings. The original contract explicitly requires overflow handling through
1000 characters; the longer-input validity interpretation needs adjudication
before this finding can establish a candidate defect.

Fresh journal reads confirmed the original coding checkpoint and workflow digest
unchanged. No original attempt/review budget was reset, no candidate was installed,
and no calibration observation was replaced or admitted. The diagnostic supports
considering a longer prospective review deadline; one later response does not
prove the cause of historical failures or establish reviewer reliability. Partial
metered review cost was $0.0004884; total cost remains unknown. Artifacts are in
`.harness/self-improve-096`. The original failed trial and existing routing
thresholds remain intact.

## Cycle097: Pi SDK terminal restart and verified delivery

A fresh dispatcher fixture failed its pinned isolated baseline test. The goal was
created with `/clanker goal-create` in Pi's actual SDK `InteractiveMode` terminal.
An out-of-band, inference-free test driver injected one synthetic provider outage
into the first author slot. Terminal status showed the saved coding ID, attempt
and cooldown; the terminal exited. A new terminal session's `/clanker goal-step`
returned `idle / waiting` with the same deadline, without spending another slot.

After cooldown, explicit terminal goal-step commands ran one real Luna author and
one Qwen/Muse review pair, then isolated verification and verified installation.
Independent inspection approved the exact candidate/test/proof bindings before
installation. Goal `873fb284-8dd8-43cf-b0a2-3ebc1a81ca06` completed with coding ID
`78e40d08-4587-46c1-8c11-7890e6b60055`, two retained author slots, one review pair,
and the original outage record. Installed dispatcher SHA-256 is
`49bc0a542cd3e4474c4424dcd38260c9cb182c8e78b0018b579a286cbab8361e`.
The future run's deadline was prospectively 120 seconds; Qwen took 14.783 seconds
and Muse 6.478 seconds. Partial metered review estimate was $0.0003374; total cost
is unknown. No general capability qualification follows from this fixture.

The stock CLI started but could not create global auth/settings locks in this
sandbox, leaving cloud models unavailable. The SDK-hosted terminal used Pi's public
runtime API with isolated settings, in-memory sessions, native availability checks
and a read-only credential adapter. It copied or printed no credential values.
Its metadata list contained configured provider names/types only. An initial
synthetic-driver availability setup failure occurred before any coding journal,
worker call or attempt consumption; it remains documented separately.

This proves session restart at a persisted synthetic cooldown checkpoint, not a
real provider outage or cancellation of active remote inference. All Personal
plan actions were explicit foreground steps. Stock CLI live execution, automatic
wakeup and ordinary-user usability remain unverified. Terminal output still
exposes verbose verification details; goal status also shows the coding snapshot's
`ready_for_review` state beside a completed goal, without its verified workflow
phase. Those are concrete usability gaps. Artifacts and terminal captures are in
`.harness/self-improve-097`; all terminal processes exited.

## Cycle098: workflow-aware goal status

The cycle097 drill exposed a completed goal whose coding snapshot still said
`ready_for_review`. Clanker's Luna worker added a separate, read-only workflow
summary to `/clanker goal-status`, preserving the coding snapshot label and failure
history. It shows recorded phase/reason, review budget/deadline and whether the
workflow refers to the current coding revision. Missing workflow state is `null`;
corruption fails rather than pretending the state is absent. This is observational
status across journals, not fresh verification or installation authority.

Four regression checks failed before the patch: reviewer authentication blockage
while the candidate is ready, absent journal without initialization, corrupt/missing
workflow rows, and changed coding revision. The initial worker setup rejected an
oversized read-only context file before inference; one subsequent Luna call returned
the patch. Independent review passed 14 focused checks with no actionable finding.
Evidence is retained under `.harness/self-improve-098`.

## Cycle100: new-file integration and failed live acceptance

Coding declarations now support explicit `create: true` on writable files with
existing parents. Journals preserve an absent original as `null`, distinct from
an empty existing file; private worker projections use empty text. Review,
calibration pins and installation retain that distinction. Creation rejects
existing objects and symlink parents without mutating the project.

The live Pi SDK terminal run did **not** complete. Goal
`7573b314-169b-4052-9b10-80b3f2fed792` used its two author attempts and two independent
Qwen/Muse review pairs. Both candidates passed model review but omitted the `.ts`
extension in a relative import. Both isolated VM runs rejected them with
`ERR_MODULE_NOT_FOUND`. The repair changed a type import without resolving the
reported module lookup failure. The workflow stopped at `blocked / coding_budget`;
the goal remains active, `dispatch.ts` remains absent, and nothing was admitted or
installed. No budget was increased or reset.

The partial metered review estimate was $0.0008588; total cost is unknown. This
establishes rejection of these invalid candidates, not successful new-file delivery
or reliable reviewer/repair capability. Evidence is in `.harness/self-improve-100`,
including `analysis.json`, `final.json` and terminal captures. The artifact named
`verified.json` is a failed verification snapshot, not an acceptance proof.

## Cycle101: execution-context repair diagnostics

A Clanker Luna worker updated generic repair instructions to trace the reported
failure to its source cause while preserving requirements, JSON output and
untrusted-evidence boundaries. A separate one-author-call probe on a copy of the
failed cycle100 candidate still failed: it changed the import to `./graph.js`,
which the direct-source verification package does not contain.

A second, prospectively bounded one-author-call diagnostic added inspected runtime
facts through the existing `context.facts`: Node 24.21.0 executes the packaged
TypeScript sources directly, with no compiler/bundler or emitted `graph.js`.
That worker produced `./graph.ts`; the same pinned tests then exited 0 in the
isolated VM, with matching controller/input hashes and the emulator reaped.
The configuration skill now directs goal preparation to carry such facts using
existing task-scoped memories with provenance, rather than infer execution from
source filenames. No runtime or new configuration field was invented.

These are separate repair diagnostics, not a successful continuation or admission
of cycle100. Each used one subscription author call and no reviews; neither
installed source, reset the original budget, or qualified routing. Original ledger,
coding and workflow file hashes remained unchanged. A single context-bearing pass
supports better task preparation, not a causal or general model-quality claim.
Artifacts: `.harness/self-improve-101`.

## Cycle102: new-file delivery with verified repair in Pi

A fresh goal used explicit absent-file creation and task-scoped runtime facts,
with two author attempts and two independent review pairs declared in advance.
Actual Pi SDK `InteractiveMode` commands created and advanced the goal. The first
Luna candidate still imported `./graph.js`; Qwen and Muse returned no findings,
but the pinned isolated tests rejected it. The next explicit step used the
remaining author and review budgets. Luna changed the import to `./graph.ts`,
both fresh reviews passed, and the second VM passed with protected exit 0.

Independent inspection checked the exact checkpoint, reviews, specification,
package, tests and proof before the final Pi command installed the previously
absent file and admitted the task. Goal `14b0fc1c-6727-41c4-897f-266886a17828` is
completed; coding ID is `faa1f287-d144-44c9-a134-27a5254ffa1e`. Installed source
SHA-256 is `e8f0300e1db604a96547960b18e70937f2b0c8e892bd9162e95722713916ef67`.
The original remains `null` in the journal; both attempts, both pairs and the first
failed VM remain recorded. No candidate code was manually repaired.

This run used two real author calls, four reviews and two candidate VMs. Partial
metered review cost was $0.0009737; total cost is unknown. Explicit foreground
steps preserved Personal-plan restrictions. The SDK terminal used the existing
read-only credential adapter and exited afterward; this does not verify stock CLI
credential writes or unattended operation. Original cycle100 journals and absent
target remain unchanged. Evidence is in `.harness/self-improve-102`.

This proves a bounded new-file repair-and-install workflow for this fixture. It
also shows that runtime context does not guarantee a correct first attempt and
model review missed an execution defect. It does not qualify model routing or
complete general project delivery, model-efficiency evaluation, or M1.
