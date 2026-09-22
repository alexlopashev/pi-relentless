# Muse Spark 1.3 Contributor — direct Meta API

The user selected Contributor and has a key issued by dev.meta.ai. Relentless now registers a direct `meta` provider with Pi, using `https://api.meta.ai/v1`, the Responses API, and exact model ID `muse-spark-1.3-contributor`. OpenRouter is not required. The project extension `.pi/extensions/meta-provider.ts` and Relentless workers share the same provider definition. Built-in gateway models remain unchanged.

Endpoint/protocol and reasoning support are based on [OpenClaw's direct Meta integration documentation](https://docs.openclaw.ai/providers/meta), which links Meta's model, pricing and reasoning references. Those Meta pages require login in this environment. Direct inference with the user's saved Pi key is now verified at low effort; see live evidence below.

## Save the key

From this project directory:

```sh
mise exec -- pnpm exec pi
```

Run `/login`, select **Meta Model API** (`meta`), and enter the Meta-issued key in the secret prompt. Restart Pi if it was already running before this extension was added. Pi saves the key in its credential store; do not paste it into chat or project files. The runtime resolves only credentials stored for `meta`, never an OpenRouter key. When Relentless is used from other repositories, its direct worker registration still works; the project-local interactive login extension must be loaded explicitly if logging in elsewhere.

## Activation and limits

`examples/muse.config.json` and `examples/muse.tasks.json` now use the direct Meta route. The candidate remains disabled and `allowMetered` remains false. API activation still requires those settings to be explicitly enabled; a saved key alone never authorizes metered fallback. This does not use a Muse Code subscription.

After billing activation, a user-initiated smoke test is:

```sh
mise exec -- pnpm build
mise exec -- node dist/cli.js swarm <activated-config.json> examples/muse.tasks.json
```

The adapter advertises minimal/low/medium/high/xhigh, disables off and max, and uses conservative 65,536-token context and 8,192-token output caps. These caps are harness policy, not provider maxima. Quality 2 remains a policy tier, not a measured capability claim. The model is available to the same Pi brainstorm, review, durable tool-free and bounded coding-worker paths; only durable goals have persistent cooldown/fallback handling.

Contributor pricing metadata is $0.10/M input, $0.20/M output and $0.002/M cached input, as documented by the integration above. It is descriptive metadata, not a hard spending limit. Contributor prompts and outputs may be used to improve Meta's products; the user explicitly selected this variant after that distinction was explained.

## Live verification

The saved `meta` API-key login resolved successfully. Three user-initiated direct Contributor requests were made. The first two received responses but failed the requested JSON-only format because Relentless's shared system prompt mandated reviewer assumptions. A failing regression reproduced that prompt conflict; the system prompt now honors each task's output format and makes reviewer commentary conditional. The third response parsed exactly as `{"echo":"relentless-muse"}`.

Verified run: `.harness/runs/3da0a345-ad46-4cfb-93a7-2af442c1847b/`. Local activated single-provider config and machine-checked evidence: `.harness/muse-smoke/`. The checked-in example stays disabled; existing subscription configs were not given metered fallback. No credentials were copied or printed. This proves authentication and a simple low-effort request, not coding quality or every reasoning level.
