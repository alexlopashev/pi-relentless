# Alibaba Token Plan Personal trial

Relentless uses Pi's built-in `qwen-token-plan-individual` provider and its narrower Personal catalog. Authentication is an API key from the Personal subscription, saved through Pi's `/login` → Qwen Token Plan (Individual). Do not put credentials in this repository or chat. This is not a purchase flow.

The adapter permits subscription billing for this provider only when Pi reports API-key authentication and the model has the exact dedicated endpoint `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`. Missing/mismatched endpoints fail before inference. Generic Alibaba API keys/endpoints are not an automatic fallback. The endpoint selects subscription quota; an API key is not inherently evidence of metered billing.

The initial trial is one user-initiated, tool-free code review using `qwen3.6-flash`, thinking off, one worker and a 60-second deadline. No durable goal, scheduled service, quota polling or metered fallback is started. Alibaba's [Personal rules](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/token-plan-personal-overview) restrict the subscription to interactive coding/agent tools; this example does not authorize unattended use. Model entitlement and reasoning support require a live check; model availability in Pi alone is not proof of account access.

```sh
mise exec -- pnpm exec pi
# /login → Qwen Token Plan (Individual), enter your subscription key in Pi
mise exec -- pnpm build
mise exec -- pnpm relentless plan examples/personal.config.json examples/personal.tasks.json
mise exec -- pnpm relentless swarm examples/personal.config.json examples/personal.tasks.json
```

The example uses read-only Pi authentication because this Codex sandbox cannot write Pi's global credential store. It reads the existing key, never copies it to local artifacts. Request/result artifacts are saved under `.harness/runs/`. The expected result for the adulthood boundary task is `{"fixedExpression":"age >= 18","testInput":18,"testExpected":true}`; inspect and validate the output, not just the worker completion status.

## Live verification

Passed through the actual Relentless CLI using the saved Pi Personal credential, `qwen3.6-flash`, thinking off, one request and no metered fallback. Run: `7bd982f8-255a-495d-86d4-4017ada6cb08` under `.harness/runs/`.

Returned JSON:

```json
{
  "fixedExpression": "return age >= 18;",
  "testInput": { "age": 18 },
  "testExpected": true
}
```

An independent local JSON check confirmed the inclusive comparison and boundary result. The answer uses a return statement and an object-shaped input rather than the illustrative expression/number above; this example prompt did not impose an exact JSON schema. It is a successful connectivity and simple reasoning smoke, not proof of arbitrary coding capability or access to every Personal model. No model-generated code was executed.

Full gate: 96 unit tests plus lifecycle/process checks, lint, types, build and formatting passed. Independent integration review found no blockers.

## Current coding catalog

Pi 0.85.1 was still the latest published npm version when checked. A project-local supplement adds `deepseek-v4.1-flash` and `glm-5.3` through Pi's public provider-registration API, preserving the built-in Personal models and saved subscription authentication. No dependencies or global credential/catalog files were changed. The source is `src/personal-catalog.ts`; `.pi/extensions/personal-catalog.ts` exposes the same supplement to interactive Pi in this project. Restart Pi or use `/reload` to discover it. Other projects do not inherit this extension automatically; Relentless's own runtime and `relentless models` register it directly.

Current example routes:

| Config prefix under `examples/` | Model                 | Reasoning |
| ------------------------------- | --------------------- | --------- |
| `personal`                      | `qwen3.8-flash`       | low       |
| `personal-qwen-max`             | `qwen3.8-max`         | low       |
| `personal-deepseek`             | `deepseek-v4.1-flash` | high      |
| `personal-glm`                  | `glm-5.3`             | low       |

Each prefix has a `.config.json` and `.tasks.json`. Run one with `pnpm relentless swarm examples/<prefix>.config.json examples/<prefix>.tasks.json`. This is an explicit routing example, not a change to existing persisted goals or model pins. Model quality tiers in these tiny examples are routing policy values, not benchmark claims.

New model entries use conservative operational caps of 65,536 context tokens and 8,192 output tokens pending larger-context validation. These are not advertised provider maxima. Zero Pi dollar-price fields do not mean free usage: Alibaba consumes shared subscription credits. Existing built-in models keep their original limits. New entries are added only if absent, allowing future upstream definitions to take precedence.

Sources: [Personal entitlements](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/token-plan-personal-overview), [GLM reasoning controls](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/glm), [DeepSeek reasoning controls](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/deepseek-api). GLM 5.3 cannot disable thinking; its available levels are low/high/max. DeepSeek's low/medium map to high, so the supplement exposes high/max rather than implying a cheaper distinct low mode. This catalog is for coding/chat; the screenshot's audio, image and video generation models require separate adapters.

### Live results after catalog update

| Model               | Run ID                                 | Observed answer                                                 |
| ------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Qwen3.8 Flash       | `c56fd406-7c2c-4022-ac0b-612f39d425eb` | Correct comparison and raw JSON with boolean result             |
| Qwen3.8 Max         | `42095ee3-b32a-49b5-b588-074944a8d9ae` | Correct comparison; JSON enclosed in a Markdown fence           |
| DeepSeek V4.1 Flash | `4e300b6a-7a6c-4309-9d49-bf10c1d67b24` | Correct comparison and raw JSON with boolean result             |
| GLM5.3              | `8b23a26d-dc0b-450c-966c-6ad8c9d4348e` | Correct function; input and expected result returned as strings |

All four actual inference calls completed on the Personal subscription. Local assertions checked their pinned model, completed status and inclusive boundary semantics without executing generated code. Qwen Max and GLM did not satisfy the illustrative exact output form; these results demonstrate account access and a simple correct fix, not strict structured-output reliability. Durable tasks with exact JSON predicates would reject those mismatches. No quota retry loop or metered fallback was used.
