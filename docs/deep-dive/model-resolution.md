# Model Resolution Deep Dive

This document describes the v2 model resolution pipeline used for worker profile models.

## Resolution Pipeline

```
Input model string
  -> parse & classify (auto tag / explicit / alias)
  -> provider filtering (configured vs all)
  -> capability matching
  -> scoring (capability + provider + cost)
  -> validation
  -> resolved ModelRef
```

## Auto Tags

| Tag | Purpose | Requirements |
| --- | --- | --- |
| auto | Default model | Provider defaults or top-scoring model |
| auto:vision | Vision tasks | supportsVision === true |
| auto:fast | Quick responses | smaller context, fast variants |
| auto:docs | Documentation | supportsReasoning + large context |
| auto:code | Code tasks | supportsTools + medium/large context |
| auto:reasoning | Complex tasks | supportsReasoning === true |
| auto:cheap | Cost sensitive | lowest cost per 1k tokens |

`node` and `node:*` are treated as aliases for `auto` and `auto:*`.

## Model Aliases

Aliases are simple string mappings:

```json
{
  "modelAliases": {
    "sonnet": "anthropic/claude-sonnet-4-20250514",
    "opus": "anthropic/claude-opus-4-20250514",
    "gpt4": "openai/gpt-4o",
    "gemini": "google/gemini-2.0-flash"
  }
}
```

## Scoring Rules (Summary)

- Capability matches add weight (vision, reasoning, tools).
- Preferred providers get a boost.
- Cost scoring is applied in balanced/economical modes.
- Deprecated models are penalized.

## Validation

Resolved models are validated by:
- Provider existence
- Model availability within provider
- Capability requirements (vision, tools, reasoning)

Errors return suggested matches where possible.
