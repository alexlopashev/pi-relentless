# Execution isolation status

General behavioral project execution is not enabled. A QEMU TCG prototype now runs a pinned Node runtime and fixed supervised tests of one reviewed Clanker helper; it is not yet a production verification backend. Coding workers run fixed host syntax/JSON checks only; passing them is not evidence that project behavior is correct. A Git worktree is not an execution sandbox.

## Verified environment probe — 2026-09-17

Colima 0.10.3 and Lima are installed; the default Colima daemon was stopped. A dedicated temporary Colima profile was attempted with two CPUs, 2 GiB memory, 8 GiB root/data disk limits, no host mounts, no SSH agent forwarding, no SSH configuration changes, no context activation and no port forwarding. Configuration, cache and Docker client paths were scoped to the temporary directory. No project code or provider credentials were supplied to the VM.

The image downloaded, but the VZ driver failed with `VZErrorDomain Code=2`: virtualization was unavailable on this hardware as exposed to this execution environment. Colima then reported the dedicated profile stopped. Its temporary runtime and downloaded image were removed; diagnostic logs remain under `.harness/self-improve-006/`. This proves that this attempted local backend could not start here; it does not establish that the user's machine cannot run virtualization outside this environment.

The first attempt also established a Colima configuration detail: in version 0.10.3, `COLIMA_HOME` must already exist or Colima falls back to its default location. The retry created that directory inside the allowed temporary root. See the [versioned configuration implementation](https://github.com/abiosoft/colima/blob/v0.10.3/config/files.go) and [Lima environment variables](https://lima-vm.io/docs/config/environment-variables/).

## Required verification before enabling project execution

A backend must run successfully before Clanker treats behavioral tests as available. Verification must cover an immutable runtime image, only explicitly supplied project inputs, no provider credentials or host control socket, disabled network by default, an unprivileged process, bounded CPU/memory/process count/output/time, reliable cancellation/cleanup, and attempts to access resources outside the supplied workspace. Results must bind to the exact tested source and immutable acceptance specification.

A configured endpoint or passing argument-construction unit test is insufficient. The backend needs an actual isolation and failure-recovery demonstration. A user-provided running container backend or separately authorized remote runner can later satisfy this requirement. No cloud resource, remote runner, background service or unrestricted project shell has been enabled.

## Software-emulation feasibility — cycle 022

The installed QEMU 11.0.3 ARM64 emulator successfully boots Alpine Linux 6.12.94-0-virt with TCG in about one second. TCG uses software emulation and does not require the hardware virtualization that blocked the VZ probe ([QEMU system introduction](https://www.qemu.org/docs/master/system/introduction.html)). The kernel/initramfs came from the versioned [Alpine 3.22.5 netboot directory](https://dl-cdn.alpinelinux.org/alpine/v3.22/releases/aarch64/netboot-3.22.5/); URLs, downloaded-byte SHA-256 hashes and the local QEMU binary version/hash are recorded under `.harness/self-improve-022/`.

The prototype supplies 256 MiB guest RAM and one vCPU, explicitly disables NICs and default devices, supplies no host disk/filesystem sharing or control socket, and launches QEMU with a minimal environment. The diagnostic child runs as UID/GID 65534 with zero effective/permitted capabilities and `NoNewPrivs: 1`; its capability bounding set is not zero. The guest exposes only loopback networking. No provider credentials or project code were supplied.

Fixed host-authored fault fixtures verified:

- Parent wall-time enforcement kills and reaps QEMU.
- Parent output enforcement retains at most 32 KiB and kills/reaps an output flood.
- The guest per-process CPU limit kills a busy loop (exit 137).
- The guest process limit rejects excess forks.
- The guest file-size limit stops an oversized write (exit 153).
- The guest address-space limit rejects excessive allocation.

All emulator processes were confirmed stopped. The first unprivileged probe failed because the supplied initramfs root directory was mode 0700; setting only the guest root directory to 0755 enabled the diagnostic. The private init script remains mode 0700. Both that failure and passing evidence are retained.

This is feasibility evidence, not general isolation certification. Guest RAM does not cap emulator host memory, and guest CPU limits are per process. The boot-only diagnostic uses unbounded capture and is suitable only for its trusted fixed output; fault probes use bounded capture. Download hashes pin observed HTTPS artifacts but were not independently authenticated against a signed release manifest. A production backend still needs an authenticated pinned language/runtime image, bounded host resource monitoring, immutable task/acceptance input packaging, protected result collection, and adversarial boundary tests. No arbitrary project test execution, cloud spend or service installation has been enabled.

## Pinned Node and protected results — cycle 023

The public Docker Official Image `node:24.21.0-alpine3.24` ARM64 platform manifest was pinned to `sha256:c90fbae51ca047f2fda9ea92fb85eb936c08e6df18df7462bb782bad7c6afa3d`. The download checks the selected manifest and every layer against its content digest and declared size. Source metadata, layer bytes and guest image hashes are retained under `.harness/self-improve-023/`. This authenticates transport through the official public repository over TLS and checks content integrity; no independent signature verification is claimed.

A prototype assembles guest files into an initramfs in memory; it never extracts downloaded paths or symlinks onto the host filesystem. It strips setuid/setgid mode bits. With 768 MiB guest RAM, one vCPU and a 16 MiB TCG translation cache, Node 24.21.0 passed fixed UID, no-new-privileges, network and host-resource-absence assertions in 3.84 seconds. The bounded parent caps captured output at 64 KiB and enforces wall/CPU termination. An attempted `ps` RSS sampler was denied by the host sandbox; the child was killed/reaped, and the trusted diagnostic was rerun without claiming host-memory enforcement.

A separate virtio-serial channel is writable only by the privileged guest controller. Its descriptor is closed before launching the unprivileged child. The spoof fixture verifies the child cannot open the channel or read the private controller script, and has no inherited channel descriptor. It then prints fake success on ordinary stdout and exits 7; the protected channel correctly reports 7. Node may reuse descriptor number 3 for its own internal descriptor, so the initial test expecting specifically EBADF was corrected to test channel identity and denied writes rather than that number alone. Failure evidence is retained.

The next fixed probe copies the reviewed `src/workflow-runner.ts` and runs three host-authored behavioral cases as UID 65534: a simulated 65-second retry split into three waits, cancellation while waiting, and cancellation before dispatch. All passed in 4.71 seconds. The root controller separately hashes the readonly candidate and test file, and the parent verifies those hashes against the packaged source. Candidate SHA-256 is `043cbbb35d56b545db68660979be056e00aced101b62714c677c1a42ffbe6760`; test SHA-256 is `a7c1de5f63029a01d3496ad04151bf6554ded9816dd44e653df84bc32b2644ee`. The first TypeScript attempt failed under `--jitless` because Node's stripping path required WebAssembly; the passing probe uses normal Node runtime settings inside the VM.

This remains a supervised fixed-code experiment. Protected OS exit status and file hashes are not a generic correctness oracle; they do not prevent arbitrary code from exiting early or falsifying its own test output. A reusable command still needs reviewed input packaging, declared acceptance semantics, result validation, lifecycle/recovery tests and explicit resource guarantees. No general project-test worker, service, automatic integration or cloud spend is enabled. Shared working image/result filenames are overwritten by the prototype scripts; retained `diagnostic-*`, `channel-*` and `candidate-*` snapshots and hashes distinguish their evidence.

## Experimental reusable supervisor — cycle 024

`clanker verify-vm run <manifest.json> <new-directory>` now runs a prepared,
operator-reviewed ARM64 guest image. `clanker verify-vm status <directory>` reads
its terminal record or reports an unfinished run as ambiguous. This is an explicit
experimental command, not an enabled coding-workflow backend.

The strict manifest contains `version: 1`, absolute `emulator`, `kernel` and
`image` artifacts (each `{path, sha256}`), `candidateSha256`, `testSha256`, integer
`wallSeconds` (1–300) and `outputBytes` (1,024–1,048,576). Inputs must be regular
files; kernel, image and emulator are copied into a new private run directory and
checked against their declared hashes. The emulator snapshot is executed. Its
installed shared libraries and firmware are not included in the binary hash.
The image must implement the reviewed `/clanker-init` protocol from cycle 023:
unprivileged test process, closed result descriptor, and a root-only virtio port
reporting exactly `exitCode`, `candidateSha256`, and `testSha256`.

The fixed launch has no NIC, host sharing or monitor; the guest receives 768 MiB
and one CPU. Emulator environment excludes inherited credentials. The supervisor
caps wall time, captured output, emulator CPU time and file writes, handles
SIGINT/SIGTERM, and reaps its child before writing a terminal report. Guest
process restrictions remain the responsibility of the reviewed image. It does
not establish a hard host-memory bound or certify arbitrary supplied images.

A fsynced pending record precedes launch; a fsynced atomic report records the
manifest, protected hashes, exit status, timing and cleanup. Existing directories
are never rerun. If the supervisor is killed without cleanup, `status` reports
`ambiguous`; it does not assert the guest has stopped or automatically replay it.
Operator reconciliation and an external watchdog are still needed for that case.

`outcome: executed` means the protected controller reported exit zero and matching
hashes after a clean emulator exit. CLI exit zero has the same narrow meaning.
Every report explicitly retains `acceptance: not_assessed`: test completion and
correctness need a separately reviewed acceptance oracle. No workflow transition
or automatic promotion consumes this result yet.

The public command ran the existing reviewed scheduler fixture in 5.27 seconds,
with matching source/test digests and a reaped emulator. Its report is retained in
`.harness/self-improve-024/live/`. Twelve offline tests cover successful evidence,
stdout spoofing, mismatched/missing/duplicate/oversized controller output, time
and output bounds, credential exclusion, changed executable bytes, FIFO inputs,
non-replay of pending runs, and CLI cancellation. Prototype image preparation
remains separate; a reusable source-to-image builder and acceptance integration
are the next implementation steps.

## Reusable source and test packaging — cycle 025

`clanker verify-vm package <package.json> <new-directory>` now creates a prepared
image and `manifest.json` for `verify-vm run`. Packaging launches no emulator and
executes no supplied source or tests. The package request contains:

- `version: 1`, `emulator`, `kernel`, `baseImage`, `wallSeconds`, `outputBytes`.
  Artifact objects contain absolute regular-file `path` and pinned `sha256`.
- `sources` and `tests`: separate maps from relative workspace paths to artifact
  objects. Each map contains 1–500 files; files are capped at 8 MiB and combined
  source/test bytes at 32 MiB. JSON requests are capped at 64 KiB.
- `entrypoint`: a supplied JavaScript/TypeScript test path.

Workspace path segments start with an ASCII letter, digit or underscore and
contain only those characters plus dots and hyphens; total paths are at most 240
characters. Traversal, absolute paths, duplicates and file/directory collisions
are rejected. Tests and source are distinct immutable inputs. Dependency files
must be explicitly supplied or already present in the reviewed runtime; there
is no package installation or network fetch.

The builder hashes the exact source/test bytes, creates a deterministic readonly
`/workspace` overlay and a root-only controller, and appends it to the pinned base
without extracting archive members on the host. Linux explicitly supports
[concatenated initramfs archives](https://www.kernel.org/doc/html/latest/driver-api/early-userspace/buffer-format.html).
The combined image must satisfy the runner's 512 MiB input ceiling before a
manifest is published. Existing output directories are never overwritten.

The base is still an operator-reviewed executable artifact. It must supply the
compatible BusyBox/Node runtime and must not contain conflicting `/workspace` or
`/clanker-proof` entries, symlink ancestors or alternate startup behavior. The
builder does not inspect or certify arbitrary base archives. The live example
reuses the reviewed cycle-023 image; its earlier fixture files remain in that
base, though the new controller and workspace drive this run.

For packaged runs, `candidateSha256` hashes the canonical sorted source-file
manifest; `testSha256` hashes the canonical test-file manifest **including the
entrypoint**. These are bundle digests, not individual file digests. The root
controller checks every listed source/test file before and after the test process
and reports the bundle digests over the protected channel. The process runs as
UID 65534 with no-new-privileges and the existing guest limits. It cannot write
the supplied files, root metadata or result channel. As before, a malicious or
inadequate test can still exit early: acceptance remains explicitly unassessed.

The next integration step is selecting the exact saved coding checkpoint and
reviewed acceptance specification, then interpreting this evidence within the
workflow. This command does not yet transition workflows or promote changes.

## Binding a reviewed coding checkpoint — cycle 026

`clanker workflow package <coding-id> <specification.json> <new-directory>` now
selects the exact saved candidate from the project's coding/workflow journals and
calls the package builder. The specification uses the cycle-025 package shape
without `sources`: callers supply pinned runtime artifacts, tests, entrypoint and
limits, while source files come exclusively from the journal. Working-tree edits
and exported proposal files cannot replace those bytes.

The workflow must be at `verification_required`, and its reviewed checkpoint hash
must match the current `ready_for_review` coding snapshot. Packaging rechecks the
journal after image creation. A changed prompt, revision, cancellation or other
checkpoint change prevents a binding from being published. Read-only pinned
journal inspections cannot perform this operation. Specification input is limited
to 64 KiB using regular-file checks and bounded nonblocking reads.

On success, the output includes `inputs/`, `package.json`, `image/manifest.json`
and `binding.json`. The binding records coding ID/revision, reviewed checkpoint,
normalized specification hash and exact package-request hash. Run the prepared
manifest with `verify-vm run <directory>/image/manifest.json <new-run-directory>`.
Existing output directories are never reused; failed packaging can leave a
partial directory, but no binding is published.

A binding is historical evidence, not a lock on future journal revisions. Any
future acceptance consumer must revalidate both the current checkpoint and the
packaged specification/evidence. This command leaves the workflow unchanged and
retains `acceptance: not_assessed`; it neither executes tests nor grants promotion.
The resulting VM report still requires explicit acceptance interpretation.

A real reviewed coding run (`3051ee5a-4776-4404-9842-51ddd7e52b89`, checkpoint
`2da1c1806c11e5010c263116db87aec3545e1dd950a8ec5e23e025242c377b05`)
was packaged through the public command. Its repair-prompt helper passed four
fixed host-authored cases in 4.72 seconds inside the VM with matching protected
bundle digests and a reaped emulator. Evidence is in `.harness/self-improve-026/`.

## Declared-rule workflow verification — cycle 027

`clanker workflow verify <coding-id> <execution.json> <new-directory>` now performs
checkpoint selection, packaging, VM execution and evidence assessment in one
command. Its strict execution specification is:

```json
{
  "package": "the complete cycle-026 package specification object",
  "acceptance": { "kind": "test_process_exit", "expected": 0 }
}
```

Replace the illustrative `package` string with the actual object. The rule is
mandatory and declared before packaging or execution. It accepts only a clean,
reaped emulator run whose protected controller reports test-process exit zero
and the exact expected source/test bundle hashes. The host also verifies runtime
pins, resource limits and the report's manifest binding. Failure, interruption,
missing or mismatched evidence cannot satisfy the rule. The reviewed checkpoint
is rechecked after execution; a stale result receives no assessment.

`execution.json`, the package/binding files and `run/report.json` remain together.
An fsynced atomic `assessment.json` records the decision, rule and checkpoint,
specification and report hashes. CLI success requires `accepted: true`; a normal
failed test produces an assessment with `accepted: false` and a nonzero exit.
A missing terminal report remains ambiguous, without automatic replay. Each
invocation requires a new directory.

Acceptance here means exactly that the declared test-process exit rule was
satisfied. It does not demonstrate that arbitrary tests are complete or cannot
exit early, and does not establish overall goal completion. Test adequacy remains
part of reviewing the operator-supplied specification. Assessments are historical
and must be revalidated against current state before later use. The command does
not change the workflow phase, revise failed candidates or promote source yet.
Those are the next integration steps.

## Durable workflow outcomes and reconciliation — cycle 028

`workflow verify` now records the assessed result in the workflow journal. A
passing declared rule transitions to `verified`; the foreground runner stops at
that state. This means the configured verification rule passed for that exact
reviewed checkpoint, not that source was installed or the overall project goal
was completed. Resuming a verified workflow rechecks the coding snapshot.

An actual `test_process_failed` result enters the existing repair-intent path if
both coding attempts and review pairs remain. It retains the original requirements,
adds at most 8,000 characters of test output as untrusted evidence, and requires
fresh independent review and verification after the repair. Exhausted budgets
block explicitly. Interrupted, timed-out or invalid execution stays at
`verification_required`; it does not spend a coding attempt trying to fix an
infrastructure failure. No retry policy or budget is silently expanded.

A coding-journal write transaction fences the snapshot check and workflow commit,
preventing another writer from revising/cancelling the coding run in that interval.
The receipt stores checkpoint, specification and report hashes plus the outcome.
Repeating an already-recorded receipt does not schedule another repair; a repeated
accepted receipt also checks that its checkpoint is still current.

If execution and assessment finish but the workflow commit is interrupted, use
`workflow reconcile-verification <coding-id> <verification-directory>`. It checks
the saved specification, binding, manifest, report and assessment, recomputes the
decision, and records the result without another VM or model call. Missing,
changed or stale evidence is rejected. This recovers only complete assessments;
it does not infer whether an emulator with no terminal report has stopped.

The live cycle-028 run transitioned the existing independently reviewed helper to
`verified`. Reopening through `workflow run` returned that terminal state without
provider dispatch; reconciliation of the same evidence was idempotent. Offline
tests additionally cover test-failure repair, preserved cumulative budgets,
large-log truncation, concurrent coding-write exclusion and interruption between
assessment and journal commit. Source promotion remains separate and unfinished.

## Cycle 029: recoverable source promotion

Explicit `workflow promote` now revalidates verified evidence and installs the
frozen candidate with a writer-owned checkpoint fence, retained originals and
recoverable staging. The live repository check rejected changed review context
without modifying either tracked file. See [the command contract and limitations](source-promotion.md).
Automatic goal-to-promotion orchestration remains unfinished.
