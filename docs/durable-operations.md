# Durable goals: operating guide

The `goal` commands add durable execution to Relentless's existing **tool-free Pi workers**. SQLite holds the contract, every task's attempt count, cooldowns, dependencies, outputs, verification revision and append-only transition events. A process restart does not reset budgets or discard goals. This is not yet an autonomous coding/worktree engine or a native Claude/Codex session manager.

## Create and run

From this checkout, after `mise exec -- pnpm build`:

```sh
mise exec -- pnpm relentless goal create examples/local.goal.json
mise exec -- pnpm relentless goal status
mise exec -- pnpm relentless goal run
```

`create` prints a goal ID and does not invoke a model. `run` stays in the foreground, working on eligible tasks and waiting when providers are cooling down. Ctrl-C stops its child and releases the supervisor lease. `goal once` performs at most one dispatch/reconciliation tick, useful for inspecting recovery. Starting a second supervisor while a live lease exists fails closed.

The local example requires the foreground llama.cpp server described in [local inference](local-inference.md). The scheduler itself does not need that server. When it is unavailable, Relentless persists a retry; it does not start or download it automatically. The example pins the local provider/model, so no cloud substitute is permitted.

The ledger is `.harness/ledger.sqlite` in the current project directory. Run the CLI with that project as the working directory. The compiled CLI path can be absolute when operating in another project; it will use that project's `.harness`. Keep the pinned Node runtime and package dependencies available. The supervisor intentionally dispatches one worker at a time in this release, even if a swarm configuration allows more.

## Contract and acceptance

See `examples/local.goal.json` for a complete contract. Required fields are `objective`, `constraints`, `config` and `tasks`. Each task uses the existing model-quality/effort routing fields plus:

- `acceptance`: either a raw JSON object whose specified top-level keys equal configured primitive values, or a `contains` check requiring every configured string. These are explicit mechanical output checks, not proof of arbitrary software correctness. Write narrow, meaningful predicates.
- Optional `dependsOn`: verified tasks whose output is included as untrusted evidence. Cycles and missing dependencies are rejected.
- Optional `provider` and `model`: exact pins. A model pin requires a provider. Neither may be substituted.
- Optional `allowedCandidates`: limits fallback to named configured routes.

`maxAttempts` is a cumulative **per-task** dispatch budget (default 20), including interrupted dispatches. `deadlineAt` is an optional absolute Unix time in milliseconds. `retryBaseMs` and `retryMaxMs` bound exponential backoff; provider Retry-After is a minimum and is not shortened to fit the cap. A stable jitter value is persisted through the resulting due time. Three invalid outputs park a task for no progress. Revising a goal does not erase attempts or no-progress history.

Workers cannot mark goals complete by saying “done.” Every task must pass its specified predicate at the current contract revision. Accepted outputs have SHA-256 hashes; rejected output is unverified evidence. Large outputs are rejected. Failed provider diagnostics are normalized instead of copying potentially sensitive exception text into the ledger.

Known outages, quota failures, timeouts, context exhaustion and broken-session codes are retryable within the budget. Eligible alternative providers may run when a provider is cooling down, subject to the same exact pins, quality/effort floors and billing policy. Subscription access is still checked by the adapter. There is no silent opt-in to metered usage. Unknown errors, login requirements and approvals wait for input; policy and permission denials remain blocked, including when received after an unrelated contract revision.

The Pi SDK sometimes exposes only textual provider errors. Classification is conservative; an unrecognized error waits for input rather than being guessed to be an outage. Retry-After is honored when available as structured metadata. Where Pi has discarded it, Relentless uses its configured backoff rather than inventing a reset time. Native provider-session resumption is not implemented: known session failures here start a fresh tool-free attempt with the durable contract and evidence.

## Update, cancel and inspect

