# Slack User Group Setup: @helpcenter-edit-approvers

## Overview

Instead of hardcoding approvers in `config/approvers.json`, the system now fetches approvers from a Slack User Group called **@helpcenter-edit-approvers**.

**Benefits:**
- ✅ Add/remove approvers without code changes
- ✅ Manage entirely in Slack (no developer needed)
- ✅ Works when you're out of office
- ✅ Any workspace admin can update the group
- ✅ Full fallback to local file if Slack is unavailable

## How It Works

1. **Setup** (one-time):
   - Create user group `@helpcenter-edit-approvers` in Slack
   - Add initial members (you, Jake, Xiao)
   - Ensure your Slack app has `usergroups:read` scope

2. **Operation**:
   - When scheduler runs, it fetches the user group members
   - Uses Slack API to get their names and emails
   - Falls back to `config/approvers.json` if Slack unavailable

3. **Management**:
   - Go to Slack workspace → User Groups
   - Add/remove members anytime
   - Changes take effect on next workflow run

## Step-by-Step Setup

### 1. Verify Slack App Scopes

Your Slack app needs these scopes:
- `chat:write` - Post messages
- `app_mentions:read` - Detect mentions
- `commands` - Handle slash commands
- `users:read` - Fetch user details
- **`usergroups:read`** - Read user groups (NEW)

Check in: Slack App Settings → OAuth & Permissions → Scopes

If `usergroups:read` is missing:
1. Add it to your requested scopes
2. Reinstall the app (or ask for reapproval)

### 2. Create the User Group in Slack

1. Go to **Slack Workspace Settings** → **Manage members** → **User groups**
2. Click **Create a user group**
3. Enter:
   - **Name**: `helpcenter-edit-approvers`
   - **Handle**: `@helpcenter-edit-approvers` (should auto-populate)
   - **Description**: "Approves translations for Help Center"
4. Click **Create**

### 3. Add Members to the User Group

1. Click on **@helpcenter-edit-approvers**
2. Click **Edit Members**
3. Add:
   - Tres Moore (you)
   - Jake Norton (optional - informational)
   - Xiao Mei (optional - informational)
4. Click **Update**

Now the system will automatically fetch these members when it runs!

## Managing Approvers (Out-of-Office)

### When You're Out
Ask a colleague (e.g., Jake) to:
1. Go to Slack → User groups → @helpcenter-edit-approvers
2. Click **Edit Members**
3. Add themselves temporarily
4. They can now approve translations while you're away
5. Remove themselves when you're back

**No code changes. No deployments. Just Slack.**

### When You Return
Simply update the user group membership back to normal.

## How the System Loads Approvers

### Priority Order
1. **First**: Try Slack user group (`@helpcenter-edit-approvers`)
   - If successful: Uses Slack members
   - If fails: Logs warning and continues to #2
2. **Second**: Fallback to `config/approvers.json`
   - Always available as backup
   - Used if Slack is unavailable

### Console Output
When the scheduler runs, you'll see:
```
✅ Found Slack user group: @helpcenter-edit-approvers
   Members: 3 users
✅ Loaded 3 approvers from Slack user group
```

Or if Slack is unavailable:
```
⚠️  Slack not configured - using local approvers
✅ Loaded 3 approvers from config/approvers.json
```

## Monitoring

### Check Current Approvers

Run in test mode to see who was loaded:
```bash
node scheduler.js --test
```

Look for the "Loaded X approvers from..." message.

### View Approval State

After a workflow runs, check `config/approval_state.json`:
```json
{
  "approvals_needed": ["U018NH75ETU"],
  "approvals_received": [
    {
      "approver_name": "Tres Moore",
      "approved": true,
      "timestamp": "2026-03-11T14:30:00Z"
    }
  ]
}
```

## Troubleshooting

### "User group not found"
**Error**: `User group @helpcenter-edit-approvers not found in Slack`

**Fix**:
1. Go to Slack workspace settings
2. Create the user group (see Setup section above)
3. Run scheduler again

### "User group has no members"
**Error**: `User group @helpcenter-edit-approvers has no members`

**Fix**:
1. Go to Slack workspace → User groups
2. Click **@helpcenter-edit-approvers**
3. Click **Edit Members** and add yourself
4. Run scheduler again

### "Cannot fetch user details"
**Warning**: `Could not fetch details for user U123456789`

**Fix**:
1. Check that the Slack app has `users:read` scope
2. Reinstall app if scope was just added
3. The approver will still work, but may have "Unknown" name

### "Using fallback approvers"
**Issue**: System is using `config/approvers.json` instead of Slack

**Possible causes**:
1. Slack credentials not in `.env`
2. `usergroups:read` scope missing
3. User group doesn't exist in Slack
4. Temporary Slack API outage

Check your `.env` file and Slack app scopes, then try again.

## Local Fallback (approvers.json)

The system always keeps `config/approvers.json` as a backup:
```json
{
  "approvers": [
    {
      "name": "Tres Moore",
      "slack_user_id": "U018NH75ETU",
      "email": "tres.moore@himarley.com",
      "role": "admin"
    }
  ]
}
```

This file is used if:
- Slack is not configured
- `usergroups:read` scope is missing
- The user group doesn't exist
- Slack API is temporarily unavailable

**You should keep this file as a backup**, but it won't be used during normal operation when Slack is configured.

## Examples

### Example 1: Adding a new approver while you're at a conference
1. Slack message to Jake: "Can you add yourself to @helpcenter-edit-approvers?"
2. Jake goes to Slack workspace settings
3. Jake adds himself to the user group
4. Monday 9am: Workflow runs, fetches Jake from user group
5. Jake gets Slack notification to approve translations

### Example 2: Emergency approver during vacation
1. You're away for 2 weeks
2. Ask Sarah to approve translations
3. Sarah adds herself to @helpcenter-edit-approvers in Slack
4. Next Monday: Workflow runs, includes Sarah as approver
5. Sarah approves from her phone via Slack
6. Translations upload automatically
7. Sarah removes herself from group when done

### Example 3: Revoking approval rights
1. Someone leaves the team
2. Go to Slack workspace → User groups
3. Remove them from @helpcenter-edit-approvers
4. Next run: They're no longer an approver
5. No code changes needed

## FAQ

**Q: Can multiple people approve?**
A: Yes! Everyone in @helpcenter-edit-approvers is an admin approver. Currently only admins can approve (not reviewers).

**Q: What if someone's Slack account gets deleted?**
A: Workflow will log a warning but continue. Remove them from the user group to clean up.

**Q: Can I have different approval levels?**
A: Currently, all user group members are treated as admins. Reviewers are not implemented yet. This can be enhanced in Phase 2.

**Q: What happens if the Slack app loses the `usergroups:read` scope?**
A: System falls back to `config/approvers.json` automatically with a warning.

**Q: Can approvers outside my Slack workspace approve?**
A: No. User group members must be in your Slack workspace.

**Q: How often does it fetch the user group?**
A: Every time the workflow runs. So changes to the user group take effect on the next scheduled run.
