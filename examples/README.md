# Examples

Copy these templates into a project using Open Orchestra. Rename the files as needed.

## Minimal setup

- `examples/opencode.json` -> `./opencode.json` or `~/.config/opencode/opencode.json`
- `examples/.opencode/orchestrator.json` -> `./.opencode/orchestrator.json`
- `examples/.opencode/skill/linear/SKILL.md` -> `./.opencode/skill/linear/SKILL.md`

## Linear integration attached via skill

- Config: `examples/.opencode/orchestrator.linear.json`
- Skill: `examples/.opencode/skill/linear/SKILL.md`

Update `apiKey` and `teamId` (or set `LINEAR_API_KEY` and `LINEAR_TEAM_ID`).

## Neo4j memory skill

- Config: `examples/.opencode/orchestrator.neo4j.json`
- Skill: `examples/.opencode/skill/memory-neo4j/SKILL.md`

Fill in Neo4j connection details or set `OPENCODE_NEO4J_*` env vars.

## Custom integration pass-through

- Config: `examples/.opencode/orchestrator.custom-integrations.json`
- Skill: `examples/.opencode/skill/custom-integrations/SKILL.md`

Custom integration keys are passed through to workers when selected in the skill frontmatter.
