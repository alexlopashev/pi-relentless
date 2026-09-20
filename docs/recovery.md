# Native workers and task recovery — planned

## Decision

Clanker owns the task; a Pi, Claude Code, or Codex session is one attempt at executing it. Maintain a provider-independent checkpoint so a failed session does not strand the work. Native adapters are first-class choices when their tools or authentication are needed. The durable tool-free Pi supervisor now implements persisted retries, constrained fallback and contract handoff; see [operations](durable-operations.md). Native adapters, actual native-session resume and side-effecting coding/desktop recovery in this document remain planned.

For Codex integration, use local `codex app-server` over stdio when streamed lifecycle, approval and resume controls are required. Simple jobs may use `codex exec --json`. Prefer version-matched generated protocol types. The local 0.154.0 binary supports both interfaces. Native workers do not automatically inherit every desktop-app plugin or computer-use tool.

## Capability routing

A route must match provider/model access, billing mode, model/effort floors, execution adapter, and required capabilities. Capability discovery and a minimal connection test must verify browser/computer control before such a task is dispatched. Image input support alone is insufficient. Workers on the same desktop/browser context need an exclusive lease; parallel planning and coding can continue elsewhere.

For GUI handoff, preserve the intended target, last confirmed action and observed state; the successor must inspect the current surface before acting. Do not replay clicks, purchases, submissions or messages after a disconnect without checking whether they already happened. Worktrees protect source isolation, not the shared desktop.

## Failure classification and response

| Evidence                                           | Proposed response                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Transient network, stream or server failure        | Bounded backoff; reconcile the last action before retry; use permitted fallback when retries are exhausted                          |
| Rate limit or included-usage exhaustion            | Respect retry-after/cooldown; select an authorized route with available capacity or pause                                           |
| Task budget exhausted                              | Pause; changing provider must not reset the task's budget                                                                           |
| Context exhausted                                  | Make a factual checkpoint and start a fresh session; preserve unresolved findings and constraints                                   |
| Invalid, missing, or incompatible session history  | Preserve files/evidence; create a fresh worker from the checkpoint if the underlying task remains authorized                        |
| Model unavailable or unsupported capability        | Select a permitted route that satisfies the same capability and quality floors                                                      |
| Expired login or account verification required     | Surface the login/verification requirement; another provider may handle independent work, but must not bypass an access restriction |
| Awaiting approval or user input                    | Keep the request pending; do not misclassify waiting as a stalled worker                                                            |
| Explicit policy refusal or permission denial       | Record the reason and stop the affected action; do not model-hop, fork or remove history to evade the restriction                   |
| Unknown flag, generic bad request, ambiguous error | Preserve diagnostic code and redacted details; classify before resubmitting; do not assume a retryable outage                       |

A task can have an explicit ordered fallback policy. The user's request authorizes designing that policy; it does not grant arbitrary spending or weaker permissions. Record every actual model/provider/effort change. An exact-model-only task has no substitution unless its policy explicitly permits one. Independent, permitted subtasks can continue while one branch waits.

## Checkpoint and recovery transaction

Persist outcome, user instructions, acceptance criteria, source revision, uncommitted patch/artifact hashes, verified check results, completed/pending tasks, outstanding questions and approvals, constraints, budget consumption, failure reason and attempt IDs. Exclude credentials and private chain-of-thought. Agent summaries are claims to verify, not authority.

1. Classify the terminal error or waiting state using structured events. Record heartbeats separately from observable task progress.
2. Stop/fence the old writer; reconcile uncertain side effects and process ownership. If it cannot be fenced, do not grant a second writer the same workspace or desktop.
3. Save an atomic checkpoint and reserve the next attempt under a lease. Keep the same logical task ID, cumulative budget and failure history.
4. Attempt same-provider resume when appropriate; otherwise create a new session on the allowed route with a factual handoff. Cross-provider continuation is a new session, not import of an incompatible native transcript.
5. Have the successor inspect artifacts and actual state before making changes. Invalidate checks/reviews when their reviewed revision changes.
6. Bound each retry burst and worker lifetime. Retain the goal durably with a next retry, event trigger, or explicit blocker; report the cause instead of cycling indefinitely through providers. Hard user budgets/deadlines still require a constraint decision. See [goal supervision](goal-supervisor.md).

## Codex protocol evidence

[Official app-server documentation](https://developers.openai.com/codex/app-server/) describes native session lifecycle, streamed completion/error events, model discovery and approvals. Local `codex app-server generate-ts` was inspected without starting an inference session. Version 0.154.0 exposes `usageLimitExceeded`, `rateLimitExceeded`, `contextWindowExceeded`, `sessionBudgetExceeded`, `serverOverloaded`, `unauthorized`, `cyberPolicy`, `misalignmentPolicyViolation`, and transport-error variants. Treat these as adapter inputs, not user-visible diagnosis based only on a label.

The protocol also distinguishes safety buffering, service-side rerouting, and account-verification notifications. Buffering is not proof of a failed session. Respect native retry/verification semantics and avoid a second controller replaying an already-active request. A user report that a session was “flagged” is insufficient to identify which case occurred; capture the actual error or event before deciding.

## Acceptance tests for implementation

Inject connection failure, 429, quota exhaustion, context exhaustion, broken resume history, expired auth, policy denial, pending approval, and unknown failures. Prove bounded fallback, preserved billing/permission constraints, no budget reset, and no repeated external side effects. Simulate crash between checkpoint and dispatch and verify one active writer. Prove cross-provider continuation retains the source patch and acceptance criteria. Simulate a stale desktop screenshot and force fresh observation before interaction.

## Review cancellation settlement

Coding reviews now drain the same inference promise for up to 2.5 seconds after
a deadline abort. Late successful output cannot become an accepted review. Late
normalized failures are merged with the timeout using the existing precedence,
so policy, permission, approval and authentication blocks survive shutdown. If the
promise does not settle, the report records blocking `unknown` with attempt origin
`cancellation_unsettled`. The report retains cost estimates received during the
drain and stops accepting updates before returning. Checkpoint changes still
produce a stale report while retaining failure evidence.

A plain timeout remains nonretryable for reviews. A settled, explicit quota or
outage failure can retain its existing bounded recovery behavior; this change
does not expand those permissions. Local promise settlement is not proof of remote
inference termination. The drain cannot capture errors arriving after its bound,
and historical timeout reports are not retroactively reclassified.

## Explicit reviewer authentication recovery

After repairing the provider login, inspect the saved workflow with
`/clanker review-auth-status <coding-id>`. It returns the current workflow digest
and consumed review-pair budget without probing credentials. An explicit
`/clanker review-auth-retry <coding-id> <workflow-digest>` can reopen review only
when the final saved failure is `auth` from `worker_setup`, its report binds to the
current candidate/review contract, and review budget remains. It rejects prior
policy, permission, approval or unknown failures, pending review continuations,
stale/cancelled candidates and changed workflow digests.

The transition holds the workflow lease and exact coding checkpoint through the
save and rechecks goal authority. It appends a recovery record while preserving
all author/review counts, reports, candidate files and frozen configuration. No
inference occurs and no budget is reset. Normal goal-step/resume performs current
dispatch checks and consumes the remaining review budget; this operation does not
prove the login is fixed. Plain timeouts and other blocks are not eligible.
