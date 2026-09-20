# Evidence-based model routing

Relentless can now rank explicitly eligible routes using task-specific evaluation evidence. This is opt-in. Tasks without `optimization` retain the original quality/preference order. Quality remains a user policy floor, not a benchmark result.

When `optimization` is present, the router compares every configured, supported
model/effort combination at or above the task's effort floor. Each combination
must independently qualify on evidence for that exact effort. A higher effort may
win if its measured cost or time per successful outcome is lower; unknown metrics
and insufficient evidence cannot win. Pi session effort pins restrict this pool
before comparison. Without optimization, selection keeps the lowest permitted
effort and the existing quality/preference ordering. `/relentless explain` reports
the same combinations used for selection.

## Collect observations

```sh
mise exec -- pnpm build
mise exec -- node dist/cli.js evaluate <authorized-config.json> examples/model-probe.suite.json
```

This performs real inference. It evaluates eligible configured candidates, serially and interleaved by case. Each suite is bounded to 30 requests, three repetitions and ten cases, with a suite deadline and existing per-prompt timeout. A provider error stops the evaluation; it does not bypass a policy/authentication block or silently retry elsewhere. All eligible Pi routes are preflighted before dispatch. Calls now run in owned worker child processes; cancellation requests local termination, but remote inference termination cannot be guaranteed.

The host checks responses against declared JSON/contains predicates, hashes the suite's workload and cases, and records each route's provider, model, billing mode, actual selected effort, case, timestamp, acceptance and elapsed time. Models do not grade themselves. Metered cost estimates travel through validated child IPC and are bound to the same host-checked case outcome; they come from Pi's token usage and catalog prices; these are estimates, not invoiced charges or a hard spending ceiling. Missing/zero-priced catalog estimates and subscription opportunity costs remain unknown. No arbitrary evaluator code runs.

The CLI prints a private `.harness/evaluations/<id>/` directory with the request, SQLite checkpoint, report and a config containing observations. Each dispatch is reserved before inference; each completed observation is committed before the next call. Use `relentless evaluation status <directory>` to inspect the checkpoint and `relentless evaluation resume <directory>` to continue between completed calls or rebuild terminal report files. Resume retains the original deadline and immutable normalized suite/configuration. An in-flight reservation means execution is active or ambiguous after interruption: resume refuses to replay it. No automatic reconciliation or budget refund is available. Older evaluation directories without a checkpoint cannot be resumed. Provider failures remain terminal for this evaluation; resume does not retry them. Raw observation input is a trusted local configuration boundary, not cryptographic proof against tampering. Do not accept model-written observations as host measurements.

## Request optimized routing

Add an `optimization` object to a task:

```json
{
  "workload": "typescript-reasoning-probe-v1",
  "suiteHash": "29c16d7363f0c5daef7c0ecc7f158fce2367e16e5fd5617c3c8643f9f2fbcd35",
  "caseIds": ["nullish", "closure", "mutation"],
  "metric": "latency"
}
```

Use the generated config with `plan`, `swarm`, `code` or a durable goal. The suite hash must match the evaluated workload/cases; workload applicability is explicitly chosen, not inferred from task text. Defaults require at least three samples, every declared case with equal nonzero sample count, at least 80% acceptance both overall and on every case, and evidence no older than one day. Exact provider/model/billing/effort matches prevent using subscription-proxy measurements for public API routes or low-effort measurements for high-effort tasks.

Hard routing constraints apply first: enabled status, tier, billing permission, provider pins, supported effort, and durable-goal model/allowlist/cooldown restrictions. Among routes with sufficient evidence, score is total elapsed milliseconds or total estimated dollars divided by accepted results, including failed attempts. Cost ranking excludes any route with unknown costs. Ties retain the baseline order. Requested optimization fails closed when no eligible route has adequate evidence; it does not silently fall back to a claimed optimum. Unknown models require explicit evaluation. Excluded routes may still be better; the ranking only compares routes with qualifying evidence.

## Per-case sample requirements

A strong pooled result cannot hide a failed required case. Optional `minCaseSamples`, `minCaseSuccessRate` and `minCaseLowerBound95` apply separately to every declared case before ranking. For example, `minCaseSamples: 3` and `minCaseLowerBound95: 0.8` require both sufficient observations and a Wilson lower endpoint of at least 0.8 on each case. The lower-bound threshold defaults to zero; it is opt-in, not a claim that the default policy has statistical confidence.

