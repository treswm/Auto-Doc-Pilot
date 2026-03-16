# Phase 1 Architecture: Weekly Translation Workflow

## Quick Start

```bash
# Run immediately (for testing)
node scheduler.js --now

# Test mode (5-minute schedule)
node scheduler.js --test

# Production mode (Monday 9am - runs indefinitely)
node scheduler.js
```

**Alternatively with npm:**
```bash
npm run run:now
npm run start:test
npm start
```

## Component Overview

### Entry Point: `scheduler.js`
- Main orchestration script
- Loads configuration and credentials
- Sets up job scheduling
- Initializes Slack bot and other clients

### Configuration (`config/`)

**zendesk.js** - Brand switching
- Staging: ID `49194539612563`
- Production: Configurable via env
- Defaults to staging for safety

**scheduler.js** - Schedule modes
- `WEEKLY`: Monday 9am (production)
- `TEST_FREQUENT`: Every 5 minutes (development)
- `MANUAL`: No automatic runs

**approvers.json** - Who can approve
- Tres Moore (admin) - must approve
- Jake Norton (reviewer) - informational
- Xiao Mei (reviewer) - informational

### Business Logic (`lib/`)

**approval-manager.js** - State tracking
- Persists approval state to `config/approval_state.json`
- Tracks who voted and when
- Survives session restarts

**workflow.js** - 6-step pipeline
1. Scan for recently edited articles (past 7 days)
2. Prepare approval message
3. Post to Slack
4. Wait for admin approvals (30s polling, 24h timeout)
5. Translate approved articles via OpenAI
6. Generate CSV audit log

**slack-integration.js** - Slack interactions
- Framework ready for credential integration
- Will post messages and handle button clicks
- Status updates and completion notifications

## Data Flow

```
Scheduler ─→ Scan articles ─→ Post to Slack
                                    ↓
                            Wait for approval
                                    ↓
                         Translate approved
                                    ↓
                         Generate audit log
                                    ↓
                                  Done
```

## State Files

**`config/approval_state.json`** - Current approval round
```json
{
  "current_run_id": "phase1_1710171234567",
  "articles": [...],
  "approvals_needed": ["U018NH75ETU"],
  "approvals_received": [...],
  "all_approved": true
}
```

**`output/phase1_audit_*.csv`** - Audit trail
- Run metadata, articles processed
- Approvals and approvers
- Costs and token usage

## Ready for Slack Integration

Once Slack app is approved:
1. Add `SLACK_BOT_TOKEN` to `.env`
2. Add `SLACK_SIGNING_SECRET` to `.env`
3. Uncomment Slack import in `lib/slack-integration.js`
4. Run `node scheduler.js` - bot will automatically post messages

## Error Handling

- Missing credentials: Warns and disables feature
- Slack not ready: Skips posting, logs warning
- API errors: Logged, workflow stops, audit created
- Approval timeout: Stops, no translation attempted

## Utility Commands

Sync sections from Zendesk (updates sections_plan.json):
```bash
node sync-sections-from-zendesk.js
```

## Next Steps (When Slack Approved)

- [ ] Add Slack credentials to .env
- [ ] Uncomment Slack imports
- [ ] Implement Zendesk API client
- [ ] Test approval workflow
- [ ] Switch to production schedule (Monday 9am)
