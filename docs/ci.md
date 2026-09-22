# Continuous integration

Automatic CI runs one Ubuntu job on pull requests and pushes to `main`. Feature
branch pushes do not trigger a second copy. New commits cancel superseded checks.
The job has a five-minute limit and caches the pnpm dependency store.

The automatic gate installs frozen dependencies with build scripts disabled, then
checks formatting, TypeScript types, and five focused test files covering routing,
runtime compatibility, failure classification, session lifecycle and project configuration. It does not
run coverage, the full test suite, VM/process tests, package builds, installation
smokes or macOS runners. This keeps routine checks lightweight; a green quick job
is not evidence that the full release gate passed.

Use GitHub Actions → CI → Run workflow for the full Ubuntu gate and both package
installation checks. That manual job has a twenty-minute limit. It is not a
prerequisite for every documentation or naming change. The complete local gate
remains `mise run ci`; full release validation also includes the source-install
and archive tests documented in the README. No macOS GitHub runner is configured.

Standalone compatibility is an offline local check after building:
`RELENTLESS_TEST_BUN=/absolute/path/to/bun RELENTLESS_TEST_PI=/absolute/path/to/pi python3 tests/standalone_runtime_test.py`.
It tests SQLite recovery, mixed-runtime locking/checkpoints, Node worker startup,
syntax validation and the real standalone extension loader without model calls.
Without those explicit executables the two tests skip; the lightweight Ubuntu
PR job does not install additional runtimes.
