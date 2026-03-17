# OpenClaw Manager

OpenClaw Manager is a standalone local control plane for OpenClaw.

It keeps work filesystem-first under `~/.openclaw/skills/manager/` and uses a shadow-first model:

- every thread starts as a lightweight `ThreadShadow`
- only meaningful threads are promoted into durable `Session` + `Run` state
- summaries, checkpoints, attention, snapshots, and capability facts stay local

It is not a cloud service. It is a local skill plus sidecar that runs on your machine.

## Who this is for

- OpenClaw users who want a local manager for real work threads
- developers and power users who are comfortable installing Node-based tools
- teams that want resumable local state without uploading raw chat logs elsewhere

## Who this is not for

- people looking for a zero-config browser SaaS
- users who do not want to install Node.js or run a local sidecar
- anyone expecting a hosted multi-user dashboard out of the box

## What problem it solves

OpenClaw conversations often disappear into long threads. OpenClaw Manager fixes that by:

- observing every thread before it becomes durable work
- promoting only the threads that deserve a managed session
- keeping checkpoints and attention local
- making it fast to resume work without re-reading the whole thread
- turning closed work into reusable capability facts and reports

## Core model

- `ThreadShadow`: pre-session observation for chat and connector threads
- `Session`: promoted work thread with durable summary and state
- `Run`: one concrete execution attempt inside a session
- `Event`: append-only JSONL fact log
- `Checkpoint`: resumable state for the active run
- `AttentionUnit`: scored control-plane alert
- `CapabilityFact`: reusable closure fact derived from real work

## What is implemented

- standalone OpenClaw-native bootstrap and sidecar auto-start
- shadow-first thread interception and promotion queue
- filesystem-first durable state
- resumable `session / run / event / checkpoint / spool` control plane
- attention queue plus `session map / focus / risk / drift` views
- source-specific connector normalization for Telegram, WeCom, Email, and GitHub
- redacted task snapshots, run evidence snapshots, and capability snapshots
- capability facts, graph summary, anonymized export, and markdown reports

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

## Download

```bash
git clone https://github.com/ZephyrChen0754/openclaw-manager.git
cd openclaw-manager
```

## Fastest path

If you just want to try it quickly:

```bash
npm install
npm run build
npm run bootstrap
npm run dev
```

That gives you a running local sidecar at `http://127.0.0.1:4318`.

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

## Install modes

### 1. Run the sidecar only

Use this when you only want the local API and durable state:

```bash
npm install
npm run build
npm run dev
```

### 2. Install as a local skill

Use this when you want the repo copied into `$CODEX_HOME/skills/openclaw-manager`:

- Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallSkill`
- macOS/Linux: `bash scripts/install.sh --install-skill`

### 3. Local development

Use this when you want to edit code, rebuild often, and run checks:

```bash
npm install
npm run check
npm run build
npm run dev
```

## Configure

Copy `.env.example` to `.env.local`.

Typical values:

```env
OPENCLAW_MANAGER_STATE_ROOT=
OPENCLAW_MANAGER_NODE_ID=local-node-01
OPENCLAW_MANAGER_SIDECAR_URL=http://127.0.0.1:4318
OPENCLAW_MANAGER_NO_AUTOSTART=0
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
indexes/thread_shadows.json
indexes/promotion_queue.json
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
- `/threads`
- `/resume <session>`
- `/share <session>`
- `/bind <channel>`
- `/focus`
- `/graph`
- `/digest`
- `/checkpoint`
- `/close`
- `/adopt`
- `/promote <shadow>`
- `/archive-thread <shadow>`

## 3-minute quickstart

Once the sidecar is running, the shortest useful flow is:

1. inspect observed work with `/threads`
2. promote the right thread with `/promote <shadow>`
3. review priorities with `/focus`
4. read the working digest with `/digest`

That flow lets you move from observation to managed work without turning every chat into a full session too early.

## Shadow-first behavior

Inbound messages first update a `ThreadShadow`.

A shadow is promoted into a session when any of these conditions is met:

- explicit `/adopt`
- explicit `/promote <shadow>`
- `tool_called`
- `artifact_created`
- `skill_invoked`
- `blocked`
- `waiting_human`
- at least two effective turns plus a promotion score of three or higher

Promotion scoring is conservative by default:

- `task_intent` adds `+2`
- `context_payload` adds `+1`
- manual priority markers add `+2`
- connector follow-up adds `+1`
- low-value chatter adds `+0`

This means:

- three greetings still stay shadowed
- a task request plus useful context promotes
- a task request plus a short acknowledgement reply stays shadowed
- connector follow-up alone becomes a candidate shadow, not a promoted session

Otherwise the manager still tracks the thread locally and exposes it through `/threads`, `/tasks`, and `/focus`.

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
- `GET /threads`
- `GET /threads/:id`
- `POST /threads/:id/promote`
- `POST /threads/:id/archive`
- `GET /attention`
- `GET /attention/focus`
- `GET /attention/risk`
- `GET /attention/drift`
- `POST /inbound-message`
- `GET /connectors`
- `POST /connectors/:name/config`
- `POST /connectors/:name/ingest`
- `POST /connectors/:name/poll`
- `POST /share/:sessionId`
- `GET /graph`
- `GET /exports/capability-facts`
- `GET /exports/capability-facts/anonymized`

Default local address:

```text
http://127.0.0.1:4318
```

## Connector model

Each external source is normalized before it reaches the control plane.

Currently implemented source adapters:

- Telegram
- WeCom
- Email
- GitHub

Each adapter:

1. normalizes source-specific payloads into a canonical inbound message
2. resolves existing thread bindings
3. updates or creates a `ThreadShadow`
4. promotes only when promotion rules say the thread deserves full durable state

Webhook-style ingest and file/body-backed poll flows are both supported.

## Capability facts and exports

Closed work produces:

- closure metrics
- skill traces
- scenario signatures
- capability facts
- capability graph summaries
- anonymized fact export payloads

Markdown and HTML exports are generated locally and remain redacted by default.

## Troubleshooting

### `node` or `npm` not found

Install Node.js 20+ and make sure both `node` and `npm` are available in your shell.

### Port `4318` already in use

Set a different `PORT` value in `.env.local`, then start the sidecar again.

### Wrong or missing state root

Set `OPENCLAW_MANAGER_STATE_ROOT` in `.env.local` if you do not want the default:

```text
~/.openclaw/skills/manager/
```

### Sidecar did not start

Run:

```bash
npm run build
npm run dev
```

Then check:

```text
http://127.0.0.1:4318/health
```

### Skill installed but not visible

Confirm that `$CODEX_HOME/skills/openclaw-manager` exists and contains `SKILL.md`, `skill.yaml`, and the `src/` tree.

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
node scripts/smoke-test.cjs
```

## License

MIT