```sh
mise exec -- pnpm relentless goal status GOAL_ID
mise exec -- pnpm relentless goal events
mise exec -- pnpm relentless goal revise GOAL_ID CURRENT_REVISION updated-contract.json
mise exec -- pnpm relentless goal cancel GOAL_ID CURRENT_REVISION
mise exec -- pnpm relentless goal supersede GOAL_ID CURRENT_REVISION
```

Revisions use compare-and-set checks and preserve task IDs and consumed attempts. All completion evidence is invalidated conservatively when the contract changes. The supervisor interrupts a stale worker; its result cannot satisfy the new contract. Policy blocks remain sticky. Known waiting/input states may be reconsidered by an explicit operator revision; this is not automatic policy clearance. Cancelled and superseded goals are not revived by pending retries.

Memories are explicit contract records: ID, kind, authority, text, source, scope, verification claim and optional expiry. Only records marked as user-authored may be instructions. Facts/hypotheses and dependency output are passed as untrusted evidence; they do not change routing or permissions. Scope is the goal or a named task. Files/chats are not imported automatically, and a worker has no API to promote its own claims into user instructions. Records and their provenance are retained in contract history. Verification flags supplied by an operator are claims, not automatically verified facts about arbitrary external artifacts.

## Crash recovery and storage

SQLite uses WAL, FULL synchronous commits and transactional checkpoint/event updates. Dispatch intent commits before a child starts. Checkpoint hashes and SQLite integrity checks detect corruption; an existing empty or missing checkpoint is an error, not a new project. If a commit fails, no new worker is dispatched. Idle ticks do not append duplicate events. The supervisor lease is renewed every roughly 15 seconds and expires after 30 seconds.

A process kill can leave an uncertain attempt. Recovery waits until its reserved deadline (worker timeout plus 30 seconds), records the interruption and retries only the tool-free operation within the original budget. The child exits when its parent IPC disconnects. Graceful cancellation waits for child cleanup before the tick settles. A failure to confirm cleanup stops supervision. Remote inference may nevertheless continue after a disconnect: no exactly-once inference or billing guarantee is claimed. These rules must not be reused for editing, shell, deployment or desktop workers without fencing their actual side effects.

On sleep, no work executes. On restart, the absolute due times reconcile overdue tasks. Hardware failure and actual disk-full filesystems were not exercised; SQLite commit rejection and corrupt/missing checkpoint faults were injected. Retain free disk space and take backups. Automatic retention/archival is not implemented.

## Backup and restore

Stop the supervisor first. Use a new backup filename:

```sh
mise exec -- pnpm relentless goal backup /absolute/path/relentless-backup.sqlite
```

Restore into a project with **no destination ledger**:

```sh
# Run from that project's directory; use the absolute compiled CLI path if needed.
node /absolute/path/relentless/dist/cli.js goal restore /absolute/path/relentless-backup.sqlite
```

Restore opens the source read-only, validates it and refuses to overwrite a destination. It does not erase the original project or its ledger. A backup with a supervisor lease is rejected. Inspect `goal status` before restarting. Restoring an older backup restores its older budgets and evidence; do not run restored and original copies as concurrent controllers of the same real work. Backups contain private prompts and outputs.

## Automatic process restart on macOS

```sh
mise exec -- pnpm relentless goal service
```

This generates a project-specific launchd plist under `.harness/service/` with absolute Node/CLI paths, working directory, KeepAlive and a 30-second restart throttle. It does **not** install a background service. Install the generated plist in `~/Library/LaunchAgents/` and load it with `launchctl bootstrap gui/$(id -u) /absolute/path/to/the.plist` when enabling login persistence. Use `launchctl bootout` before removing it. Regenerate it after moving the project or changing the pinned runtime path. Service stdout/stderr are discarded; inspect the ledger with `goal status` and foreground startup for diagnostics.

The current environment cannot write `~/Library/LaunchAgents`, so login/reboot autostart is not installed or tested. Plist generation is tested and validated locally. Linux users can run `goal run` under a chosen user service manager; no Linux unit is generated yet. A stopped machine cannot continue execution without remote compute, which is outside this implementation.
