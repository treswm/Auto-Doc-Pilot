# Manual Mode Implementation — Complete Summary

## Overview

Manual Mode enables release impact analysis when the OpenAI API quota is exhausted, by allowing users to copy prompts to ChatGPT's web interface and paste responses back. The system now includes automatic truncation detection and follow-up prompt generation (Options B + C).

---

## What Was Implemented

### Core Features

1. **Two-Step Copy/Paste Workflow**
   - Step 1: Identify features affected by release (ChatGPT analyzes release notes)
   - Step 2: Analyze individual articles (ChatGPT evaluates each article against release)
   - Both steps use separate ChatGPT conversations to prevent misinterpretation

2. **Automatic Truncation Detection (Option B)**
   - When Step 2 response is incomplete (ChatGPT ran out of context), the app detects which articles are missing
   - Stores missing article IDs in session state
   - Returns `missingArticles` array in the Step 2 import response
   - Triggers automatic follow-up prompt generation with zero extra user steps

3. **Automatic Follow-up Prompt Generation (Option C)**
   - When missing articles are detected, app automatically generates a follow-up prompt
   - Follow-up prompt includes only the missing articles (not all 15+ articles again)
   - User sees amber warning: "⚠️ 3 article(s) missing from analysis"
   - Follow-up prompt is pre-generated and ready to copy (no extra work)

4. **Graceful Merging**
   - User pastes follow-up response
   - App merges with Step 2 results automatically
   - Final results include all articles analyzed across both responses

---

## User-Facing Instructions

### For Quick Reference
**File:** `MANUAL_MODE_QUICK_START.md`
- 8-step checklist
- Time estimates (10–25 minutes total)
- Common errors and fixes
- Key rules (separate conversations, copy entire JSON, etc.)

### For Detailed Learning
**File:** `MANUAL_MODE_GUIDE.md`
- Full workflow with screenshots/visual descriptions
- Step-by-step instructions for Phase 1 (upload), Step 1, Step 2
- Special case: Missing Articles section explaining truncation and follow-up
- Results panel walkthrough
- FAQ (9 questions + answers)
- Troubleshooting table
- Tips for best results
- When to use Manual Mode vs. Normal Mode

### For Copy/Paste
**File:** `MANUAL_MODE_QUICK_START.md` (JSON Formats section)
- Expected JSON format for Step 1 response
- Expected JSON array format for Step 2 response
- Example structures for users to validate against

---

## Technical Implementation

### Backend Changes

**`api/scanners.js`**
- Extracted `buildBatchArticleMessages(articlesWithContent, releaseNotes)` helper function (~150 lines)
  - Loads product context from `config/product-context.json`
  - Builds system prompt with all three gates (Category, Content, Write)
  - Builds article blocks with location/image inventory
  - Returns `{systemPrompt, userContent, combined}`
  - **Used by both:** `/search-and-flag` (auto mode) AND `/manual-article-prompt` (manual mode)

- Refactored `/manual-article-prompt` endpoint (line ~1035)
  - Now uses `buildBatchArticleMessages` helper instead of inline code
  - Ensures prompt consistency between auto and manual modes

- Modified `/manual-article-import` endpoint
  - Detects missing articles by comparing returned article IDs against `session.manualArticleCache`
  - Stores missing IDs in `session.missingArticleIds`
  - Returns `missingArticles` array in response body (frontend checks for length > 0)

- Added `GET /manual-article-followup-prompt` endpoint
  - Reads `session.missingArticleIds` and `session.manualArticleCache`
  - Re-fetches article content from Zendesk for missing articles only
  - Calls `buildBatchArticleMessages` to generate prompt (same as Step 2, but only missing articles)
  - Returns same shape as initial `/manual-article-prompt` (`{systemPrompt, userContent, combined}`)

- Added `POST /manual-article-followup-import` endpoint
  - Parses follow-up JSON array from ChatGPT
  - Merges with existing `session.lastSearchResults` (append, not replace)
  - Filters out `alreadyCovered` articles
  - Clears `session.missingArticleIds`
  - Returns merged list (same shape as `/manual-article-import`)

**`api/release-notes.js`**
- Fixed "null pages" bug: Changed `${pdfImageData.totalPages}` to `${pdfImageData.totalPages ?? 'unknown'}`
- Fixed "undefined" in negative examples: Added conditional checks for `incorrectlyFlaggedArticle` vs `incorrectIncidentDescription`
- Softened screenshot detection language: "Treat these as hints based on image proximity"
- Updated system prompt rules: Added rules 6 (bug fixes) and 7 (scope usage)
- Updated SEARCH QUERY RULES: Scaled from hard cap of 8 to "1-2 per feature, max 10/14/18 by release size"
- Changed `sectionToUpdate` schema from string to array: `["Section 1", "Section 2"]`
- Fixed PDF export: Handles `sectionToUpdate` as both array and string for backwards compatibility

**`src/pages/ReleasesTab.jsx`**
- Added state variables: `missingArticles`, `manualFollowupPromptText`, `manualFollowupUserMessage`, `manualFollowupPasteValue`
- Updated `manualStep` comment to include `'followup'` state
- Modified `handleManualStep2ShowResults` to:
  - Detect `data.missingArticles.length > 0` from import response
  - If missing: automatically fetch follow-up prompt, set step to `'followup'`
  - If none: proceed normally (step=null, show results)
- Added `handleManualFollowupImport` handler to merge follow-up results
- Added new UI panel for `manualStep === 'followup'` showing:
  - Amber warning with count and list of missing articles
  - Two copy buttons (ChatGPT Project / Full Prompt)
  - Paste textarea
  - "Merge Results →" button
  - "Skip (show partial results only)" button