The reported `cases` statistics include counts, acceptance rate and the lower endpoint of a two-sided 95% [Wilson interval](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). Three successes in three trials yield about 0.4385; thirty in thirty yield about 0.8865. The calculation assumes independent Bernoulli trials. Repeating the same model prompt can produce correlated outcomes; these numbers do not establish performance on unseen tasks, simultaneous confidence across all cases or statistical superiority between routes.

## First live probe

Both Muse Spark 1.3 Contributor and GPT-5.6 Luna at low effort passed the same three small JavaScript reasoning cases. Observed average time per accepted result was about 3.23 seconds for Muse and 2.07 seconds for Luna. Latency routing selected Luna. Muse's three token/catalog estimates total approximately $0.0001942; subscription cost remains unknown rather than being recorded as free.

This is a small smoke probe, not evidence of general coding strengths or a reliable benchmark. It does not justify promoting a model for repository changes. Larger held-out coding/review suites, repeated trials, confidence-aware comparisons, live capacity verification, dollar budgets and automatic recalibration remain work in progress. Model aliases and provider updates can also invalidate older conclusions.

Evidence: `.harness/evaluations/9ef7a52d-baaf-482c-8d71-2473055daf91/` and `.harness/self-improve-002/ranking.json`.

Use [model inventory](model-inventory.md) to inspect configured catalog/authentication/effort/cooldown state before choosing an evaluation cohort.

## Review calibration (cycle 007)

The four-case `examples/review-calibration.suite.json` covers retry-budget reset, stale-result publication, a path-prefix error and a clean revision fence. Muse Contributor and Codex Luna each passed all twelve checks (three repetitions per case). Observed mean elapsed time per accepted response was 5.15 seconds for Muse and 3.61 seconds for Luna; default latency ranking selected Luna. Muse's total catalog-derived estimate was $0.001394408. Subscription cost remains unknown.

A policy requiring three samples and a lower endpoint of 0.8 per case correctly qualified neither route: each case's 3/3 result yields about 0.4385. No larger sample was silently purchased to force qualification. These synthetic, prompted defect labels are calibration evidence, not held-out repository review or proof that either model is generally better.

Report: `.harness/evaluations/b9c048cf-64f1-44e2-858f-9ec112c57a11/`; analysis and both policy results: `.harness/self-improve-007/ranking.json`.

The cycle-019 process-worker transport check repeated the same four review cases once per model. Both passed 4/4; Luna averaged 3.82 seconds and Muse 6.08 seconds including process overhead. The baseline ranked Luna; the stricter policy rejected both for insufficient per-case samples. Muse's total estimate was $0.0004423. These small measurements do not authorize a general model ranking. Evidence is retained in `.harness/self-improve-019/ranking.json`.

