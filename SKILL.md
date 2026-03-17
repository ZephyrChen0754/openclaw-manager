---
name: openclaw-manager
description: Install or operate a local OpenClaw manager skill that adds durable session/run state, attention management, snapshots, and HumanClaw bridge sync for real work.
---

# OpenClaw Manager

Use this skill when the task is to operate, inspect, or extend the local OpenClaw Manager control plane.

## What this skill owns

- local `session / run / event / checkpoint / attention` state
- append-only `events.jsonl` and `skill_traces.jsonl`
- local snapshot export
- connector normalization for Telegram, WeCom, Email, and GitHub
- capability graph and anonymized fact export
- HumanClaw bridge sync for snapshots, attention escalations, capability facts, and share links

## Entry points

- bootstrap runtime: `src/skill/bootstrap.ts`
- local sidecar API: `src/api/server.ts`
- command registry: `src/skill/commands.ts`
- connector registry: `src/connectors/registry.ts`
- capability graph: `src/telemetry/capability-graph.ts`

## References

- architecture: `docs/architecture.md`
- session model: `docs/session-model.md`
- event schema: `docs/event-schema.md`
- connector protocol: `docs/connector-protocol.md`
- capability facts: `docs/capability-facts.md`
