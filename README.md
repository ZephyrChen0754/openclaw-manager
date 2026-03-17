# OpenClaw Manager

OpenClaw Manager is the local control plane and durable state layer for OpenClaw.

It upgrades chat-shaped work into:

- recoverable `session` threads
- structured `run` attempts
- append-only `event` and `skill_trace` logs
- local `checkpoint` and summary state
- scored `attention` views
- reusable `capability_fact` outputs
- redacted snapshots and share manifests

HumanClaw remains the remote collaboration, market, and governance network. OpenClaw Manager remains the local source of truth for work state.

## What is implemented

- OpenClaw-native bootstrap, commands, and maintenance hooks
- filesystem-first durable state under `~/.openclaw/skills/manager/`
- session/run/event/checkpoint control plane
- resumable work from checkpoint + summary + spool preview
- attention queue plus session map, focus, risk, and drift views
- connector normalization for Telegram, WeCom, Email, and GitHub
- run evidence, task, and capability snapshots
- capability fact generation, graph summary, and anonymized export
- HumanClaw bridge sync for snapshots, attention escalations, capability facts, and share links

## Repository layout

```text
openclaw-manager/
|- AGENTS.md
|- README.md
|- SKILL.md
|- skill.yaml
|- agents/
|- docs/
|- schemas/
|- scripts/
|- src/
|  |- api/
|  |- bridge/
|  |- connectors/
|  |- control-plane/
|  |- exporters/
|  |- skill/
|  |- storage/
|  `- telemetry/
`- templates/
```

## Requirements

- Node.js 20+
- npm 10+
- a HumanClaw API key if you want bridge sync

## Download

```bash
git clone https://github.com/ZephyrChen0754/openclaw-manager.git
cd openclaw-manager
```

## One-click install

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Install the runtime and also copy the skill into `$CODEX_HOME\skills\openclaw-manager`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallSkill
```

### macOS / Linux

```bash
bash scripts/install.sh
```

Install the runtime and also copy the skill into `$CODEX_HOME/skills/openclaw-manager`:

```bash
bash scripts/install.sh --install-skill
```

## Configure

Copy `.env.example` to `.env.local`.

Minimum values:

```env
HUMANCLAW_BASE_URL=http://8.134.81.173/humanclaw/api
HUMANCLAW_API_KEY=hc_live_xxx
OPENCLAW_MANAGER_NODE_ID=local-node-01
PORT=4318
```

Default state root:

```text
~/.openclaw/skills/manager/
```

State layout:

```text
sessions/<session_id>/session.json
sessions/<session_id>/summary.md
sessions/<session_id>/attention.json
sessions/<session_id>/share/
sessions/<session_id>/artifacts/
sessions/<session_id>/runs/<run_id>/run.json
sessions/<session_id>/runs/<run_id>/events.jsonl
sessions/<session_id>/runs/<run_id>/spool.jsonl
sessions/<session_id>/runs/<run_id>/checkpoint.json
sessions/<session_id>/runs/<run_id>/skill_traces.jsonl
indexes/sessions.json
indexes/active_sessions.json
indexes/attention_queue.json
indexes/capability_facts.jsonl
connectors/bindings.json
connectors/configs.json
connectors/inbox/
snapshots/
exports/
```

## Run

Development:

```bash
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

Bootstrap the runtime and inspect the registered commands:

```bash
npm run bootstrap
```

## Local commands

- `/tasks`
- `/resume <session>`
- `/share <session>`
- `/bind <channel>`
- `/focus`
- `/graph`
- `/digest`
- `/checkpoint`
- `/close`
- `/adopt`

## Sidecar API

- `GET /health`
- `GET /sessions`
- `GET /sessions/map`
- `GET /sessions/digest`
- `GET /sessions/:id`
- `POST /sessions/adopt`
- `POST /sessions/:id/resume`
- `POST /sessions/:id/checkpoint`
- `POST /sessions/:id/close`
- `GET /attention`
- `GET /attention/focus`
- `GET /attention/risk`
- `GET /attention/drift`
- `POST /inbound-message`
- `GET /connectors`
- `POST /connectors/:name/config`
- `POST /connectors/:name/ingest`
- `POST /share/:sessionId`
- `GET /graph`
- `GET /exports/capability-facts`
- `GET /exports/capability-facts/anonymized`
- `POST /bridge/check-in`

Default local address:

```text
http://127.0.0.1:4318
```

## Connector model

Each external source is normalized before it touches the control plane.

Currently implemented source adapters:

- Telegram
- WeCom
- Email
- GitHub

Each adapter produces a canonical inbound message, resolves or creates a binding, then routes the update into an existing session or a resumed run.

## Capability graph and exports

Closed work produces:

- closure metrics
- skill traces
- scenario signatures
- capability facts
- capability graph summaries
- anonymized fact export payloads

Markdown and HTML exports are generated locally and remain redacted by default.

## HumanClaw bridge

Manager syncs only compact artifacts:

- snapshots
- attention escalations
- capability facts
- share links

Bridge endpoints on HumanClaw:

- `POST /api/manager/snapshots`
- `POST /api/manager/attention-escalations`
- `POST /api/manager/capability-facts`
- `POST /api/manager/share-links`

When HumanClaw returns:

- `starter_mission`
- `resume_work`
- `offer_help_public`
- `seek_help`
- `suggested_skill_action`

OpenClaw Manager materializes those results into local sessions or runs instead of leaving them only in chat.

## Documentation

- architecture: [docs/architecture.md](docs/architecture.md)
- session model: [docs/session-model.md](docs/session-model.md)
- event schema: [docs/event-schema.md](docs/event-schema.md)
- connector protocol: [docs/connector-protocol.md](docs/connector-protocol.md)
- capability facts: [docs/capability-facts.md](docs/capability-facts.md)

## Verify before publishing changes

```bash
npm run check
npm run build
```

## License

MIT
