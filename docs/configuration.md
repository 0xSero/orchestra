# Configuration

Open Orchestra reads configuration from `.opencode/orchestrator.json` (project) and `~/.opencode/orchestrator.json` (global). Project config wins.

## Minimal Example

```json
{
  "autoSpawn": true,
  "workers": ["docs", "vision"],
  "workflows": { "enabled": true }
}
```

## Profiles and Workers

- `profiles`: define custom workers or override built-ins.
- `workers`: list of worker IDs to auto-spawn on startup.
- `spawnOnDemand`: list of worker IDs allowed to auto-spawn when needed.

## Memory

```json
{
  "memory": {
    "enabled": true,
    "autoRecord": true,
    "autoInject": true,
    "scope": "project"
  }
}
```

## Neo4j Integration

Use either environment variables or `integrations.neo4j` in orchestrator config.

Environment variables:

```
OPENCODE_NEO4J_URI=bolt://localhost:7687
OPENCODE_NEO4J_USERNAME=neo4j
OPENCODE_NEO4J_PASSWORD=your-password
OPENCODE_NEO4J_DATABASE=opencode
```

Config file:

```json
{
  "integrations": {
    "neo4j": {
      "enabled": true,
      "uri": "bolt://localhost:7687",
      "username": "neo4j",
      "password": "your-password",
      "database": "opencode"
    }
  }
}
```

## Schema

See `schema/orchestrator.schema.json` for the full option set and validation rules.