Pi integration now supports explicit project-local evaluation journal references
through `relentless.evidence.evaluations`. Completed, unambiguous cohorts feed existing
workload-specific routing and are frozen into newly created tasks. The loader
retains negative trials, avoids duplicate sample inflation and imports no provider
permissions. See [Pi evidence loading and trust limits](pi-package.md#local-evaluation-evidence--cycle-037).

## Live controller classification cohort — cycle 038

The [controller recovery suite](../examples/controller-recovery.suite.json) ran
through Relentless's process/Pi workers: three synthetic cases, two repetitions per
provider, low effort, serial calls, maximum 12 calls and a four-minute deadline.
Cases cover a pinned model's quota wait, a confirmed policy block, and expired-lease
ambiguity. The host checked the declared JSON fields; models did not grade results.
The JSON predicate checks those fields, not the absence of all extra fields.

| Provider/model                    | Accepted trials | Mean end-to-end response time | Recorded estimated cost |
| --------------------------------- | --------------- | ----------------------------- | ----------------------- |
| OpenAI Codex / GPT-5.6 Luna       | 6/6             | 2.960 s                       | Unknown (subscription)  |
| Meta / Muse Spark 1.3 Contributor | 6/6             | 6.778 s                       | $0.0008406 total        |

The estimate is Pi token/catalog accounting, not an invoice or hard spend cap.
Latency includes worker startup and transport. Trial order was interleaved by case
but not randomized. These are tiny, correlated, synthetic classification samples:
there are only two successes per case/model, with a per-case Wilson lower 95%
bound around 0.342. They establish neither broad safety competence nor coding
ability, operational reliability, or a stable provider ranking.

The completed journal is
`.harness/evaluations/93b0456b-3bb5-4025-9174-0e455fd393a0/`. The project's local
Pi settings now reference it as evidence. The [example optimized task](../examples/controller-recovery.task.json)
requires this exact workload/suite, all three cases, six samples per route, two per
case and all declared predicates passing. Evidence expires for routing after one
day. This is a prototype observation threshold, not statistical certification.

The unrestricted eligible-cohort latency rank preferred Luna in this run. A
separate Pi scheduler preview used the project's actual role eligibility and
resolved model catalog/authentication and also selected Luna, without inference.
Muse was not added to the scheduler role by that preview; local Qwen had no matching
low-effort measurements. The model's advice never changes deterministic denial,
lease, billing, pin or attempt-budget enforcement. Other task workloads and tasks
without explicit optimization retain their configured behavior.

This private local cohort is not bundled as a portable benchmark dataset. A new
project must reference its own completed evaluation records and choose its own
acceptance requirements. Automatic suite selection and representative coding/VM
calibration remain unfinished.

## Summed measured active time — cycle 070

A coding cohort can prospectively declare `measurement: "workflow-active-v1"`.
The protocol changes the suite identity, so existing author-only cohorts cannot be
relabelled or mixed into it. Once the entire cohort is terminal and passes existing
admission checks, it can supply optional observation `activeMs` for task
`optimization.metric: "activeTime"` with the exact workload, suite and cases.

The value is the sum of measured author attempts, recorded review attempts and
verification-history outer active durations, including failures and repairs. A
failed author before review can have zero review/verification work only when the
journals establish those stages never ran. Missing attempts, unfinished review
reservations, pending verification or legacy telemetry make the value unknown.
Verification's inner VM duration is not added again to its outer active duration.
A zero total is unknown for ranking, not proof of free work.

This is summed measured stage time, not elapsed wall time or total compute cost.
Parallel reviewer durations add; queue waits, cooldowns, manual pauses and unmeasured
host overhead are not included. The protocol emits `elapsedMs: null` and
`estimatedUsd: null`, so latency and cost optimization cannot accidentally use it.
Hardware costs and subscription opportunity costs remain unknown. Evidence freshness
retains the conservative author-completion timestamp; it is not refreshed by report
inspection or admission.

Active-time scores sum all qualifying observations, including failed trials, and
divide by accepted outcomes. Existing per-case completeness, success, freshness,
confidence and hard permission constraints still apply. Report-only fields do not
become routing authority until admission. Current validation uses controlled
fixtures; it is not a new live provider benchmark or evidence of broad model
superiority. Representative cohorts, wall-clock workflow measurements and total
cost measurements remain unfinished.

## Live scheduler-contract workflow cohort — cycle 071

The frozen `relentless-scheduler-071` cohort compared GPT-5.6 Luna and GPT-5.6 Terra
at low effort on dependency eligibility and revision-aware fact merging, twice
per case/model. Qwen3.8 Flash and Muse Contributor were the same independent
reviewer routes for both authors. Each trial allowed one author attempt and one
review pair; execution used explicit foreground steps, with no automatic retries
or source installation. Personal-plan use stayed in those bounded foreground steps.

The starting stubs failed two preliminary isolated checks. Independent review
identified missing shared-dependency and out-of-order-conflict assertions; those
were added before registration. Reference implementations passed both expanded,
frozen test suites in separate VMs. The registered cohort then used eight author
attempts, twelve review calls and four candidate VM checks. All eight outcomes
were retained and admitted, including the four failures.

| Author, low effort | Verified workflows | Summed measured active time per verified workflow, failures included |
| ------------------ | ------------------ | -------------------------------------------------------------------- |
| GPT-5.6 Luna       | 1 / 4              | 174.92 s                                                             |
| GPT-5.6 Terra      | 3 / 4              | 84.69 s                                                              |

Neither route qualified for the declared 80% overall and per-case acceptance
thresholds with four samples and two per case. The stricter per-case Wilson lower
endpoint threshold of 0.8 also qualified neither. No project optimization policy
was enabled and no winner is claimed. These are two small, correlated contract
probes in fixed interleaved order, not randomized trials or broad repository coding
benchmarks. Active-time ratios are descriptive, not evidence of wall-clock gains.

The failures have different causes: Qwen returned invalid JSON in two reviews
(one for each author); both reviewers identified a real out-of-order conflict bug
in one Luna fact-merging candidate; another Luna author attempt failed as `unknown`
before review. Independent source inspection confirmed the conflict counterexample.
The format and unknown failures are not demonstrated author coding defects.

Known Muse review estimates total $0.0017784 from Pi token/catalog accounting.
Subscription, local verification and total costs remain unknown. The inventory
record showed Grok required OAuth refresh, so this cohort did not call it or change
credentials. No malformed review was accepted, failed slot dropped, budget reset,
threshold lowered or source installed to improve the apparent result.

Evidence: `.harness/self-improve-071/` contains the frozen suite, source/test pins,
VM reports, per-step outputs, complete report, admission and analysis. The next
priority is reviewer output reliability and better classification of unknown worker
failures before larger calibration. Further trials must retain the current cohort
and prospectively declare any changed model, effort, reviewer or retry policy.

### Malformed review diagnostics — cycle 072

New failed review attempts include `outputDiagnostic` with capped UTF-8 `bytes`
(65537 means over the 65536-byte limit) and `shape`: `empty`, `fenced`, `json_like`,
`other`, or `oversized`. This retains no raw output or parser exception text.
Fenced JSON remains invalid; JSON-like output does not establish truncation.
The metadata never changes acceptance, failure kind, retry policy or billing.
Historical cycle071 reports have no such metadata and remain unchanged; their
formatting causes cannot be reconstructed from these new prospective diagnostics.
The unknown author failure still needs separate investigation.

### Worker failure origins — cycle 073

New coding failure entries may include `origin`; inference-failed review attempts
may include `failureOrigin`. Only fixed enum labels cross IPC or enter the journal.
They identify the observed boundary (job validation, setup, inference, provider
response, unsettled cancellation, output limit, protocol, worker exit or observer),
not provider culpability or permission to retry. Unknown failure kind remains
blocking. Existing cycle071 failures lack this prospective data and remain unknown.

### Prospective diagnostic cohort — cycle 074

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

The test/source hashes and workload/suite identity match071; contract identity,
project location and repeat count differ. One repeat per case is insufficient for
the declared routing thresholds. A fenced prefix does not prove the enclosed text
is valid JSON. Next test an explicit no-fences review prompt in a new frozen cohort;
any envelope normalization must be separately declared, strictly bounded and retain
all schema/path/line checks. Existing074 failures remain failures.

### Explicit review-format instruction — cycle 075

Cycle075 tested an explicit raw-JSON/no-Markdown instruction in a fresh four-trial
cohort. All eight reviews (four Qwen, four Muse) parsed successfully. Three workflows
passed both reviews and isolated VM checks; both reviewers caught a real superseded
conflict-detection defect in the fourth, a Luna facts candidate. The single author
attempt budget stopped that workflow without a repair attempt. Four author calls,
eight review calls and three candidate VMs ran. Every outcome was admitted; neither
route qualifies under unchanged evidence thresholds. Known metered review estimates
total $0.0015986; total costs are unknown. Source files and old cohorts are unchanged.

The changed review task gives075 a distinct suite hash. The trials use new author
outputs and fixed ordering, so this is not a paired causal experiment or evidence
of broad model superiority. Compared descriptively with074, observed formatting
failures went from three of five review calls to zero of eight; this does not
establish a general failure rate. Use the clearer instruction prospectively, retain
strict JSON/schema/path/line checks, and keep all old failures unchanged.

### Conditional repair cohort — cycle 076

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

The outer durable coding runner can still normalize local failures to untagged
unknown. This explains a diagnostic gap, not the actual cause of Luna's failure.
Add prospective stage metadata before attributing that event to output validation,
transport, filesystem or a provider. These two cases and single repetitions do not
measure general repair reliability or justify model promotion.

### Outer coding-runner diagnostics — cycle 077

New attempt failures without a more specific origin gain `coding_workspace`,
`coding_checks`, `coding_authority`, `worker_inference`, `coding_output` or
`coding_publication` according to the observed boundary. `coding_output` covers
rejected edit payloads; it does not establish a provider outage or automatically
authorize replay. Local exceptions remain normalized without their text. Existing
provider origins and failure kinds are preserved. The untagged076 failure remains
unresolved; these prospective labels cannot reconstruct its cause.

### Fresh Luna diagnostic repairs — cycle 078

Cycle078 ran two fresh Luna repair trials with077 outer-runner diagnostics. Both
passed independent review and VM verification on the first author attempt: two
author calls, four reviews and two candidate VMs. No tagged or untagged failure
occurred, so076's unknown cause remains unresolved. No feedback retry or escalation
was exercised. Both observations were admitted; the unchanged minimum sample
thresholds qualify no route. Partial metered review estimates total $0.0008555;
total costs remain unknown. Starting sources and previous cohorts remain unchanged.

Further repetition of these two tasks has limited value for general capability
claims. A separate read-only availability probe could not connect to the configured
local endpoint at127.0.0.1:18080, despite model/runtime files being present. This is
endpoint readiness evidence, not a local model failure; no local inference or
server startup occurred. Managed server ownership/readiness remains a practical
fallback gap to address before treating the local candidate as usable on demand.

### Managed local fallback — cycle079

Optional `routing.managedLocal` now pins and snapshots the local executable, model
and bundled libraries, starts a CPU server per authorized local call, checks
readiness and cleans up the owned process and files. Pi's configuration skill and
exact proposal confirmation cover this permission; it is absent from active
project settings. One real Pi/Qwen call passed in 14.3 seconds with confirmed
cleanup. This is lifecycle evidence, not model qualification or total-cost evidence.
See [configuration, bounds and limitations](local-inference.md#optional-managed-lifecycle--cycle079).

### Fresh 120-second workflow cohort — cycle104

A new four-case cohort ran Luna and Terra at low effort with the existing pinned
facts, dependency-selection, retry-parser and event-replay tests. Worker deadlines
were declared at 120 seconds, and inspected execution facts were included in each
case. These changes produce a distinct suite hash: prior090/095 failures remain
intact and are not combined with this cohort.

All eight trials passed independent Qwen/Muse reviews and isolated verification
on their first author attempt. Summed active workflow seconds (author, review and
verification stages; not wall latency) were:

| Case                 | Luna low | Terra low |
| -------------------- | -------: | --------: |
| Fact merging         |     59.6 |      63.8 |
| Dependency selection |     60.6 |      54.5 |
| Retry parsing        |     99.8 |     130.9 |
| Event replay         |     88.4 |     136.5 |

Review time is a substantial part of these observations. One fixed-order sample
per case/model cannot establish a stable speed difference or causally attribute
improvement to the deadline/context changes. The existing minimum of two samples
per case remains unmet; neither route is qualified and no preference changed.
Partial known metered review cost was $0.003346788; total workflow cost is unknown.
Artifacts and full stage timings are in `.harness/self-improve-104`.

### Scoped routing qualification from a matching repeat — cycle105

One bounded unchanged repeat of104 produced eight additional verified trials,
each with one author, an independent Qwen/Muse review pair and a passing isolated
VM. Independent inspection revalidated the complete cohort before admission.
All sixteen 104/105 observations were merged; the older, different-suite090/095
failures remain separate and unchanged. No thresholds were lowered.

Under the existing active-time policy (two samples per case, four cases, at least
80% success overall and per case), both low-effort routes qualify on this declared
suite. The actual router selects Luna from the admitted observations:

| Author route       | Verified trials | Active seconds per verified workflow |
| ------------------ | --------------: | -----------------------------------: |
| GPT-5.6 Luna, low  |             8/8 |                                 82.2 |
| GPT-5.6 Terra, low |             8/8 |                                 91.0 |

These are summed author/review/verification durations, not wall latency or isolated
author speed. Two fixed-order samples per case do not establish general coding
competence, a stable speed advantage, or high confidence. A stricter per-case 95%
Wilson lower-bound threshold of 0.8 qualifies neither route. Total workflow cost
remains unknown, and cost-based ranking qualifies neither. Cycle105's known
metered review subtotal was $0.0030052; it is not the total cost.

Inference-free calls using the same evidence preserve an explicit Terra model
pin, select Terra when Luna is excluded, and refuse higher-effort or cost-based
selection without qualifying evidence. Exclusion is a simulated candidate-pool
restriction, not a live provider outage. No project routing preference was changed.
Evidence and constraint previews: `.harness/self-improve-105/combined.json`.
