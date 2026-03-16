# Phase 1: Automated Weekly Translation with Slack Approval

## Overview
Phase 1 implements a fully automated weekly translation system that scans for edited articles, proposes translations via Slack, and waits for human approval before uploading to Zendesk.

## Architecture

```
Every Monday at 9am (configurable)
        ↓
Scan Help Center for articles edited in past 7 days
        ↓
Post approval message to Slack #scaling-helpcenter-updates
"X articles ready to translate. [Approve] [Skip]"
        ↓
Wait for approver response (24 hour timeout)
        ↓
If Approve: Execute translations via OpenAI
        ↓
Upload to Zendesk (fr-ca locale)
        ↓
Post confirmation to Slack with results
```

## Components to Build

### 1. **Weekly Scheduler** (`scheduler.js`)
- Uses `node-schedule` package
- Runs every Monday at 9am
- Calls the scan + approval workflow
- Handles timezone awareness

### 2. **Slack Bot Integration** (`slack-integration.js`)
- Posts approval messages to #scaling-helpcenter-updates
- Listens for button interactions (Approve/Skip)
- Validates that approver is authorized
- Tracks approval timestamps

### 3. **Translation Workflow** (`workflow.js`)
- Scan articles edited in last 7 days via Zendesk API
- Group by section
- Execute OpenAI translations
- Upload results back to Zendesk
- Log all actions to CSV

### 4. **Approval Management** (`approval-manager.js`)
- Load approvers from `config/approvers.json`
- Validate approver credentials
- Enforce 24-hour timeout on approvals
- Handle approval state persistence

## Key Files

| File | Purpose |
|------|---------|
| `scheduler.js` | Weekly trigger logic |
| `slack-integration.js` | Slack bot communication |
| `workflow.js` | Translation execution |
| `approval-manager.js` | Approver validation & state |
| `config/approvers.json` | Approver list (editable) |
| `output/` | CSV logs + approval history |
| `.env` | Secrets & configuration |

## Workflow Diagram

```
Start (Monday 9am)
  ↓
Load approvers from config/approvers.json
  ↓
Fetch articles edited in past 7 days
  ↓
Group by section
  ↓
Post Slack message:
  "📋 X articles ready to translate in Y sections
   Section A: 5 articles
   Section B: 3 articles
   [✅ Approve & Translate]  [⏭️ Skip This Week]"
  ↓
Wait for reaction (approver must react within 24h)
  ↓
IF Approve:
  └─ For each article:
     - Call OpenAI translation
     - Upload to Zendesk
     - Log result to CSV
  └─ Post: "✅ Translated X articles. Cost: $Y"
  ↓
IF Skip or Timeout:
  └─ Post: "⏭️  Skipped this week"
  ↓
End
```

## Configuration

### Environment Variables (.env)
```
ZENDESK_SUBDOMAIN=himarley
ZENDESK_OAUTH_ACCESS_TOKEN=...
OPENAI_API_KEY=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=whsec_...
SLACK_CHANNEL_ID=C...
SCHEDULE_DAY_OF_WEEK=1        # Monday
SCHEDULE_HOUR=9
SCHEDULE_MINUTE=0
```

### Approvers (config/approvers.json)
Edit this file to add/remove approvers:
```json
{
  "approvers": [
    {
      "name": "Your Name",
      "slack_user_id": "U123456789",
      "email": "your@company.com",
      "role": "admin"
    }
  ]
}
```

## Dependencies to Add

```bash
npm install @slack/bolt node-schedule
```

## Testing Strategy

**Phase 1a: Local Testing with Staging Help Center**
1. Use staging brand (not public)
2. Set SCHEDULE to run in 5 minutes for testing
3. Verify Slack message posts
4. Verify approval flow works
5. Verify translations upload to staging only

**Phase 1b: Production Rollout**
1. Switch to production Help Center
2. Set schedule to Monday 9am
3. Monitor first 3 weeks of runs
4. Collect feedback and adjust

## Success Criteria

- ✅ Scheduler triggers every Monday at 9am
- ✅ Slack bot posts approval message
- ✅ Approver can click button to approve
- ✅ Translations execute only after approval
- ✅ Results logged to CSV with timestamps
- ✅ Cost calculated and displayed
- ✅ Zero articles translated without approval

## Timeline

- **Week 1:** Build scheduler + Slack integration
- **Week 2:** Build workflow + approval manager
- **Week 3:** Local testing with staging
- **Week 4:** Production rollout + monitoring

## Open Questions

- Should we support multiple approvers voting (any approve = go)?
- Should we auto-translate if no response after 24h?
- Should we provide weekly summary of translations?
- Should we integrate with Jira for flagged articles?

## Next Steps

1. Wait for Slack app approval
2. Get bot token and signing secret
3. Update `.env` file
4. Begin building Phase 1 components
