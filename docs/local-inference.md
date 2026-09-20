# Local fallback

Status: local tool-free inference adapter implemented and CPU smoke-tested through Clanker and Pi. Durable goal scheduling and explicit JSON acceptance checks are now available through `goal` commands; the local model remains advisory. See [durable operations](durable-operations.md). Model answers are advisory text; they cannot authorize commands or alter task boundaries.

Choice: **Qwen3.5 4B Q4_K_M through llama.cpp**, integrated using Pi 0.85.1's public `ModelRuntime.registerProvider` API and OpenAI-compatible transport. Pi's interactive CLI has native `/login llama.cpp` and `/llama` controls, but that extension is not exported by its SDK. Clanker avoids importing Pi private files. Its dedicated `clanker-local` provider uses a fixed `http://127.0.0.1:18080/v1` endpoint, an empty credential store, no tools or resource discovery, and no cloud login. It does not share Pi's interactive llama model manager.

The development machine is an M3 Pro with 18 GB unified memory. The current configuration permits one worker, effort `off`, 8,192 context tokens and at most 512 output tokens. Pi reserves 4,096 context tokens internally; the initially proposed 4K context caused output to clamp to one token, reproduced in a regression test. Server context limits remain authoritative. Retaining all 512 output tokens leaves roughly 3,584 estimated input tokens including system context; larger inputs can reduce the output allowance. Long prompts can fail; this is not a long-context coding worker.

## Pinned artifacts

Artifacts installed in ignored `.harness/local/`, not system-wide:

| Artifact                     | Pin                                                                                                   | SHA-256                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| llama.cpp macOS arm64 binary | `b11012`, `llama-b11012-bin-macos-arm64.tar.gz`                                                       | `030b8849e75d2978a387c4b7544dc56eaab73b6fd20877a8b26b8d1f6d8d65bf` |
| bartowski Qwen3.5 4B GGUF    | commit `4168f45a16a1290d65a4ec0fa312ae917a4c15d6`, `Qwen_Qwen3.5-4B-Q4_K_M.gguf`, 3,013,027,808 bytes | `13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983` |

Download sources: [pinned runtime](https://github.com/ggml-org/llama.cpp/releases/tag/b11012), [pinned weights](https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/4168f45a16a1290d65a4ec0fa312ae917a4c15d6). Verify checksums before extraction/use. These downloads are not part of bootstrap, tests or inference. Other platforms require their own verified runtime artifact.

## Run from this checkout

Start the installed server in a foreground terminal:

```sh
.harness/local/runtime/llama-b11012/llama-server \
  -m .harness/local/models/Qwen_Qwen3.5-4B-Q4_K_M.gguf \
  --alias qwen3.5-4b --host 127.0.0.1 --port 18080 \
  -c 8192 -np 1 -ngl 0 --device none --no-op-offload \
  --jinja --reasoning off -n 512
```

The CPU command is the verified baseline. Metal initialization failed to create a command queue in this sandbox. Outside the sandbox, replacing `-ngl 0 --device none --no-op-offload` with `-ngl 999` is an unverified GPU option; measure memory pressure alongside builds before adopting it.

In another terminal:

```sh
mise exec -- pnpm build
mise exec -- pnpm clanker swarm examples/local.config.json examples/local.tasks.json
```

Stop the server with Ctrl-C in its terminal. Clanker does not own or kill externally started servers; `scripts/teardown` does not stop this foreground process. This external-server mode introduces no daemon, auto-download, global login changes, or remote spend. The smoke-test server used during development is stopped after testing.

Example tasks ask for retry advice, not actual scheduling. The result remains plain text: do not execute model-generated actions. The legacy `swarm` command records a failed worker and exits nonzero if local inference is unavailable. The `goal` commands instead retain the goal and schedule a bounded retry. Future deterministic scheduling must work even with no model available and must preserve policy denials, explicit model/effort floors, and task constraints.

## Remaining acceptance work

- Structured decision schema and deterministic validation against current task constraints.
- Durable coding-side-effect checkpoints and native worker integration beyond the implemented tool-free scheduler.
- Model quality evaluation on varied recovery decisions, context overflow and process interruption tests.
- Broader unattended lifecycle and resource-pressure testing. External-server worker timeouts do not prove inference has stopped.
- GPU and concurrent-build memory measurements. File size is not runtime memory usage.

References: [Pi llama.cpp integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/llama-cpp.md), [Pi custom providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/custom-provider.md), [official Qwen model card](https://huggingface.co/Qwen/Qwen3.5-4B).

## Readiness observation — cycle078

A read-only GET of the configured127.0.0.1:18080 `/v1/models` endpoint failed to
connect on September17. Installed model and runtime files were present. No server
was started, no model invoked, and no files downloaded. Catalog presence is not
readiness. Cycle079 below adds an explicit managed alternative.

## Optional managed lifecycle — cycle079

The routing configuration accepts `managedLocal`, absent by default. In Pi this
belongs at `clanker.routing.managedLocal` in `.pi/settings.json`. It contains
`executable` and `model` artifacts (each an absolute `path` and lowercase SHA-256
`sha256`), a required `libraries` map from `.dylib` basenames to the same artifact
shape, and `startupMs` from 1,000 to 120,000. Pin trusted runtime artifacts and all
required bundled libraries before proposing this permission. The complete tested
machine-specific manifest is in ignored
`.harness/self-improve-079/local-smoke-config.json`; it is not a portable default.

For each separately authorized local dispatch, a Node supervisor copies and hashes
artifacts into a private temporary directory and executes those exact copies. It
refuses symlinks and an occupied port, starts CPU-only on loopback port 18080 with
two threads, one slot, 8,192 context and 512 output tokens, and checks authenticated
model readiness. An ephemeral key is passed through IPC and never persisted.
Normal completion, cancellation and parent IPC disconnection stop the owned child
and remove its snapshot. Existing external servers are never adopted or killed.
Cloud calls do not start this server; configuration application does not start it.
Current dispatch permissions must still match the frozen managed configuration.

Snapshot bounds are 64 MiB executable, 128 MiB per library, 512 MiB total libraries,
8 GiB model, and 64 libraries. These are file bounds, not hard memory limits.
Copying the roughly 3 GB weights for each call incurs disk and cold-start overhead.
Named library pins do not validate the complete dynamic-loader dependency graph;
this is not a hermetic executable sandbox. Same-user tampering, supervisor death,
or arbitrary process hangs are not universally covered. No service, download or
GPU management is added.

The cycle079 live Pi/Qwen check accepted the expected JSON in 14.3 seconds including
managed startup and cleanup. Afterward the endpoint was closed and no owned
snapshot remained. Offline process tests cover owned shutdown, parent SIGKILL,
wrong-model readiness, hash mismatch and occupied external port. This establishes
that bounded example, not general decision quality or a universal durability claim.
The project's active settings have not opted into managed startup.
