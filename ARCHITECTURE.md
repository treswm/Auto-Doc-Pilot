# Architecture Overview

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

## System Areas

### 1. Weekly Translation Workflow

This is the original Phase 1 automation path: scan recently edited Help Center content, request approval, then publish French-Canadian translations back to Zendesk.

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

## Translation Data Flow

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

### 2. Release Impact Analysis

This is the manual workflow that helps reviewers understand which Help Center articles are affected by a release.

Key backend pieces:
- `api/release-notes.js` stores release notes, runs release analysis, and analyzes individual candidate articles.
- `api/scanners.js` searches Zendesk for likely matches, then enriches each candidate with article-specific impact analysis.
- `lib/article-processor.js` provides shared HTML processing helpers used by both release analysis and translation.

Current behavior:
- Candidate article analysis uses `htmlToText()` to convert full Zendesk HTML into readable text before sending it to OpenAI.
- The old failure mode was a 2,000-character raw HTML slice, which biased the model toward article intros and caused weak `alreadyCovered` detection.
- `POST /api/release-notes/analyze-article-impact` now returns `alreadyCovered`, `affectedSections`, and `specificImpact`.
- `api/scanners.js` filters out articles where `alreadyCovered === true` before returning results to the frontend.

High-level flow:

```
Release notes input
        ↓
AI extracts affected features + search queries
        ↓
Zendesk article search
        ↓
Fetch full article HTML for each candidate
        ↓
Convert HTML to plain text
        ↓
AI decides:
  - already covered?
  - affected sections?
  - specific impact?
        ↓
Return only actionable articles
```

### 3. Large-Article Translation Chunking

Large Help Center articles used to be skipped once their HTML body exceeded `25000` characters. That behavior has been replaced with structure-aware chunked translation in `run_next_5_sections.js`.

How chunking works:
- `chunkHtml()` in `lib/article-processor.js` splits HTML on preferred structural boundaries first: headings, paragraphs, lists, tables, and rows.
- The translation runner uses the normal single-pass translation flow for smaller articles.
- Oversized articles are split into HTML fragments, each fragment is translated independently, and the translated fragments are reassembled in order.
- If a fragment still cannot be reduced below the chunk limit, the article remains a manual review candidate with `manual_review_large_article`.

Design intent:
- Keep each chunk semantically coherent enough to translate well.
- Avoid splitting inside HTML structures unless necessary.
- Reduce manual-review volume without changing the existing behavior for ordinary articles.

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

**`output/manual_review_master_list.csv`** - Translation exceptions and items still requiring manual follow-up
- Includes large-article chunking failures and other translation issues
- Updated by `run_next_5_sections.js`

## Operational Notes

- Release impact quality improved primarily because article analysis now uses full readable text rather than truncated raw HTML.
- Chunking is important for translation scalability, but it is not the primary fix for release impact analysis.
- Manual review is still part of the design for parse failures, timeouts, parent translation failures, and unreducible large HTML fragments.

## Error Handling

- Missing credentials: Warns and disables feature
- Slack not ready: Skips posting, logs warning
- API errors: Logged, workflow stops, audit created
- Approval timeout: Stops, no translation attempted
- Large-article chunking failure: logged as `manual_review_large_article`

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
