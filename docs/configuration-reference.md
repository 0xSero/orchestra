# Configuration Reference

This file is auto-generated from `schema/orchestrator.schema.json`.
Run `bun scripts/generate-config-reference.ts` to regenerate.

## $schema

- Type: string

## basePort

- Type: number
- Default: 14096

## autoSpawn

- Type: boolean
- Default: true

## spawnOnDemand

- Type: array
- Description: Worker IDs allowed to auto-spawn when needed (e.g. vision analysis).
- Default: ["vision"]
- Validation: items: string

## spawnPolicy

- Type: object
- Description: Per-profile spawn controls (auto, on-demand, manual, warm pool, reuse).
- Validation: additionalProperties: false

## spawnPolicy.default

- Type: object
- Validation: additionalProperties: false

## spawnPolicy.default.autoSpawn

- Type: boolean

## spawnPolicy.default.onDemand

- Type: boolean

## spawnPolicy.default.allowManual

- Type: boolean

## spawnPolicy.default.warmPool

- Type: boolean

## spawnPolicy.default.reuseExisting

- Type: boolean
- Notes: deprecated (device registry removed); no effect

## spawnPolicy.profiles

- Type: object
- Validation: additionalProperties: object

## startupTimeout

- Type: number
- Default: 30000

## healthCheckInterval

- Type: number
- Default: 30000

## healthCheck

- Type: object
- Validation: additionalProperties: false

## healthCheck.enabled

- Type: boolean
- Default: true

## healthCheck.intervalMs

- Type: number
- Default: 30000
- Validation: minimum: 10000

## healthCheck.timeoutMs

- Type: number
- Default: 3000

## healthCheck.maxRetries

- Type: number
- Default: 3

## warmPool

- Type: object
- Validation: additionalProperties: false

## warmPool.enabled

- Type: boolean
- Default: false

## warmPool.profiles

- Type: object
- Validation: additionalProperties: object

## modelSelection

- Type: object
- Validation: additionalProperties: false

## modelSelection.mode

- Type: enum(performance, balanced, economical)
- Default: "performance"
- Validation: enum: performance, balanced, economical

## modelSelection.maxCostPer1kTokens

- Type: number

## modelSelection.preferredProviders

- Type: array
- Validation: items: string

## modelAliases

- Type: object
- Validation: additionalProperties: string

## ui

- Type: object
- Validation: additionalProperties: false

## ui.toasts

- Type: boolean
- Default: true

## ui.injectSystemContext

- Type: boolean
- Default: true

## ui.systemContextMaxWorkers

- Type: number
- Default: 12

## ui.defaultListFormat

- Type: enum(markdown, json)
- Default: "markdown"
- Validation: enum: markdown, json

## ui.debug

- Type: boolean
- Default: false

## ui.logToConsole

- Type: boolean
- Default: false

## ui.wakeupInjection

- Type: boolean
- Description: When async worker jobs or vision analysis complete, inject a prompt into the orchestrator session to resume it.
- Default: true

## notifications

- Type: object
- Validation: additionalProperties: false

## notifications.idle

- Type: object
- Validation: additionalProperties: false

## notifications.idle.enabled

- Type: boolean
- Default: false

## notifications.idle.title

- Type: string

## notifications.idle.message

- Type: string

## notifications.idle.delayMs

- Type: number
- Default: 1500

## agent

- Type: object
- Validation: additionalProperties: false

## agent.enabled

- Type: boolean
- Default: true

## agent.name

- Type: string
- Default: "orchestrator"

## agent.model

- Type: string

## agent.prompt

- Type: string

## agent.mode

- Type: enum(primary, subagent)
- Default: "primary"
- Validation: enum: primary, subagent

## agent.color

- Type: string

## commands

- Type: object
- Validation: additionalProperties: false

## commands.enabled

- Type: boolean
- Default: true

## commands.prefix

- Type: string
- Default: "orchestrator."

## pruning

