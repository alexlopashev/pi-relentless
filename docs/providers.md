# Provider feasibility — checked 2026-09-16

| Requested model         | Installed Pi 0.85.1 ID                                      | Initial path                           | Evidence and limit                                                                                |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GPT-6-Astra             | `openai-codex/gpt-6-astra`                                  | Pi subscription OAuth                  | Catalog entry verified; user's entitlement and quota not tested                                   |
| GPT-5.6 and below       | `openai-codex/gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol` | Per-task policy tiers                  | Configuration can select smaller models; no cost/quality benchmark yet                            |
| Grok 4.6                | `xai/grok-4.6`                                              | Pi subscription OAuth                  | Pi documents Grok/X subscription login; specific plan and account not tested                      |
| Claude Opus 5           | `anthropic/claude-opus-5`                                   | Experimental native Claude Code worker | Official notice preserves subscription usage for CLI/Agent SDK; current Pi route remains disabled |
| Muse 1.3, Kimi, MiniMax | Not selected                                                | Future adapter/catalog work            | Verify exact provider, version, entitlement and billing before configuration                      |

Sources:

- [Pi providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md): subscription and API authentication paths. This is integration documentation, not proof of any individual account's entitlement.
- [OpenAI authentication](https://developers.openai.com/codex/auth/): distinguishes ChatGPT subscription sign-in from usage-based API keys. Official guidance recommends API keys for programmatic CI/CD; local subscription workflows and unattended remote automation should not be conflated.
- [Claude Code authentication](https://code.claude.com/docs/en/authentication): native Claude Code supports subscription sign-in, with credential precedence that can select API billing in noninteractive mode when an API key is present. A native worker needs explicit authentication verification.
- [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md): model selection and agent session integration.
- Installed package declarations and built-in model catalog: implementation authority for this pinned release. Upstream main may change independently.

An unanswered question remains: the user's exact plans. We have not logged in, inspected credential contents, issued live inference, or claimed successful access to any of the accounts. Live catalog presence is not live model availability. No provider-policy workaround or browser scraping is part of the design.

## Correction: native Claude Code subscription workers

The earlier blanket conclusion about Claude subscription access was incorrect. [Anthropic's current notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) explicitly pauses the previously announced billing change. CLI/Agent SDK subscription access remains available. The older proposal is preserved below that notice and must not be treated as the active policy. Pi's direct-provider documentation does not establish the billing behavior of native Claude Code.

Decision: implement a separate `claude-code` execution adapter. Clanker will launch the native CLI as a child process, select the explicit model and effort, set a task working directory, read structured output, and manage its lifetime. Pi workers remain available for other providers. This is a supported programmatic integration, not a terminal-screen automation workaround.

[Claude's programmatic usage docs](https://code.claude.com/docs/en/headless) describe `claude -p` and JSON output. Local Claude Code 2.1.273 exposes model, effort, session, permission, tool, and output-format controls. Avoid `--bare` for this route: it bypasses subscription credentials. Verify the active login and reject API-key/provider overrides rather than silently spending. Use safe-mode/tool controls appropriate to each task; do not inherit arbitrary hooks for a tool-free brainstorm. Handle quota exhaustion, cancellation, process cleanup, malformed or unsuccessful results, and resumable session identity.

The experimental native adapter produced a correct Opus 5 response in the live smoke run. Review then identified an incomplete billing check: Pro/Max authentication alone does not show whether separately billed usage credits are enabled. Future native Claude runs therefore pause with `approval` unless `allowMetered` is explicitly authorized. No included-only verification mechanism is implemented yet. [Anthropic documents that usage credits also apply to Claude Code](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans). Do not enable the Pi Anthropic subscription route merely because the native CLI supports it. See [the live results](four-provider-smoke.md).

Grok integration correction: xAI subscription requests now use the official CLI OAuth proxy, with required proxy headers, Pi's actual client version and explicit Clanker identity. Public API routing remains reserved for explicitly metered candidates. After a fresh Pi login, live verification reached HTTP 402 “Grok Build usage balance exhausted.” Account login works; successful inference awaits capacity. See [evidence](four-provider-smoke.md#grok-routing-repair).

Alibaba Personal trial: Pi's built-in `qwen-token-plan-individual` provider is now admitted as subscription access with API-key authentication and an exact dedicated Token Plan endpoint check. This is distinct from general metered API access and the broader Team catalog. See [setup and bounded interactive example](alibaba-personal.md). Live Qwen3.6 Flash verification passed through the saved Pi Personal key; this does not enable unattended subscription use.

Personal catalog supplement: project Pi and Clanker now add DeepSeek V4.1 Flash and GLM 5.3 where upstream lacks them. Examples default to Qwen3.8 Flash and include explicit Qwen3.8 Max, DeepSeek and GLM routes. Existing model pins remain unchanged. See [catalog details](alibaba-personal.md#current-coding-catalog).
