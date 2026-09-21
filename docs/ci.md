# Continuous integration

Automatic CI runs one Ubuntu job on pull requests and pushes to `main`. Feature
branch pushes do not trigger a second copy. New commits cancel superseded checks.
The job has a five-minute limit and caches the pnpm dependency store.

The automatic gate installs frozen dependencies with build scripts disabled, then
checks formatting, TypeScript types, and four focused test files covering routing,
failure classification, session lifecycle and project configuration. It does not
run coverage, the full test suite, VM/process tests, package builds, installation
smokes or macOS runners. This keeps routine checks lightweight; a green quick job
is not evidence that the full release gate passed.

Use GitHub Actions → CI → Run workflow for the full Ubuntu gate and both package
installation checks. That manual job has a twenty-minute limit. It is not a
prerequisite for every documentation or naming change. The complete local gate
remains `mise run ci`; full release validation also includes the source-install
and archive tests documented in the README. No macOS GitHub runner is configured.
