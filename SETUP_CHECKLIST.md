# Setup Checklist for Phase 1

## Pre-Setup (In Progress)
- [x] Slack app created: "Hi Marley Translation Bot"
- [x] OAuth scopes added: `chat:write`, `app_mentions:read`, `commands`, `users:read`
- [x] **NEW:** Scope for user groups: `usergroups:read`
- [x] App installed to workspace (awaiting approval)
- [x] Bot added to #scaling-helpcenter-updates channel
- [x] npm dependencies installed (@slack/bolt, node-schedule)

## Once Slack App is Approved

### Step 1: Create Slack User Group for Approvers
- [ ] Go to your Slack workspace settings → Manage apps → Permissions
- [ ] Find your "Hi Marley Translation Bot" app
- [ ] Verify `usergroups:read` scope is present
- [ ] Create a new user group in Slack:
  - Name: `helpcenter-edit-approvers`
  - Handle: `@helpcenter-edit-approvers`
- [ ] Add members to the group:
  - Add Tres Moore (you)
  - Can add/remove members anytime - no code changes needed
- [ ] **Any workspace admin can manage this group** (solves out-of-office problem!)

### Step 2: Gather Credentials
- [ ] Copy Bot User OAuth Token from Slack app → OAuth & Permissions
- [ ] Copy Signing Secret from Slack app → Basic Information
- [ ] Get #scaling-helpcenter-updates Channel ID (right-click channel → View channel details)
- [ ] Have Zendesk OAuth token ready (from earlier OAuth setup)
- [ ] Have OpenAI API key ready

### Step 3: Configure Environment
- [ ] Create `.env` file (copy from `.env.example`)
- [ ] Fill in all credentials:
  ```
  ZENDESK_SUBDOMAIN=himarley
  ZENDESK_OAUTH_ACCESS_TOKEN=...
  OPENAI_API_KEY=...
  SLACK_BOT_TOKEN=xoxb-...
  SLACK_SIGNING_SECRET=whsec_...
  SLACK_CHANNEL_ID=C...
  ```
- [ ] Set `.env` file to NOT be committed to git (verify in `.gitignore`)

### Step 4: Approvers Configuration (Automatic! ✅)
The system will now:
- [x] Automatically fetch approvers from `@helpcenter-edit-approvers` user group
- [x] Fall back to `config/approvers.json` if Slack isn't ready
- **✅ No code changes needed to add/remove approvers!**

To manage approvers:
1. Go to Slack workspace settings
2. Find the user group `@helpcenter-edit-approvers`
3. Add or remove members
4. Changes take effect immediately on next workflow run

### Step 5: Install Dependencies (Already Done ✅)
- [x] Run `npm install @slack/bolt node-schedule`
- [x] Verified no errors during installation

### Step 6: Verify Required Files (Already Done ✅)
- [x] `glossary.json` (130+ domain terms)
- [x] `sections_plan.json` (71 target sections)
- [x] `sections_full.json` (full section metadata)
- [x] `run_next_5_sections.js` (translation engine)
- [x] `sync-sections-from-zendesk.js` (sync utility)

### Step 7: Prepare for Testing (Already Done ✅)
- [x] Staging Help Center brand ID: 49194539612563
- [x] Approvers system ready (user group or JSON fallback)
- [x] Old output files cleared

### Step 8: Phase 1 Components (Already Done ✅)
- [x] scheduler.js - Main orchestration
- [x] lib/slack-approvers.js - Slack user group integration
- [x] config/zendesk.js - Brand switching
- [x] config/scheduler.js - Schedule modes
- [x] lib/approval-manager.js - Approval state tracking
- [x] lib/workflow.js - 6-step pipeline
- [x] lib/slack-integration.js - Slack bot framework

### Step 9: Local Testing (When Slack Approved)
- [ ] Verify `@helpcenter-edit-approvers` user group exists with members
- [ ] Run in test mode: `node scheduler.js --test`
- [ ] Verify Slack bot posts message to channel
- [ ] Verify you can click approval button
- [ ] Verify bot responds to your approval
- [ ] Check that state persists in `config/approval_state.json`
- [ ] Review CSV output in `output/` folder

### Step 10: Production Rollout
- [ ] Switch SCHEDULE_MODE to WEEKLY (Monday 9am)
- [ ] Switch Help Center brand to production
- [ ] Monitor first weekly run
- [ ] Check Slack notification
- [ ] Verify CSV output
- [ ] Confirm translations in Zendesk

### Step 11: Out-of-Office Continuity
- [ ] When out of office, ask a colleague to add themselves to `@helpcenter-edit-approvers`
- [ ] They can now approve translations while you're away
- [ ] No code changes or deployment needed!
- [ ] Existing approvals are tracked in `config/approval_state.json` with timestamps

## Running Phase 1

### Test Mode (5-minute schedule)
```bash
node scheduler.js --test
```
Runs once immediately, then reschedules every 5 minutes using staging brand.

### Run Once
```bash
node scheduler.js --now
```
Executes workflow once and exits (good for manual testing).

### Normal Mode (Production Schedule)
```bash
node scheduler.js
```
Waits for configured schedule (Monday 9am), runs indefinitely until Ctrl+C.

### Sync Sections from Zendesk
```bash
node sync-sections-from-zendesk.js
```
Fetches latest sections from Zendesk and updates `sections_plan.json`.

## Slack User Group Benefits

✅ **No Code Changes** - Add/remove approvers anytime in Slack  
✅ **Out-of-Office Ready** - Delegate to colleagues, they manage in Slack  
✅ **Full Audit Trail** - All approvals logged with timestamps  
✅ **Dynamic** - Changes take effect immediately on next run  
✅ **Fallback** - If Slack is down, uses local `config/approvers.json`

## Credentials Checklist

```
ZENDESK_SUBDOMAIN: [ ] ________________
ZENDESK_OAUTH_ACCESS_TOKEN: [ ] ________________
OPENAI_API_KEY: [ ] ________________
SLACK_BOT_TOKEN: [ ] xoxb-________________
SLACK_SIGNING_SECRET: [ ] whsec-________________
SLACK_CHANNEL_ID: [ ] C________________
```

## Ready to Begin Testing?

Once you have:
1. ✅ Slack user group created: `@helpcenter-edit-approvers`
2. ✅ Slack app approved with `usergroups:read` scope
3. ✅ All credentials gathered
4. ✅ `.env` file filled out

Run: `node scheduler.js --test`

→ **Let me know when Slack app is approved and you'll provide all credentials.**