**`config/product-context.json`**
- Added 3 new rules to `releaseToDocRules` array:
  - GA handling: Specify HOW to update (remove beta label, remove disclaimers, update availability, document options)
  - Help Center Redesign: Clarify this is meta-change (only affects overview/nav article)
  - Bug fix guidance: Bug fixes only need updates if they change documented intended behavior

**`package.json`**
- Added new "restart" npm script: `"restart": "pkill -f 'node server.js'; pkill -f 'vite'; npm run dev"`

### Documentation Changes

**`CLAUDE.md`** (updated)
- Expanded Manual Mode section from ~100 lines to ~350 lines
- Added detailed step-by-step workflow
- Documented all 6 endpoints (including new follow-up endpoints)
- Explained truncation detection and follow-up logic
- Added JSON format examples
- Added implementation details about `buildBatchArticleMessages` helper

---

## Happy Path vs. Truncation Scenario

### Happy Path (No Truncation) — 4 clicks for user

```
1. Toggle Manual Mode
2. [STEP 1] Copy → ChatGPT → Paste response → Click "Continue"
3. [STEP 2] Copy → ChatGPT → Paste response → Click "Show Results"
   → Results displayed (no missing articles detected)
4. Export/copy as normal
```

### Truncation Scenario (12+ articles) — 8 clicks for user

```
1. Toggle Manual Mode
2. [STEP 1] Copy → ChatGPT → Paste response → Click "Continue"
3. [STEP 2] Copy → ChatGPT → Paste response → Click "Show Results"
   → Amber warning: "3 articles missing"
   → App auto-generates follow-up prompt
4. [FOLLOW-UP] Copy → ChatGPT → Paste response → Click "Merge Results"
5. Click "Show Results" again
   → Final results displayed with all articles
6. Export/copy as normal
```

**Key difference:** Truncation path requires 2 extra steps (follow-up copy → ChatGPT → paste → merge), but:
- Zero extra prompts for user to write (app generates automatically)
- No quality loss (app merges responses seamlessly)
- Happy path unchanged (if no truncation, zero extra steps)

---

## Testing the Implementation

### Manual Mode Happy Path (8–13 articles)

1. Start app: `npm run dev`
2. In Releases tab, toggle "Manual Mode" ON
3. Upload a release with ~8 features
4. Step 1: Copy → ChatGPT (new conversation) → Paste response → Continue
5. Step 2: Copy → ChatGPT (new conversation) → Paste response → Show Results
6. ✅ Expected: Results display with all articles analyzed

### Manual Mode Truncation Scenario (12+ articles)

1. Same setup, but upload a release with 15+ features
2. Step 1 & 2: Same as happy path
3. ✅ Expected: After pasting Step 2, see amber warning "⚠️ 3-5 articles missing"
4. Follow-up: Copy new prompt → ChatGPT (new conversation) → Paste → Merge Results
5. ✅ Expected: Warning disappears, all articles now analyzed in final results

### Consistency Check

Run both auto and manual modes with same release:
1. Auto mode: No "Manual Mode" toggle, run normally
2. Manual mode: Enable toggle, run with same release notes
3. ✅ Expected: Results identical (same articles, same proposed edits)
4. If different, `buildBatchArticleMessages` helper may need sync

---

## Deployment Checklist

- ✅ `api/scanners.js` — helper function extracted, endpoints refactored and added
- ✅ `api/release-notes.js` — bugs fixed, schema improvements, rules updated
- ✅ `src/pages/ReleasesTab.jsx` — state variables added, handlers updated, UI panel added
- ✅ `config/product-context.json` — 3 new rules added
- ✅ `package.json` — "restart" script added
- ✅ `CLAUDE.md` — comprehensive Manual Mode documentation updated
- ✅ `MANUAL_MODE_GUIDE.md` — created with step-by-step user instructions
- ✅ `MANUAL_MODE_QUICK_START.md` — created with quick reference
- ✅ Server verified running (`curl http://localhost:3000/api/health`)

---

## Files to Reference

| File | Purpose | Who Uses It |
|---|---|---|
| `MANUAL_MODE_QUICK_START.md` | 8-step checklist + quick reference | Power users, quick lookups |
| `MANUAL_MODE_GUIDE.md` | Full workflow, FAQ, troubleshooting | New users, detailed learning |
| `CLAUDE.md` | Developer docs, API endpoints, implementation details | Developers, code maintenance |
| `MANUAL_MODE_IMPLEMENTATION_SUMMARY.md` | This file — what was built and why | Project documentation |

---

## Known Limitations & Future Improvements

### Current Limitations
- No inline editing of proposed text (download PDF or copy to text editor instead)
- Follow-up prompts still subject to ChatGPT truncation with 15+ articles (would require subsequent follow-ups)
- Manual mode is slower than API mode (requires manual copy/paste for each step)

### Future Improvements (Not Implemented)
- Option A (reduce initial batch truncation): Split Step 2 into chunks of 8 articles each at the UI level
- Inline editing UI for proposed text
- Support for other LLMs besides ChatGPT
- Automatic follow-up chains (if follow-up is truncated, auto-generate another follow-up)

---

## Questions?

See `MANUAL_MODE_GUIDE.md` for FAQ, or check `CLAUDE.md` section "Manual Mode (OpenAI Quota Workaround)" for technical details.

**Restart servers:**
```bash
npm run restart
```

**Run a test release:**
1. Toggle Manual Mode ON
2. Upload test release notes (5–15 features)
3. Follow 4–8 step workflow (happy path or truncation scenario)
4. Verify results match expected behavior

---

## Version History

- **v1.0 (this release):** Manual Mode with automatic truncation detection (Options B + C), 6 endpoints, comprehensive documentation
- **Previous:** Manual Mode basic 4-endpoint implementation without truncation handling
- **Earlier:** No Manual Mode support
