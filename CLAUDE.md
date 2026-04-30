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

**Chunking + Article Processing** (`lib/article-processor.js` + `run_next_5_sections.js`) — Shared HTML utilities now support both release analysis and translation. `htmlToText()` converts Zendesk article HTML into readable plain text for AI analysis, and `chunkHtml()` performs structure-aware HTML chunking on block boundaries so oversized articles can be translated in multiple passes instead of being skipped outright.

### Three Workflow Phases

| Phase | Trigger | What it does |
|---|---|---|
| 1: Translation | Weekly (Monday 9am) | Finds articles edited in last 7 days, routes through Slack approval, translates to French-Canadian via OpenAI |
| 2: Outdated | Bi-weekly | Flags articles not updated in 90+ days for review |
| 3: Releases | Manual | Identifies articles affected by product releases |

Each phase has a scanner endpoint in `api/scanners.js`, a corresponding function in `lib/zendesk-api.js`, and a React tab in `src/pages/`.

### Manual Mode (OpenAI Quota Workaround)

When the OpenAI API quota is exhausted, the Releases tab has a **Manual Mode** toggle that replaces AI calls with copy/paste prompts. The user runs the prompts in their [Hi Marley ChatGPT project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project) and pastes responses back. The final output — article cards with proposed edits — is identical to the normal flow.

#### Step-by-Step Instructions

**SETUP:**
1. In the Releases tab, toggle **"Manual Mode"** ON (look for the toggle in the header)
2. Upload or paste your release notes (text, PDF, or URL) as normal
3. Click the blue button to proceed

**STEP 1 — Identify Features Affected:**
4. Click **"Copy Prompt for ChatGPT"** (or **"Copy Full Prompt"** if not using Hi Marley project)
5. Open [Hi Marley ChatGPT project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project) or ChatGPT.com
6. **Start a new conversation** (do not reuse an old one)
7. Paste the prompt and wait for ChatGPT's response (JSON format)
8. Copy the entire JSON response
9. Paste into the **"Paste ChatGPT Response"** box under Step 1
10. Click **"Continue"**

**STEP 2 — Analyze Articles (Automatically Found):**
11. App automatically searches Zendesk and fetches article content for detected features
12. A new prompt appears: **"Copy Prompt for ChatGPT"** or **"Copy Full Prompt"**
13. **Start a new ChatGPT conversation** (critical — do not continue Step 1 conversation)
14. Paste the prompt and wait for the JSON array response
15. Copy the entire JSON array response
16. Paste into the **"Paste ChatGPT Response"** box
17. Click **"Show Results"**

**STEP 2 SPECIAL CASE — Missing Articles (Truncation Handling):**

If ChatGPT's response is incomplete and you see an amber warning like **"⚠️ 3 article(s) missing from analysis"**, this means ChatGPT ran out of context mid-response and didn't analyze some articles. The app detected this automatically.

18. Under the "Missing articles" section, you'll see a new prompt generated for only those articles
19. Repeat STEP 2 in a fresh ChatGPT conversation: paste prompt → get response → paste back
20. Click **"Merge Results"** to combine the follow-up analysis with Step 2 results
21. Click **"Show Results"** to see the final merged output

Alternatively, click **"Skip (show partial results only)"** to proceed with incomplete results and analyze the missing articles manually later.

**END:**
22. Review proposed article edits in the results panel
23. Use **"Copy All to Clipboard"**, **"Download PDF"**, or other export options as normal
24. Results are identical whether you used Manual Mode or API calls

#### Critical Notes

- **Step 2 is always a new thread.** Continuing the Step 1 conversation causes ChatGPT to misinterpret the batch analysis as continued documentation writing and will return full articles instead of JSON.
- **Missing articles are detected automatically.** If ChatGPT truncates in Step 2, you'll see an amber warning. The app generates a follow-up prompt for only the missing articles — no extra prompts to write yourself.
- **Context window management:** Each article is truncated to 8000 characters in the batch prompt. Step 2 typically sends 10–20 articles. If truncation occurs and you see the missing articles warning, the follow-up prompt includes only those articles, which are smaller and fit easily.
- **Copy buttons:** Step 2 has two options:
  - **"Copy Message for ChatGPT Project"** — user message only (project has system instructions). Use this for Hi Marley project.
  - **"Copy Full Prompt (no project)"** — full prompt with system instructions. Use for plain ChatGPT without a trained project.

