# Live coding calibration: cycle 047

Completed supervised pilot: `.harness/self-improve-047/project`, cohort
`clanker-primitives-047-v2`. Clanker ran six actual author calls and eleven review
calls under frozen limits of six author/twelve review calls. The three utility
contracts covered bounded retry delay, own-key facts merge and balanced case
counts. Authors were Luna and Muse; each successful result received two independent
provider reviews, excluding its author provider, followed by the pinned VM checks.
Qwen Personal participated only in explicitly advanced foreground trials.
No background service or main-project policy change was made.

| Author                     | Pipeline accepted | Author attempt time, total | Estimated author cost       |
| -------------------------- | ----------------- | -------------------------- | --------------------------- |
| GPT-5.6 Luna               | 2/3               | 28.81 seconds              | Unknown subscription cost   |
| Muse Spark 1.3 Contributor | 0/3               | 58.34 seconds              | $0.0012418 catalog estimate |

These are **pipeline outcomes**, not isolated author defect rates. Luna backoff
and Muse facts-merge blocked on invalid reviewer output. Muse backoff and balanced
counts received findings and stopped at their one-attempt coding budgets. Luna
facts-merge and balanced counts passed two independent reviews and VM execution.
Findings themselves were not separately reproduced as counterexamples. Independent
evidence audit also noted that the Muse balanced-counts objection asks for
null/undefined row handling outside the declared non-null TypeScript row type.
That objection is not established as an author defect; review adjudication needs
contract-aware evidence rather than automatically expanding task requirements.

The complete cohort was admitted with all failures retained. A read-only in-memory
evidence inspection requested at least three samples across all three cases and
80% success: neither route qualified, so the router returned no selection. No
evidence reference was persisted to project settings. Main-project adoption still
requires a separately reviewed settings diff, and these results do not justify it.

The original V1 cohort is retired as capability evidence. Independent review found
three major oracle gaps: premature backoff capping, discarded unchanged facts, and
presence-only case counting. Deliberately wrong implementations passed V1 but
failed V2 (`oracle-mutations.json`). V1 tests remain unchanged, and V2 received a new
contract/suite identity. V1's only dispatched trial used one Luna author call and
one Qwen review call, which failed output validation; it was not verified or
admitted. These two calls are separate from the V2 counts above.

Author-only metrics omit substantial work: Luna facts-merge took about 10.8 seconds
authoring, 36.6 seconds in review and 4.9 seconds in VM execution, excluding
packaging and queue time. Reviewer choices differ by author provider, introducing
another confounder. A useful efficiency comparison still needs full-workflow
accounting, repetition, larger representative tasks and a single-model baseline.

Artifacts: `suite-v2.json`, `cohort.json`, `report.json`, `admission.json`,
`assessment.json`, `timing-diagnostic.json`, `inventory.json`, `retired-v1.json`,
per-trial results and the isolated project's journals/VM receipts. The local pilot
drivers are experimental artifacts, not a supported general scheduler. The raw
accounting report retains its non-authoritative `verified_unadmitted` label even
after admission; `admission.json` and revalidated journal records are authoritative
for evidence admission. All process handles from this pilot have completed.

Next improvement: distinguish safe review-validation failure codes without logging
raw provider content; then measure the entire workflow and evaluate bounded review
recovery. Preserve the original cohort and its results rather than changing its
budget, parser or acceptance rules after seeing outcomes.
