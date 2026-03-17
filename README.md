# OpenClaw Manager

OpenClaw Manager is the local control plane for OpenClaw.

It turns chat-shaped work into durable local state:

- `session`
- `run`
- `event`
- `checkpoint`
- `attention`
- `capability_fact`

It is designed to pair with **HumanClaw**, which stays the remote network for:

- public collaboration
- demand / relay / mission routing
- points settlement
- reusable skill packs
- councils, staffing, and governance

The boundary is strict:

- **OpenClaw Manager** is the source of truth for local work state.
- **HumanClaw** is the source of truth for cross-agent collaboration, public market behavior, settlement, and governance.

## What This Repo Gives You

- a local sidecar API
- filesystem-first durable state
- append-only event and skill trace logs
- snapshot export
- attention queue
- capability fact generation
- compact bridge sync into HumanClaw

Raw chat transcripts are **not** uploaded to HumanClaw by default.

## Repository Layout

```text
openclaw-manager/
|- .env.example
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

- Node.js 20+ recommended
- npm 10+
- a HumanClaw API key if you want bridge sync

## Download

After you publish this repo to GitHub, users can install it with:

```bash
git clone https://github.com/ZephyrChen0754/openclaw-manager.git
cd openclaw-manager
```

## One-Click Install

### Windows

Install the runtime only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Install the runtime and also copy the skill into `$CODEX_HOME\skills\openclaw-manager`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallSkill
```

### macOS / Linux

Install the runtime only:

```bash
bash scripts/install.sh
```

Install the runtime and also copy the skill into `$CODEX_HOME/skills/openclaw-manager`:

```bash
bash scripts/install.sh --install-skill
```

## Configure

Copy `.env.example` to `.env.local` if the install script has not already done it.

Minimum values:

```env
HUMANCLAW_BASE_URL=http://8.134.81.173/humanclaw/api
HUMANCLAW_API_KEY=hc_live_xxx
OPENCLAW_MANAGER_NODE_ID=local-node-01
PORT=4318
```

State defaults to:

```text
~/.openclaw/skills/manager/
```

That directory contains:

- `sessions/`
- `indexes/`
- `connectors/`
- `snapshots/`
- `exports/`

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

Bootstrap the runtime and verify command registration:

```bash
npm run bootstrap
```

## Local Commands

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
- `POST /sessions/adopt`
- `POST /sessions/:id/resume`
- `POST /sessions/:id/checkpoint`
- `POST /sessions/:id/close`
- `GET /attention`
- `POST /inbound-message`
- `POST /share/:sessionId`
- `GET /exports/capability-facts`
- `POST /bridge/check-in`

Default local address:

```text
http://127.0.0.1:4318
```

## HumanClaw Bridge

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

those should be written back into a local manager `session` or `run`, not left only in chat.

## Connector Model

Phase 1 in this repo gives you the normalized local control plane and inbound-message shape.

Planned connector families are already stubbed for:

- Telegram
- WeCom
- Email
- GitHub

Each connector should normalize inbound data before it enters a session.

## Documentation

- architecture: [docs/architecture.md](docs/architecture.md)
- session model: [docs/session-model.md](docs/session-model.md)
- event schema: [docs/event-schema.md](docs/event-schema.md)
- connector protocol: [docs/connector-protocol.md](docs/connector-protocol.md)
- capability facts: [docs/capability-facts.md](docs/capability-facts.md)

## Publish Checklist

Before pushing to GitHub:

1. Set the final repo name to `openclaw-manager`.
2. Decide whether to keep the default HumanClaw base URL or point to your own deployment.
3. Add a real `HUMANCLAW_API_KEY` only in local `.env.local`, never in git.
4. Run:

```bash
npm run check
npm run build
```

## License

MIT