#### Manual Mode JSON Formats

**Step 1 Response (paste into "Paste ChatGPT Response"):**
```json
{
  "featureChanges": ["Section Header: Feature A", "Feature B"],
  "recommendedArticles": [
    { 
      "title": "Article Title",
      "action": "update_existing",
      "reason": "Why this article needs updating",
      "relatedFeatures": ["Section Header: Feature A"],
      "searchQueries": ["relevant query 1", "relevant query 2"]
    }
  ],
  "searchQueries": ["relevant query 1", "relevant query 2"]
}
```

Note: `featureChanges` entries should use the full release notes section title (including parent header if any). `relatedFeatures` in each recommendation must exactly match the strings used in `featureChanges`. The per-recommendation `searchQueries` are which queries were used to find articles for that specific recommendation.

**Step 2 Response (paste into "Paste ChatGPT Response"):**
```json
[
  {
    "articleId": 12345678,
    "alreadyCovered": false,
    "affectedSections": "Inbox Configuration",
    "specificImpact": "This section now includes the new notification option 'Dismiss for Myself'",
    "proposedCopy": [
      {
        "section": "Inbox Configuration",
        "changeType": "update_text",
        "instruction": "Add the new notification option to the list in the third paragraph",
        "proposedText": "You can now dismiss notifications for yourself only (Dismiss for Myself), snooze them, or mark them as No Response Needed."
      }
    ],
    "screenshotsToUpdate": [
      {
        "section": "Inbox Configuration",
        "filename": "notification-options.png",
        "reason": "The screenshot shows outdated notification options; add 'Dismiss for Myself' to the dropdown"
      }
    ]
  }
]
```

**Include every article in Step 2** — even ones where `alreadyCovered: true`. Articles flagged `alreadyCovered: true` are filtered out by the app before results display.

**For the Step 2 follow-up prompt** (only sent if missing articles detected): Use the exact same JSON array format. Paste each article object back as a JSON array, even if it's just 2–3 articles.

#### API Endpoints (Manual Mode Only)

| Endpoint | Purpose |
|---|---|
| `GET /api/release-notes/manual-prompt` | Returns Step 1 prompt |
| `POST /api/release-notes/manual-import` | Accepts Step 1 JSON response; stores in session |
| `GET /api/scanners/manual-article-prompt` | Runs Zendesk search, fetches content, returns Step 2 batch prompt; caches articles in session |
| `POST /api/scanners/manual-article-import` | Accepts Step 2 JSON array; detects missing articles; stores in session |
| `GET /api/scanners/manual-article-followup-prompt` | Generates follow-up prompt for articles missing from Step 2 (triggered automatically when missing detected) |
| `POST /api/scanners/manual-article-followup-import` | Accepts follow-up JSON array; merges with Step 2 results |

#### Implementation Details

The `buildBatchArticleMessages(articlesWithContent, releaseNotes)` helper in `api/scanners.js` generates the exact Step 2 prompt for both manual and auto modes, ensuring consistency. Both paths use the same system prompt, gates, and article formatting — only the delivery method differs (copy/paste vs. API).

When `/manual-article-import` receives the Step 2 response, it:
1. Extracts article IDs from the JSON array
2. Compares against `session.manualArticleCache` (articles that were sent to ChatGPT)
3. Detects missing articles by checking if returned IDs < cached count
4. Returns `missingArticles` in the response

If articles are missing, the frontend automatically:
1. Calls `/manual-article-followup-prompt` to generate a follow-up prompt
2. Shows the prompt and missing article list
3. Waits for user to paste the follow-up response
4. Calls `/manual-article-followup-import` to merge results

