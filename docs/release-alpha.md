# Relentless 0.1.0-alpha.4

An MIT-licensed Pi package for bounded coding goals across configured providers.
This alpha is ready for personal trials; general autonomous project delivery is
not established. GitHub distribution uses `alexlopashev/pi-relentless`; npm publication is not part
of this release.

## Install directly from GitHub

```sh
pi install -l git:github.com/alexlopashev/pi-relentless
```

Pi runs npm install and Relentless builds its workers automatically. Node 24.21.0
and the Node/npm distribution of Pi 0.85.1 are the tested versions. No pnpm or manual build is needed for this
path. npm resolves transitive dependencies; use the frozen archive path below if
an exact dependency graph is required.

Standalone Pi 0.87.0 (Bun 1.3.14) is also supported. Launch `pi` normally;
Relentless uses native Bun SQLite and automatically locates Node on `PATH` for
workers and syntax checks. Node remains required; no separate launch command is
needed. Saved SQLite journals can be read by either host.

## Install an archive in another project

Requirements: Node 24.21.0, pnpm 11.19.0, Pi 0.85.1, and Python 3 for verification
helpers. Use a stable installation directory; Pi records its path. The source
checkout is not required after extracting the archive.

```sh
mkdir -p "$HOME/.local/share/relentless/0.1.0-alpha.4"
tar -xzf /absolute/path/relentless-0.1.0-alpha.4.tgz \
  -C "$HOME/.local/share/relentless/0.1.0-alpha.4" --strip-components=1
cd "$HOME/.local/share/relentless/0.1.0-alpha.4"
cp release-lock.yaml pnpm-lock.yaml
pnpm install --prod --frozen-lockfile --ignore-scripts
cd /absolute/path/to/your-project
pi install -l "$HOME/.local/share/relentless/0.1.0-alpha.4"
pi
```

Inside Pi, run `/skill:relentless-configure`, review the proposed roles and billing
policy, then apply the exact proposal through `/relentless config-apply`. Existing
provider authentication stays in Pi; no keys or project settings ship in the
archive. Each project's `.pi/settings.json` carries its Relentless namespace, and
its `.harness` directory retains goals and receipts. For existing sessions use
`/reload` after installation.

No compilation is required for consumers. The archive contains extension source
and prebuilt subprocess workers. Dependencies are installed separately; this is
not a bundled offline runtime. npm excludes `pnpm-lock.yaml`, so the exact lock
is carried as `release-lock.yaml` and restored before installation. The offline
release test uses an already populated dependency store. VM images, model weights,
llama.cpp, and optional external runtimes must be provisioned separately according
to the selected workflow. Do not enable them merely by loading the extension.

Development builds remain available:

```sh
mise run ci
mise exec -- npm pack --pack-destination .harness/alpha-release
mise exec -- python3 tests/package_release_test.py \
  .harness/alpha-release/relentless-0.1.0-alpha.4.tgz .pnpm-store
```

`npm pack` builds workers first and refreshes the release lock. Packaging allows
only runtime code, skills, docs and helpers; it excludes this checkout's settings,
credentials, journals, tests and installed dependencies.

## Verified scope

- Ordinary Pi CLI authoring, independent Qwen/Meta reviews, isolated verification
  and guarded installation completed on a bounded TypeScript fixture (cycle111).
- Commands show immediate footer activity and elapsed time. Goal step/run sample
  saved phases; abort, pause, completion and session replacement clear the footer.
  This reports observed state, not a stream of provider activity.
- An extracted archive loads all four extensions, the configuration skill,
  inventory and a worker subprocess outside the checkout without live inference.
- Model setup proposes an exact project configuration for human review. Routing
  enforces model/effort and billing constraints and uses recorded health/evidence.

## Remaining limits

The measured routing evidence covers Luna/Terra low on a small utility workload.
It does not establish optimal routing for every model or project, and total
workflow cost remains unknown. Available catalog entries are not qualifications.

There is no installed background daemon. Personal-plan foreground restrictions
remain enforced. Full crash reconciliation and active remote cancellation are
not proven; a timeout does not prove remote work stopped. Safety denials and
unresolved approvals remain blockers rather than triggers for bypass.

Wider project delivery, goal revision migration, atomic multi-file/editor
coordination and broader deployment operations remain roadmap work. The local
LLM is optional and disabled by default; loading this package does not download
weights or provision compute. See [roadmap](roadmap.md) and
[validation evidence](validation.md).

## Upgrading from an earlier alpha

This alpha renames the package, `/relentless` command, `relentless` project settings
namespace, `/skill:relentless-configure`, model-callable tools and
`relentless-local` provider. After updating, reload Pi and use the setup skill to
review a fresh project configuration before creating new goals.

Existing journals, proposals and verification/promotion artifacts are not migrated.
Their contracts and hashes include identifiers that changed. Finish or pause old
work with the previous package revision. Keep that revision and its saved state
available for recovery; do not bulk-edit journals or signed/hashed proof bundles.
Prepared VM images must use the new `/relentless-init` entrypoint and
`relentless.result` controller channel. Rebuild them using the updated packaging
instructions before verification. Previously generated service definitions must
also be reviewed and regenerated rather than running both versions together.
