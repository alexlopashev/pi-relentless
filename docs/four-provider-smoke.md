# Four-provider live smoke — 2026-09-17

Task: identify and correct `function isAdult(age) { return age > 18; }` for a rule that adulthood starts at age 18 inclusive. The checked response is `{"fixedExpression":"age >= 18","testInput":18,"testExpected":true}`.

| Worker                     | Pin / effort                       | Observed result                                                                                   |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Grok through Pi            | `xai/grok-4.6`, low                | OAuth preflight passes. Task failed; isolated diagnostic received HTTP 403. No successful answer. |
| Claude Code CLI            | `claude-opus-5`, low               | Correct checked JSON, native Pro subscription login. Included-only billing was not established.   |
| Codex through Pi           | `openai-codex/gpt-5.6-luna`, low   | Correct checked JSON using Pi OAuth.                                                              |
| Local llama.cpp through Pi | `relentless-local/qwen3.5-4b`, off | Correct checked JSON; Q4_K_M on CPU, no cloud credentials.                                        |

The live ledger goal is `709ffa8d-15c8-4fc6-b946-170eb612e63e`, revision 2. Claude, Codex and local tasks completed; Grok remains `waiting_input`, with its original normalized `unknown` failure and two attempts. One separate diagnostic request established HTTP 403; historical ledger events were not rewritten or budgets reset. HTTP 401/403 normalization is now tested for future Pi errors. Revision 1 encountered global Pi credential-lock permissions and native Codex startup failure. Revision 2 used read-only Pi credentials and switched the Codex adapter explicitly while preserving the model and effort.

This is an integration smoke test, not a quality benchmark or autonomous coding demonstration. Acceptance values are supplied in the worker contract. The workers reviewed text; they did not edit a project, run build tools or deploy. Pi tools are disabled; Claude runs safe-mode with an empty tool list. Native Codex is experimental and unverified here; rejecting tool events after execution is not a sandbox guarantee.

## Billing finding and current behavior

The initial Claude calls passed an OAuth/Pro authentication check. Review found that this does not prove paid usage credits are disabled. [Anthropic documents that usage credits apply to Claude Code](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans). Actual billing for those calls was not verified. The corrected adapter blocks future native Claude calls with `approval` when `allowMetered` is false. Enabling metered usage requires explicit user authorization; it is not a recommended workaround for this example. A verified included-only control remains open.

## Reproduce and inspect

`examples/four-provider.goal.json` preserves the four pinned tasks with metered usage disabled. Consequently a fresh run with the corrected adapter will pause Claude for billing authorization, and Grok may still fail access checks. It is deliberately not presented as a passing fixture.

```sh
mise exec -- pnpm build
mise exec -- node dist/cli.js goal status 709ffa8d-15c8-4fc6-b946-170eb612e63e
# New live run, after addressing provider access and billing constraints:
mise exec -- node dist/cli.js goal create examples/four-provider.goal.json
mise exec -- node dist/cli.js goal run
```

The local server must be started separately as documented in `local-inference.md`. Its smoke-test process was stopped after use. `readOnlyAuth: true` reads existing Pi login credentials without creating lock files; it cannot refresh expired credentials. Authenticate or refresh through Pi's normal `/login` outside the restricted runner. No credentials were copied into this project or included in the evidence.

## Grok routing repair

The installed Pi 0.85.1 xAI provider used `https://api.x.ai/v1` for OAuth requests. Relentless now clones the selected subscription model with `https://cli-chat-proxy.grok.com/v1` and the OAuth proxy headers. Explicitly metered routes retain the public endpoint. The required client-version header carries Pi's actual exported version; client identifier/User-Agent identify Relentless. No Grok release version is fabricated. Source: [xAI endpoint and header implementation](https://github.com/xai-org/grok-build/blob/b189869b7755d2b482969acf6c92da3ecfeffd36/crates/codegen/xai-grok-shell/src/agent/config.rs#L4640).

After the user refreshed Pi's login, a bounded new goal (`f1895257-d4fa-43ec-af48-e7860d042098`) exposed HTTP 426 for the missing client-version header. With version negotiation added, goal `fe55569c-aff7-457e-baac-28f6454989df` and a separate redacted diagnostic reached **HTTP 402: “Grok Build usage balance exhausted.”** The earlier unknown ledger outcomes remain historical evidence; budgets were not reset. This establishes a current account usage blocker, not a missing login. It does not establish when the balance resets or whether every model is affected.

The updated failure normalizer recognizes Pi's HTTP wrapper and this specific exhaustion response as `quota`; generic HTTP 402 stays unknown, and policy denials retain precedence. No additional live inference was attempted after identifying exhaustion. A successful Grok answer remains unverified until account capacity is available. Metered fallback remains disabled. The read-only runner still cannot refresh credentials itself; normal Relentless execution outside this sandbox uses Pi's normal credential storage unless read-only mode is selected.