The PDF/CSV export endpoints (`/api/scanners/export-full-pdf`, `/api/scanners/export-results`) read from `req.session.lastSearchResults`, which `/manual-article-import` and `/manual-article-followup-import` write to the same key as `/search-and-flag` — so exports work identically after a manual run, including after follow-up merges.

### Release Impact Notes

- `POST /api/release-notes/analyze-article-impact` analyzes each article as full plain text. It returns `alreadyCovered` (filter out), `specificImpact` (article-specific reason), `affectedSections`, and `proposedCopy` (exact suggested edits in Hi Marley's voice).
- After per-article analysis, `specificImpact` **overrides** the generic pre-match `reason` so every article in the results has a unique, accurate description rather than a copy of the same recommendation.
- `api/scanners.js` `search-and-flag` fetches section + category names from Zendesk at the start of each scan and passes them to `analyze-article-impact` as `articleSectionName` / `articleCategoryName`. This gives the AI explicit context (e.g. "Integrations > Contact API Actions") to make accurate relevance decisions without needing a hard-coded exclusion list.
- Two AI knowledge files accumulate learning over time — see **AI Learning & Context** section below.

### Translation Notes

- `run_next_5_sections.js` still uses a simple single-call path for normal-sized articles.
- Articles over `25000` HTML characters now go through chunked translation instead of being automatically sent to manual review.
- Chunking is structural first: headings, paragraphs, lists, tables, and rows are preferred boundaries so translated fragments can be stitched back together with minimal HTML damage.
- Manual review is still used when a fragment cannot be reduced below the chunk limit cleanly enough.

### Key Integrations

- **Zendesk** — `lib/zendesk-api.js` wraps the Help Center API. OAuth token is stored in env as `ZENDESK_OAUTH_ACCESS_TOKEN`. Brand switching (staging/prod) is in `config/zendesk.js`. Staging brand ID: `49194539612563`.
- **Slack** — `lib/slack-integration.js` uses `@slack/bolt`. Posts approval messages; approvers respond via button clicks.
- **OpenAI** — Used in both translation and release analysis. `glossary.json` provides translation terminology. Release analysis uses `config/product-context.json` (product structure rules) and `config/training-examples.json` (few-shot examples) to improve recommendation accuracy over time — both are injected into every AI call.

### State & Data Storage

All runtime state is JSON files in `config/`:
- `approval_state.json` — current approval round (managed by `lib/approval-manager.js`)
- `audit_log.json` — historical audit trail
- `approvers.json` — list of authorized approvers
- `screenshot_state.json`, `sections_state.json` — cached Help Center metadata
- `training-examples.json` — few-shot examples for release impact analysis (see AI Learning & Context)
- `product-context.json` — growing product knowledge rules for release scanning (see AI Learning & Context)

Audit CSVs are written to `output/` (gitignored).

### AI Learning & Context

Auto Doc Pilot improves over time through two config files that are injected into every AI analysis call. Edit these directly to refine behaviour — no code changes needed.

#### `config/product-context.json`
Plain-English rules about Hi Marley's product structure and how release types map to documentation categories. Loaded by **both** `analyze-impact` (initial analysis) and `analyze-article-impact` (per-article relevance check).

```json
{
  "_description": "Plain-English rules injected into every analysis.",
  "releaseToDocRules": [
    "Inbox changes do NOT affect integration docs unless the release explicitly mentions API/webhook changes.",
    "Add new rules here as you learn them."
  ]
}
```

**When to add a rule:** Any time you notice a pattern in the scan output — articles being incorrectly included or excluded — add a rule here describing the correct behaviour. Keep rules specific and factual.

#### `config/training-examples.json`
Concrete before/after examples of past release→article decisions (few-shot learning). Each entry shows a release feature, the human decision (update existing vs. create new), the article, and why. Also contains `patterns.doNotMatch` signals — negative rules about common mistakes.

**When to add an example:** After reviewing a scan, if the AI got something noticeably right or wrong, add an example here capturing what the correct decision was and why. The more examples, the more accurate the recommendations.

Both files are read fresh on every analysis call — no server restart needed after editing them.

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