- Type: object
- Description: DCP-inspired context pruning (truncates large tool inputs/outputs before sending to the LLM).
- Validation: additionalProperties: false

## pruning.enabled

- Type: boolean
- Default: false

## pruning.maxToolOutputChars

- Type: number
- Default: 12000

## pruning.maxToolInputChars

- Type: number
- Default: 4000

## pruning.protectedTools

- Type: array
- Default: ["task","todowrite","todoread"]
- Validation: items: string

## workflows

- Type: object
- Validation: additionalProperties: false

## workflows.enabled

- Type: boolean
- Default: true

## workflows.roocodeBoomerang

- Type: object
- Validation: additionalProperties: false

## workflows.roocodeBoomerang.enabled

- Type: boolean
- Default: true

## workflows.roocodeBoomerang.steps

- Type: array
- Validation: items: object

## workflows.roocodeBoomerang.maxSteps

- Type: number
- Default: 4

## workflows.roocodeBoomerang.maxTaskChars

- Type: number
- Default: 12000

## workflows.roocodeBoomerang.maxCarryChars

- Type: number
- Default: 24000

## workflows.roocodeBoomerang.perStepTimeoutMs

- Type: number
- Default: 120000

## security

- Type: object
- Validation: additionalProperties: false

## security.workflows

- Type: object
- Validation: additionalProperties: false

## security.workflows.maxSteps

- Type: number
- Default: 4

## security.workflows.maxTaskChars

- Type: number
- Default: 12000

## security.workflows.maxCarryChars

- Type: number
- Default: 24000

## security.workflows.perStepTimeoutMs

- Type: number
- Default: 120000

## memory

- Type: object
- Validation: additionalProperties: false

## memory.enabled

- Type: boolean
- Default: true

## memory.autoSpawn

- Type: boolean
- Default: true

## memory.autoRecord

- Type: boolean
- Default: true

## memory.autoInject

- Type: boolean
- Default: true

## memory.scope

- Type: enum(project, global)
- Default: "project"
- Validation: enum: project, global

## memory.maxChars

- Type: number
- Default: 2000

## memory.summaries

- Type: object
- Validation: additionalProperties: false

## memory.summaries.enabled

- Type: boolean
- Default: true

## memory.summaries.sessionMaxChars

- Type: number
- Default: 2000

## memory.summaries.projectMaxChars

- Type: number
- Default: 2000

## memory.trim

- Type: object
- Validation: additionalProperties: false

## memory.trim.maxMessagesPerSession

- Type: number
- Default: 60

## memory.trim.maxMessagesPerProject

- Type: number
- Default: 400

## memory.trim.maxMessagesGlobal

- Type: number
- Default: 2000

## memory.trim.maxProjectsGlobal

- Type: number
- Default: 25

## memory.inject

- Type: object
- Validation: additionalProperties: false

## memory.inject.maxChars

- Type: number
- Default: 2000

## memory.inject.maxEntries

- Type: number
- Default: 8

## memory.inject.includeMessages

- Type: boolean
- Default: false

## memory.inject.includeSessionSummary

- Type: boolean
- Default: true

## memory.inject.includeProjectSummary

- Type: boolean
- Default: true

## memory.inject.includeGlobal

- Type: boolean
- Default: true

## memory.inject.maxGlobalEntries

- Type: number
- Default: 3

## telemetry

- Type: object
- Description: PostHog telemetry settings. Set POSTHOG_API_KEY env var or provide apiKey here.
- Validation: additionalProperties: false

## telemetry.enabled

- Type: boolean
- Default: false

## telemetry.apiKey

- Type: string
- Description: PostHog API key (or use POSTHOG_API_KEY env var)

## telemetry.host

- Type: string
- Description: PostHog host (default: https://us.i.posthog.com)

## profiles

- Type: array
- Description: Profiles available to spawn. Use this to set worker→model mapping without auto-spawning.
- Validation: items: oneOf

## workers

- Type: array
- Description: Workers to auto-spawn. Items may be built-in IDs (string) or full profile objects.
- Validation: items: oneOf
