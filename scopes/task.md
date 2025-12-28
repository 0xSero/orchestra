# Task Scope: Generalized Integration Config + Skill Attachment

## Goal
Decouple external integrations (e.g., Linear) from hard-coded orchestration wiring. Allow integrations to be defined in the OpenCode config (`opencode.json`) and selectively attached to orchestrator and/or workers via skill profile metadata. The system must be generalizable: no tight coupling to Linear; Linear becomes one integration implemented through a generic integration registry.

## Non-Goals
- No changes to existing Linear API behavior or schema beyond where config is sourced.
- No new UI screens required. The app/desktop will surface config only through existing state and tool availability.
- No breaking changes to current env var support (`LINEAR_*`, `OPENCODE_NEO4J_*`, etc.).

## Current State (Summary)
- Integrations live in orchestrator config (`.opencode/orchestrator.json`) and are strongly typed (`IntegrationsConfig` includes `linear`, `neo4j`, `monitoring`).
- Linear tools are always registered in `orchestra/src/tools/index.ts`, gated only by config availability.
- Workers do not run integration tools directly. They receive env vars based on `envPrefixes` in the skill frontmatter.
- The orchestrator does not read `opencode.json` for integrations.

## Target Behavior (End State)
1) **Integration config source priority**
   - Integrations can be defined in `opencode.json` and are merged into orchestrator config as a low-priority source.
   - Existing `orchestrator.json` integrations remain valid and override `opencode.json`.
   - Environment variables still override both (existing behavior).

2) **Generalized integrations model**
   - Orchestrator config accepts arbitrary integration keys under `integrations` without dropping unknown keys.
   - Built-in integrations (Linear, Neo4j, Monitoring) retain typed config handling.
   - Unknown integrations can still be forwarded to workers and referenced by skills without type changes.

3) **Skill-driven attachment**
   - Skill frontmatter gains an `integrations` field to control what integrations a worker should receive. Example:

     ```yaml
     integrations:
       inheritAll: true
       include:
         - linear
         - zendesk
       exclude:
         - monitoring
     ```

     - `inheritAll: true` means "use all integrations from orchestrator config".
     - `include` is a allow-list by integration key.
     - `exclude` removes keys after inheritance.
     - If omitted, default is no integrations attached.

4) **Integration propagation**
   - On worker spawn, the orchestrator resolves the worker's integration selection (from skill frontmatter) and injects it into the worker's OpenCode config and/or environment variables in a general way.
   - For integrations that are env-var-based, the system supports exporting env vars through per-integration exporters (see Integration Registry below).

5) **Tool registration and visibility**
   - Integration tools are registered based on the orchestrator's integration config and are only available when the integration is configured or explicitly attached.
   - Linear tools are moved under a generic integration tools registry so they are not hard-wired in `createTools`.

## Detailed Design

### 1) Config Source Merge
- **New loader:** `orchestra/src/config/opencode.ts` will expose `loadOpenCodeConfig()` (already exists) and a new helper `extractIntegrationsFromOpenCodeConfig()`.
- **Load order:**
  1. Defaults (unchanged)
  2. Global `orchestrator.json`
  3. Project `orchestrator.json`
  4. `opencode.json` integrations (lowest priority within the config merge)

- **Merge rule:**
  - `opencode.json.integrations` is deep-merged into the orchestrator config only when `orchestrator.json` does not specify the same integration key.
  - If both define the same key, `orchestrator.json` wins.

- **Files impacted:**
  - `orchestra/src/config/orchestrator.ts` (load and merge `opencode.json` integrations)
  - `orchestra/src/config/opencode.ts` (extract integrations from OpenCode config)

### 2) Generalized Integrations Types
- **Change type:**
  - Update `IntegrationsConfig` to allow arbitrary keys:

    ```ts
    export type IntegrationsConfig = {
      linear?: LinearIntegrationConfig;
      neo4j?: Neo4jIntegrationConfig;
      monitoring?: MonitoringIntegrationConfig;
      [key: string]: unknown;
    };
    ```

- **Parsing changes:**
  - `parseIntegrationsSection` currently validates and drops unknown keys. It will be updated to:
    - Keep known nested keys with type validation.
    - Pass through unknown keys as-is (no validation).

- **Schema changes:**
  - `orchestra/schema/orchestrator.schema.json` will be updated to allow additionalProperties under `integrations`.

### 3) Skill Frontmatter Extensions
- **New type:** `IntegrationSelection` in `orchestra/src/types/skill.ts`.

  ```ts
  export type IntegrationSelection = {
    inheritAll?: boolean;
    include?: string[];
    exclude?: string[];
  };
  ```

- **Add to `ProfileExtensions`:**

  ```ts
  integrations?: IntegrationSelection;
  ```

- **Parsing:**
  - The skill loader already parses frontmatter generically. It will pass through `integrations` fields without bespoke parsing.

### 4) Integration Registry
- **New module:** `orchestra/src/integrations/registry.ts`

  Responsibilities:
  - Register integrations by key with hooks for:
    - `resolveConfig` (optional)
    - `toEnv` (optional) - convert integration config into env vars
    - `tools` (optional) - tool factories to register

  Example interface:

  ```ts
  type IntegrationDefinition = {
    key: string;
    toEnv?: (cfg: unknown) => Record<string, string>;
    tools?: (input: { config: unknown }) => {
      orchestrator?: Record<string, ToolDefinition>;
      workers?: Record<string, ToolDefinition>;
    };
  };
  ```

