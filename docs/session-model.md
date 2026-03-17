# Session Model

The primary work object is `Session`, not a raw chat thread.

Each session owns:

- objective
- current state
- blockers
- pending human decisions
- active run id
- summary
- tags
- source bindings

Each `Run` is a concrete execution attempt inside a session. A run owns its own event log, skill traces, and checkpoint.

