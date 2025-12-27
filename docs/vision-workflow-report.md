# Vision Workflow Report (2025-12-26)

## Scope
- Switched vision routing to synchronous analysis for image inputs.
- Removed the placeholder + `await_worker_job` handoff.
- Continued logging vision analysis outcomes to disk for later analysis.

## Flow (Expected Behavior)
1) User sends a message with image parts (file/data URL/clipboard).
2) `chat.message` hook detects image parts and ensures the vision worker is available.
3) Vision worker runs synchronously with image attachments.
4) Image parts are replaced inline with `[VISION ANALYSIS]` (or failure details).
5) Vision metadata is appended to `.opencode/vision/jobs.jsonl`.

## Runtime Measurements (Latest Runs)
- `vision routing` test: ~9.5s
- `vision worker integration` test: ~5.6s
- Full orchestra test suite: ~78.3s total, 47 pass across 29 files

## Storage & Logs
- Vision log: `.opencode/vision/jobs.jsonl`
- Attachments staging: `.opencode/attachments`

## Current Gaps
- Linear real integration blocked: missing `LINEAR_TEAM_ID` and the provided API key returns 401.
- Neo4j real integration runs with env overrides; `.env` is not auto-loaded by `bun test`.