- **Linear implementation:**
  - `Linear` integration registers:
    - `toEnv` mapping to LINEAR_* env vars
    - tools via `createLinearTools`, now called via registry

- **Usage:**
  - `createTools` will call `registry.getTools()` and merge tool sets.
  - `spawnWorker` will call `registry.toEnv()` for integrations attached to the worker and merge into `resolveWorkerEnv` output.

### 5) Integration Selection Resolution
- **New helper:** `resolveIntegrationsForProfile(profile, globalIntegrations)`
  - Input: `WorkerProfile` (from skill frontmatter) and merged global integrations config.
  - Output: filtered integrations map.

- **Rules:**
  - If `integrations` is undefined -> return `{}`.
  - If `inheritAll` true -> start with all keys from global config.
  - Apply `include` (if provided) on top of inherited.
  - Apply `exclude` last.

### 6) Worker Environment Injection
- **Where:** `orchestra/src/workers/spawn.ts`
- **Flow:**
  - Resolve worker env from `env` + `envPrefixes`.
  - Resolve selected integrations and call registry `toEnv` for each integration, merging into worker env.
  - These env vars are injected into the worker process before OpenCode server start (current behavior for `env`).

### 7) Orchestrator Tool Registration
- **Where:** `orchestra/src/tools/index.ts`
- **Flow:**
  - Replace direct `createLinearTools` usage with registry-based integration tools.
  - Tools only register when integration config is present and enabled.
  - Keep current orchestrator vs worker tool separation if the integration exposes both.

## How App and Desktop Will See It

### Control Panel / Web App
- No UI changes required.
- The app will see tools appear/disappear based on integration availability via existing tool listing and execution flows.
- When integration tools are unavailable, the app's tool calls will fail gracefully as they do today (with "not configured" errors from tool execution).

### Desktop / TUI
- Same behavior as today; tools are registered by the orchestrator plugin. When a tool is not registered, the UI will not list it.
- Skill-based attachment is transparent to the UI; it affects worker environment only.

### Configuration Surfaces
- Users can define integrations in `opencode.json` (global) and override per project in `.opencode/orchestrator.json`.
- Skills can opt into integrations via frontmatter. This directly affects worker behavior and tool availability.

## Testing Plan

### Unit Tests
1) **Config merge precedence**
   - Add test in `orchestra/test/unit/config-orchestrator.test.ts`:
     - `opencode.json` defines `integrations.linear.apiKey`.
     - `orchestrator.json` defines `integrations.linear.teamId`.
     - Assert merged config uses `teamId` from orchestrator and `apiKey` from opencode when not present in orchestrator.

2) **Integration selection resolution**
   - New tests in `orchestra/test/unit/integrations-registry.test.ts` (or dedicated resolver test):
     - No selection -> empty result
     - inheritAll -> all keys
     - include list -> only include
     - exclude list -> removed after include/inherit

3) **Registry env export**
   - Test `toEnv` mapping for Linear config -> correct LINEAR_* vars

4) **Schema parse pass-through**
   - In `orchestra/test/unit/config-parse.test.ts`, include unknown integration key in `integrations` and assert it survives parsing.

### Integration Tests
1) **Worker env propagation**
   - In `orchestra/test/unit/spawn-worker.test.ts`:
     - Create profile with `integrations` (inheritAll + include linear)
     - Ensure spawn env contains `LINEAR_API_KEY` when config present

2) **Tools registration**
   - In `orchestra/test/unit/linear-tools.test.ts` or new registry test:
     - Ensure Linear tools only present when integration config exists or is enabled

### Manual Tests
- Launch orchestrator with only `opencode.json` integrations; verify tools appear.
- Add `integrations` field to a skill in `.opencode/skill/<id>/SKILL.md` and spawn the worker.
- Confirm worker can access Linear if env vars injected (e.g., via a task that references Linear).

## Rollout Plan
1) Implement registry and config merge logic.
2) Update Linear tool wiring to use registry.
3) Add skill frontmatter extension and integration selection resolution.
4) Add tests and docs updates (`docs/configuration.md`).

## Documentation Updates
- `docs/configuration.md`: add `opencode.json` integrations and skill-level `integrations` selection examples.
- `docs/primitives.md`: mention integration registry and skill attachment.

## Risks and Mitigations
- **Risk:** Unknown integration keys from `opencode.json` could be incorrectly validated/dropped.
  - **Mitigation:** pass-through unknown keys in `parseIntegrationsSection`.

- **Risk:** Tool availability changes might break expectations.
  - **Mitigation:** register tools only when configured; preserve existing error behavior in tool execution.

- **Risk:** Env propagation for integrations could conflict with manual `env` or `envPrefixes`.
  - **Mitigation:** explicit precedence order: `profile.env` > `integration.toEnv` > `envPrefixes`.

## Acceptance Criteria
- Integrations defined only in `opencode.json` can be used by orchestrator and workers.
- Skill frontmatter can attach integrations to a worker without hard-coding integration names.
- Linear tools are registered via registry, not hard-wired in `createTools`.
- All tests pass and behavior is backward compatible with existing `orchestrator.json` integrations.
