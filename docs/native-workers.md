# Native CLI worker status

Relentless's worker process supports `claude-code` and `codex-cli` backends. They
run bounded, tool-free subprocesses in a temporary directory and return text or
edit proposals. Authentication is checked through the installed CLI. This is not
an unrestricted tool-using Claude Code session.

Pi's interactive routing currently intersects project candidates with its native
model registry. Those CLI backend identifiers are not registered Pi providers,
so merely adding them to project roles does not make them eligible. Inventory and
configuration proposals now report that limitation explicitly. A bridge into Pi
routing, including provider identity and reviewer independence, remains unfinished.

Claude's existing worker also rejects dispatch when `allowMetered` is false:
Claude subscription authentication does not establish that separately billed extra
usage is disabled. Configuration discovery must preserve that setting and report
the blocker, not turn it on or promise subscription-only execution. A proper
subscription-only enforcement path remains required before this can meet a strict
no-metered-spend policy. No CLI is executed merely to produce this diagnostic.

Use `openai-codex` from the active registry for Pi's discovered Codex subscription
models. Do not infer Claude API or OpenRouter entitlement from a Claude Code login.
