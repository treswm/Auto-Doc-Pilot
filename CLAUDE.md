# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (React frontend + Express API concurrently)
npm run dev

# Build React app
npm run build

# Run API server only (port 3001)
npm run server

# Run workflow scheduler immediately (for testing)
npm run run:now

# Run scheduler in test mode (5-minute intervals)
npm run start:test

# Run scheduler in production mode (Monday 9am schedule)
npm start

# Sync Help Center sections from Zendesk
npm run sync:sections
```

No test runner is configured — there are utility scripts in `scripts/` for manual API testing (e.g. `node scripts/test-zendesk-api.js`).

## Architecture

This is a full-stack Node.js + React app that automates Help Center documentation workflows. The codebase is split into three layers:

**Frontend** (`src/`) — Vite + React 19 dashboard with three tabs, one per workflow phase. `App.jsx` is the shell; each tab (`TranslationTab`, `OutdatedTab`, `ReleasesTab`) calls the scanner API and renders results. The Vite dev server proxies `/api` requests to `localhost:3001`.

**API Server** (`server.js` + `api/`) — Express on port 3001. Routes in `api/` handle authentication, article operations, approval voting, and scanner invocations. `middleware/requireAuth.js` guards all protected routes using express-session. Auth is email-based: if the email matches `config/approvers.json`, role is `admin`; otherwise `viewer`.

**Workflow Scheduler** (`scheduler.js` + `lib/`) — Node process that orchestrates automated workflows. Entry point is `scheduler.js`, which uses `node-schedule` to trigger `lib/workflow.js`. The workflow pipeline: scan Zendesk articles → post to Slack for approval → wait for admin vote → translate via OpenAI → write CSV audit log. Approval state persists to `config/approval_state.json`.

### Three Workflow Phases

| Phase | Trigger | What it does |
|---|---|---|
| 1: Translation | Weekly (Monday 9am) | Finds articles edited in last 7 days, routes through Slack approval, translates to French-Canadian via OpenAI |
| 2: Outdated | Bi-weekly | Flags articles not updated in 90+ days for review |
| 3: Releases | Manual | Identifies articles affected by product releases |

Each phase has a scanner endpoint in `api/scanners.js`, a corresponding function in `lib/zendesk-api.js`, and a React tab in `src/pages/`.

### Key Integrations

- **Zendesk** — `lib/zendesk-api.js` wraps the Help Center API. OAuth token is stored in env as `ZENDESK_OAUTH_ACCESS_TOKEN`. Brand switching (staging/prod) is in `config/zendesk.js`. Staging brand ID: `49194539612563`.
- **Slack** — `lib/slack-integration.js` uses `@slack/bolt`. Posts approval messages; approvers respond via button clicks.
- **OpenAI** — Called from `lib/workflow.js` for translation. `glossary.json` provides translation terminology.

### State & Data Storage

All runtime state is JSON files in `config/`:
- `approval_state.json` — current approval round (managed by `lib/approval-manager.js`)
- `audit_log.json` — historical audit trail
- `approvers.json` — list of authorized approvers
- `screenshot_state.json`, `sections_state.json` — cached Help Center metadata

Audit CSVs are written to `output/` (gitignored).

### Environment Variables

Required in `.env`:
```
ZENDESK_SUBDOMAIN
ZENDESK_OAUTH_ACCESS_TOKEN
ZENDESK_ENVIRONMENT          # "staging" or "production"
OPENAI_API_KEY
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
SLACK_CHANNEL_ID
SCHEDULE_MODE                # "WEEKLY", "TEST_FREQUENT", or "MANUAL"
SESSION_SECRET
```

### ES Modules

The project uses `"type": "module"` — all files use ESM (`import`/`export`), not CommonJS.
