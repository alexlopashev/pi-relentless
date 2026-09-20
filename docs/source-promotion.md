# Recoverable source promotion — cycle 029

`clanker workflow promote <coding-id> <promotion-directory>` installs the frozen
candidate from a verified workflow. It revalidates the saved verification proof
and exact coding checkpoint before invoking the filesystem writer. Repeating the
same command and directory resumes the saved transaction; it does not run models
or tests again. A fresh verification is required when reviewed context changes.

The writer owns a SQLite write fence and a 30-second deadline, including if its
parent process dies. It checks every tracked input before mutation, refuses
symlink traversal. The workflow supplies existing files or explicit absent-original declarations. Each changed file
uses a synced stage, an exclusive rename retaining the original, and a hard link
that refuses to replace a newly appeared target. Recovery syncs complete stages;
partial stages are retained and replaced under a fresh journaled name, at most
three times. Transaction state is validated and synced. Originals and staging
files remain on disk for inspection; there is no automatic cleanup.

This is recoverable per-file installation, not an atomic project update or an
editor lock. Interruption can leave a mixed project or a missing target with its
original retained beside it. Ambiguous state and developer edits stop recovery;
there is no automatic rollback. Open file descriptors can still modify retained
originals. Keep editors quiescent during installation. Native exclusive rename
is exercised on macOS; the Linux implementation has not been exercised here.
The coding workflow accepts explicit `create: true` declarations for files in
existing parents. Deletes and new parent directories remain unsupported.

Successful fixture installations and process-death recovery are tested. The real
Clanker candidate was correctly rejected because a readonly context file had
changed since review: both tracked files stayed unchanged and no filesystem
transaction began. This cycle does not claim a successful live repository
installation. Broader goal-ledger orchestration and measured routing remain work
in progress.

## Goal-bound promotion

When a coding checkpoint has a goal origin, the promotion request includes the
validated goal snapshot and next context expiry. The mutating Python helper takes
locks in goal-then-coding order, compares the saved goal and coding references,
and retains both fences independently of its parent process. It checks the goal
validity deadline before capturing or publishing another file and before reporting
completion. Missing references and changed/cancelled goals fail before source
publication. The transaction still preserves originals and can stop with a file
captured but not installed; keep its backup and journal for reconciliation.

An admitted task may belong to a completed goal. Explicit promotion accepts it
only through the exact stored receipt for the coding ID, origin and checkpoint;
completed status alone grants no access. Cancellation and context expiry remain
binding. Admission records artifact acceptance, not successful source installation.

## Scheduler ownership fence — cycle 067

The internal `promoteWorkflow` API can now receive a captured scheduler lease and
an optional pre-effect authority check. The native installer receives that lease
separately from the immutable promotion request. It checks the live owner under
its goal-ledger lock, rejects a bound longer than the live lease, and checks the
captured expiry before capture, installation and reporting success. A heartbeat
renewal cannot silently extend an already captured authorization.

The lease is not written into the recoverable transaction. After an interrupted
capture, a successor with a fresh valid lease can recover the same transaction
without changing its source/checkpoint identity or overwriting a conflicting edit.
The mutator retains its own goal and coding locks independently of its parent.
Existing goal/context deadlines remain binding alongside scheduler expiry.

Explicit CLI promotion retains its existing user-invoked behavior without a
scheduler lease. The new fence does not itself authorize automatic installation,
prove full independent-review admission or change goal completion semantics.
Connecting automatic promotion to the goal loop still requires an explicit work
contract, admission-grade review checks before mutation and receipts distinguishing
verified artifacts from installed source. Installation remains recoverable per
file, not an atomic project update or an editor lock.

## Goal-controlled installation — cycle 068

Workflow tasks explicitly opting into `acceptance.work.integration: "verified"`
use the installer from Pi goal-step/goal-run after admission-grade inspection.
The immutable request pins the inspected workflow storage checksum as well as
coding and goal evidence. The native mutator holds goal, coding and workflow
locks through installation and rejects stale evidence or competing workflow owners.
The scheduler lease remains ephemeral, allowing authorized recovery by a successor.

A checksummed applied transaction and observed source hashes are required for goal
admission. An interruption between these operations can resume the same transaction.
`sourceApplied` records observation at admission; it does not lock editors or promise
future source equality. Per-file installation remains non-atomic across the project,
and unsupported creates/deletes or authority conflicts require reconciliation.
See [Pi usage](pi-package.md#verified-source-installation--cycle-068).

Cycle 069 additionally pins exact project settings bytes for automatic goal
installation. The native guard uses bounded regular-file reads through directories
opened without following symlinks and checks the digest before capture, publication
and completion. Revocation after capture leaves the original backup recoverable;
it does not silently continue under a new policy. These are boundary checks, not
an atomic lock against settings editors.

## Explicit absent originals — cycle099

The filesystem writer accepts `original: null` as an explicit absent-file
precondition for a writable target in an existing parent directory. It is distinct
from an existing empty file. Initial planning refuses any existing target,
including equal content or a symlink. The original-string path retains its existing
backup and replacement behavior.

A new file is staged with mode 0600, synced, and published by a hard link that
cannot replace a concurrent target. There is no original backup. Recovery after
publication but before the journal update accepts only a target whose contents
and device/inode match the recorded stage. Later removal or replacement stops
recovery, even when replacement content matches. Parent identity, no-follow
traversal, goal/settings/lease guards and bounded partial-stage recovery remain.
Stages are retained; this does not add rollback or multi-file atomicity.

Tests cover creation, repeated recovery, empty content, interrupted publication,
equal-content replacement, concurrent publication, symlinks, writable permission
and missing parents. Coding declarations, snapshots, reviews and promotion requests preserve explicit
absence as `null`. Do not synthesize an empty source file as a workaround.
