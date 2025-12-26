# Vision Workflow Report (2025-12-25)

## Scope
- Restored async vision routing for image inputs in the new orchestra core.
- Added job-based handoff so the orchestrator can wait on `await_worker_job`.
- Logged vision job outcomes to disk for later analysis.

## Flow (Expected Behavior)
1) User sends a message with image parts (file/data URL/clipboard).
2) `chat.message` hook detects image parts and creates a vision job.
3) Image parts are removed from the non-vision agent prompt and replaced with:
   - `[VISION ANALYSIS PENDING]` placeholder
   - job ID and `await_worker_job` instructions
4) Vision worker runs asynchronously and writes results to the job registry.
5) Orchestrator calls `await_worker_job` and uses the analysis to respond.
6) Job metadata is appended to `.opencode/vision/jobs.jsonl`.

## Runtime Measurements (Latest Runs)
- `vision async routing` test: ~22-23s
- `vision worker integration` test: 20.4s
- Full orchestra test suite: 271.27s total, 43 pass / 2 skip

## Storage & Logs
- Vision job log: `.opencode/vision/jobs.jsonl`
- Attachments staging: `.opencode/attachments`

## Current Gaps
- Linear real integration blocked: missing `LINEAR_TEAM_ID` and the provided API key returns 401.
- Neo4j real integration runs with env overrides; `.env` is not auto-loaded by `bun test`.
