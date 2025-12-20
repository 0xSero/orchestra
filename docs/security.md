# Security

This plugin is designed to be used in **developer workstations** with local worker processes. It includes several defense-in-depth controls to reduce the blast radius of prompt injection and accidental data exfiltration.

## Attachment sandboxing

When you pass `attachments: [{ path: "..." }]` to `ask_worker`, `delegate_task`, or `run_workflow`:

- The path is **resolved to an absolute filesystem path**
- The file must be **inside the project directory** (worker `directory` context)
- The file must be a **regular file**
- The file size is limited (default: **10 MiB**)

If a path is outside the sandbox, the request fails. This prevents “attach `/etc/passwd`” style exfiltration via prompt injection.

## File vs image attachments

By default, **non-image file attachments are ignored** (`allowFileAttachments: false`). This keeps the default posture conservative.

You can loosen size limits and attachment count in `orchestrator.json` under:

- `security.attachments`

## Worker tool restrictions

Profiles can restrict tools by passing `tools` into the worker’s OpenCode config (e.g. `architect` disables write/edit/bash). This helps prevent unintended mutations from planning/review agents.

## Memory secret guard

`memory_put` refuses to store values that match common secret patterns (private keys, GitHub tokens, etc.) when:

- `security.blockSecretsInMemory` is `true` (default)

This is a guardrail, not a perfect secret detector—still **never store secrets** in memory.

## Localhost-only worker servers

Workers are spawned on `127.0.0.1` and are intended to be reachable only locally.

