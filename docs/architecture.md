# Architecture

OpenClaw Manager is split into seven cooperating layers:

1. `src/skill/*`
   - OpenClaw-facing bootstrap, commands, and hooks
   - startup checks, background maintenance, and skill wrappers
2. `src/api/*`
   - local sidecar API
   - canonical ingress for sessions, connector updates, digests, focus views, and bridge check-ins
3. `src/control-plane/*`
   - `Session` and `Run` lifecycle
   - event log writes
   - checkpoint restore
   - attention scoring and snapshot orchestration
4. `src/storage/*`
   - filesystem-first durable state
   - append-only JSONL logs and generated indexes
5. `src/connectors/*`
   - source-specific adapters for Telegram, WeCom, Email, and GitHub
   - normalized inbound message generation
   - connector config and thread binding support
6. `src/telemetry/*`
   - skill traces
   - closure metrics
   - scenario signatures
   - capability facts
   - capability graph summary and anonymized export
7. `src/exporters/*`
   - snapshot HTML export
   - markdown reports for sessions, digests, and capability reports

HumanClaw is treated as a remote network, market, and governance layer. It is never the source of truth for local session/run state.
