# Model inventory

```sh
mise exec -- node dist/cli.js inventory <config.json>
```

This read-only command describes every configured candidate. It does not run inference or activate a disabled route. It combines the installed Pi catalog, saved authentication status and the current project's hashed goal and coding SQLite records. No missing journal is created. Credential values and raw authentication errors are never included in the report.

Fields remain deliberately separate:

- `enabled`: the configuration switch.
- `catalogPresent`: whether Pi has that exact provider/model.
- `authentication`: present, missing or unverified. Presence is not proof that a token remains valid, an account has entitlement, or quota is available. Native Claude/Codex CLI and local runtime checks remain unverified.
- `billingAllowed`: whether the billing category is allowed by the config; this is not proof of subscription coverage. Execution still uses its existing access guard.
- `efforts` and `supportedEfforts`: Pi's advertised levels and their intersection with the configured levels. Partial-map handling matches pinned Pi 0.85.1 semantics. This is metadata, not proof that an upstream service accepts every level.
- `cooldownUntil`: the longest unexpired provider cooldown recorded in this project's goal ledger or coding journal. `cooldownSource` is a combination of `ledger`, `coding_journal` and `workflow_journal`, or `none`. An absent cooldown does not establish available quota, and histories from other projects or isolated demos are not imported.
- `capacity`: always `unverified` in this read-only inspection. A successful live evaluation supplies separately timestamped evidence.

The inventory informs explicit candidate configuration and evaluation selection; it does not automatically enable new models, buy access or replace task constraints. Local model-server health, native CLI entitlement checks and active refresh remain pending. See [evidence-based routing](model-efficiency.md).

Each coding inspection uses a read-only SQLite snapshot and validates stored hashes and checkpoint invariants. Corruption in either source fails the report rather than silently omitting evidence. The sources are sampled separately, so their union is observational, not an atomic scheduling snapshot. This report does not yet make goal and coding dispatchers share state. Database contents and file permissions remain unchanged; SQLite may manage its normal read-only WAL coordination sidecars.

Cycle 055 adds `oauthFreshness`: `fresh`, `refresh_required` or `not_oauth`,
computed from stored credential type/expiry only. The five-minute window matches
Pi's documented default OAuth validity requirement. Presence and quota remain
separate. `not_oauth` does not mean authenticated or usable. No token values are
reported, and inventory does not refresh credentials. Read-only coding workers
reject refresh-required OAuth as `auth` before runtime/session creation.

Cycle 057 includes reviewer cooldowns from a sibling `workflows.sqlite` when
present, using a read-only validated workflow snapshot. Missing workflow journals
are not created; corrupt state fails inspection. These observations inform route
previews. Shared reviewer dispatch uses the workflow journal directly; the
author/goal dispatchers do not yet share one transactional health ledger.

## Active Pi session

Prefer `/clanker inventory` for project configuration inside Pi. The native command
uses that session's full/available registries and scope, alongside project roles
and recorded provider health. The CLI remains useful outside Pi but can load a
different set of extensions. Neither interface proves capacity or task competence;
see [session semantics](pi-package.md#session-model-inventory--cycle088).
