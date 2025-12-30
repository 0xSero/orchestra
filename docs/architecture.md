# Architecture

This repo is a monorepo containing the orchestrator plugin, control panel, and desktop shell. The diagram below is the single source of truth for how the system is wired today.

```mermaid
flowchart TD
  subgraph OpenCode[OpenCode Server]
    OC[OpenCode runtime]
  end

  subgraph Orchestrator[Orchestrator Plugin]
    PLUG[packages/orchestrator]
    WF[Workflow engine]
    MEM[Memory tools]
    EVT[Orchestrator event stream]
  end

  subgraph Agents[OpenCode Concepts]
    AG[Agents (.opencode/agent/*.md)]
    SK[Skills (.opencode/skill/*/SKILL.md)]
  end

  subgraph Clients[Clients]
    APP[Control Panel]
    DESK[Desktop Shell]
  end

  OC -->|loads| PLUG
  PLUG --> WF
  PLUG --> MEM
  PLUG --> EVT

  OC --> AG
  AG -->|may load| SK

  APP -->|sessions/messages| OC
  APP -->|events| EVT
  DESK -->|spawns sidecar + injects URLs| OC
  DESK -->|hosts| APP
```

## Concept ownership (single source of truth)

| Concept | Owner | Config format | Runtime representation |
| --- | --- | --- | --- |
| Workers | Orchestrator | `orchestrator.json` | `WorkerRuntime` + `orchestra.worker.status` events |
| Agents | OpenCode | `.opencode/agent/<name>.md` or `opencode.json` | OpenCode agent registry |
| Skills | OpenCode | `.opencode/skill/<name>/SKILL.md` | `skill({ name })` instruction packs |
| Worker profiles | Orchestrator | `orchestrator.json` | Orchestrator worker definitions |
| Workflows | Orchestrator | `orchestrator.json` | `WorkflowRun` + workflow events |
| Memory | Orchestrator | `orchestrator.json` + optional DB config | `orchestra.memory.written` events |

Worker profiles define the worker kind (`server`, `agent`, `subagent`) and execution mode (`foreground`, `background`) in `orchestrator.json`.

## Runtime wiring

- OpenCode loads the orchestrator plugin from `packages/orchestrator/dist/index.js` (desktop fallback: `src/index.ts`).
- Agent/subagent workers run in-process; subagents are child sessions created via `session.fork` and appear in the OpenCode session list.
- Server workers remain isolated `opencode serve` processes with their own sessions and tool bridge.
- Control panel connects to OpenCode sessions/messages and to the orchestrator event stream for workers/workflows/memory.
- Desktop spawns the OpenCode sidecar and injects connection URLs into `window.__OPENCODE__`.

## Ports and endpoints (defaults)

- OpenCode API: `http://127.0.0.1:4096`
- Skills API: `http://127.0.0.1:4097` (if enabled)
- Orchestrator events: `http://127.0.0.1:<bridge-port>/v1/events`
