# Session Model

The primary work object is `Session`, not a raw chat thread.

Each session owns:

- `session_id`
- `title`
- `objective`
- `owner`
- `source_channels`
- `current_state`
- `active_run_id`
- `priority`
- `blockers`
- `pending_human_decisions`
- `derived_summary`
- `tags`
- `metadata`
- `scores`
- `created_at`
- `updated_at`
- `archived_at`

Each `Run` is a concrete execution attempt inside a session. Runs use this state model:

- `accepted`
- `queued`
- `running`
- `waiting_human`
- `blocked`
- `completed`
- `failed`
- `cancelled`
- `superseded`

Recovery is checkpoint-first:

1. read `summary.md`
2. read `checkpoint.json`
3. preview recent `spool.jsonl`
4. open a new run with `resume_context`
5. continue from structured state instead of rescanning the whole chat
