# Architecture

OpenClaw Manager is split into five layers:

1. `src/skill/*` exposes the OpenClaw-facing commands and bootstrap logic.
2. `src/api/*` runs the local sidecar HTTP API.
3. `src/control-plane/*` manages sessions, runs, events, checkpoints, attention, and snapshots.
4. `src/telemetry/*` converts completed work into skill traces, closure metrics, scenario signatures, and capability facts.
5. `src/storage/*` persists append-only state in the local manager directory.

HumanClaw is treated as a network layer, not the source of truth for local state.

