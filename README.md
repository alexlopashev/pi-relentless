# Relentless

A Pi package for durable, local-first coding goals across model providers.
Relentless adds persisted progress, constrained model routing, bounded coding and
independent review, isolated verification, and guarded installation of verified
changes. Its commands and configuration live inside Pi.

**Alpha software:** small coding workflows have completed end to end. General
unattended project delivery and globally optimal model selection are not proven.

## Install

With Node **24.21.0** and Pi **0.85.1** installed, run this from your project:

```sh
pi install -l git:github.com/alexlopashev/pi-relentless
pi
```

Omit `-l` to install globally. Git installation installs production dependencies and builds
the worker entrypoints automatically using npm; consumers do not need pnpm or
mise. The compiler and pinned Node type definitions are included for this build. If Pi is already open, use `/reload` after installation. Git installations
track the repository by default; append `@<commit-sha>` to pin a reviewed revision.

The package is distributed through GitHub. There is no npm release yet, so it is
not yet listed in [Pi's npm package catalog](https://pi.dev/packages).

## Configure a project

Authenticate through Pi's `/login`, then run:

```text
/relentless inventory
/skill:relentless-configure
```

The skill discovers session-visible models and proposes role assignments and
routing policy. Review the proposal, then use its exact `/relentless config-apply`
command to approve it. Discovery does not authorize model calls or prove account
capacity or model competence.

Project configuration uses the `relentless` namespace in `.pi/settings.json`.
Private goals, budgets, cooldowns and receipts live in that project's `.harness/`.
The package ships no credentials, personal configuration or run journals.

## Run a bounded goal

Define the task, permitted files, verification contract and attempt limits using
[the goal setup instructions](docs/pi-package.md#creating-a-goal-inside-pi--cycle080).
Then use:

```text
/relentless goal-create <contract-json>
/relentless goal-step <goal-id>
/relentless goal-status <goal-id>
/relentless goal-run <goal-id>
/relentless pause
```

`goal-step` advances one eligible action. `goal-run` advances a permitted foreground
loop. The footer shows activity, elapsed time and observed saved phases. Pausing
retains journals and consumed budgets. A local cancellation does not prove that
remote inference has stopped.

Verification requires separately provisioned execution assets and Python 3; see
[execution isolation](docs/execution-isolation.md). Merely installing Relentless does
not provision VMs, download model weights, run coding workers or spend on cloud
compute.

## What is implemented

- Pi commands and model-callable inventory/configuration proposal tools.
- Project-specific author/reviewer roles and model/effort/billing constraints.
- Durable goals, frozen coding snapshots, retry state and cumulative budgets.
- Permitted fallback after temporary provider failures; policy denials and
  unresolved approvals remain blockers.
- Bounded code edits, independent review, test/repair loops and verified source
  installation under explicit contracts.
- Workload-specific calibration and routing from recorded acceptance/timing.
- Optional local inference through llama.cpp; scheduling works without an LLM.

Live evidence includes quota-to-provider fallback, restart recovery, repair after
a failed test, and ordinary Pi CLI authoring/review/verification/installation.
See [validation](docs/validation.md) and [project acceptance](docs/project-acceptance.md).

There is no installed background daemon. Full crash reconciliation, active remote
cancellation, broader project delivery and comprehensive model cost/capability
qualification remain unfinished. Provider access and subscription constraints
vary; see [providers](docs/providers.md), [local inference](docs/local-inference.md)
and [roadmap](docs/roadmap.md).

## Develop and verify

```sh
./scripts/bootstrap
mise run ci
mise exec -- python3 tests/package_git_install_test.py
mkdir -p .harness/releases
mise exec -- npm pack --pack-destination .harness/releases
mise exec -- python3 tests/package_release_test.py \
  .harness/releases/relentless-0.1.0-alpha.3.tgz .pnpm-store
```

Development uses pinned mise/pnpm tools and a frozen pnpm lockfile. Pi's Git
installer uses npm; transitive resolution there is not locked by pnpm. The
[archive installation](docs/release-alpha.md) preserves the frozen production
dependency graph when reproducibility is required.

The Pi SDK is a runtime dependency because Relentless also launches separate worker
processes; those processes cannot rely on Pi's in-process extension module loader.
No Pi dependency is bundled into the archive. This is intentional rather than a
claim that host-provided extension imports cover subprocesses.

See [architecture](docs/architecture.md), [Pi commands](docs/pi-package.md) and
[release notes](docs/release-alpha.md).

## License

[MIT](LICENSE) © 2026 alexlopashev.
