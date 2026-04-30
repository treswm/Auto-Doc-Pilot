# Manual Mode — Visual Flowchart

## The Two Scenarios

### Scenario A: Happy Path (No Truncation) — 4 User Interactions

```
┌─────────────────────────────────────────────────────────┐
│ APP: Releases Tab                                       │
│ • Toggle "Manual Mode" ON                               │
│ • Upload/paste release notes                            │
│ • Click "Continue"                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │ USER ACTION 1: STEP 1   │
        │ "Identify Features"     │
        ├─────────────────────────┤
        │ 1. APP shows prompt     │
        │ 2. USER clicks "Copy"   │
        │ 3. USER opens ChatGPT   │
        │ 4. USER starts NEW chat │
        │ 5. USER pastes prompt   │
        │ 6. ChatGPT responds JSON│
        │ 7. USER copies JSON     │
        │ 8. USER pastes in app   │
        │ 9. USER clicks "Cont."  │
        └────────────┬────────────┘
                     │
                     ▼
    ┌────────────────────────────────┐
    │ APP (Auto)                     │
    │ • Searches Zendesk             │
    │ • Finds ~8-15 articles         │
    │ • Fetches article content      │
    │ • Caches in session            │
    │ • Displays "Found: N articles" │
    └────────────┬───────────────────┘
                 │
                 ▼
      ┌───────────────────────────────┐
      │ USER ACTION 2: STEP 2         │
      │ "Analyze Articles"            │
      ├───────────────────────────────┤
      │ 1. APP shows batch prompt     │
      │ 2. USER clicks "Copy"         │
      │ 3. USER opens ChatGPT (NEW)   │
      │ 4. USER pastes prompt         │
      │ 5. ChatGPT responds [JSON]    │
      │ 6. USER copies JSON array     │
      │ 7. USER pastes in app         │
      │ 8. USER clicks "Show Results" │
      └────────────┬──────────────────┘
                   │
                   ▼
      ┌────────────────────────────────┐
      │ APP CHECKS FOR TRUNCATION      │
      │ • Compares returned IDs        │
      │ • vs. cached article IDs       │
      │ • Result: ✅ All articles found│
      │ • missingArticles.length = 0   │
      └────────────┬───────────────────┘
                   │
                   ▼
    ┌───────────────────────────────────┐
    │ APP: RESULTS PANEL               │
    │ • Article cards                  │
    │ • Proposed edits                 │
    │ • Screenshots to update          │
    │ • Export buttons                 │
    ├───────────────────────────────────┤
    │ USER EXPORTS:                    │
    │ • Download PDF                   │
    │ • Export CSV                     │
    │ • Copy All                       │
    └───────────────────────────────────┘

📊 STATS: 4 user interactions, ~15-20 minutes, 8-15 articles analyzed
```

---

### Scenario B: Truncation Case (12+ Articles) — 8 User Interactions

```
┌─────────────────────────────────────────────────────────┐
│ APP: Releases Tab                                       │
│ • Toggle "Manual Mode" ON                               │
│ • Upload/paste release notes                            │
│ • Click "Continue"                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │ USER ACTION 1: STEP 1   │
        │ "Identify Features"     │
        ├─────────────────────────┤
        │ [Same as Scenario A]    │
        │ 1. Copy prompt          │
        │ 2. ChatGPT (NEW)        │
        │ 3. Paste & get response │
        │ 4. Paste back           │
        │ 5. Click "Continue"     │
        └────────────┬────────────┘
                     │
                     ▼
    ┌────────────────────────────────┐
    │ APP (Auto)                     │
    │ • Searches Zendesk             │
    │ • Finds ~15+ articles 🔴       │
    │ • Fetches article content      │
    │ • Caches in session            │
    │ • Displays "Found: 18 articles"│
    └────────────┬───────────────────┘
                 │
                 ▼
      ┌───────────────────────────────┐
      │ USER ACTION 2: STEP 2         │
      │ "Analyze Articles" (Batch)    │
      ├───────────────────────────────┤
      │ 1. Copy prompt (18 articles)  │
      │ 2. ChatGPT (NEW)              │
      │ 3. Paste prompt (long!)       │
      │ 4. ChatGPT runs out of context│
      │    ⚠️ Response cuts off mid-  │
      │       analysis                │
      │ 5. USER copies partial JSON   │
      │ 6. USER pastes in app         │
      │ 7. USER clicks "Show Results" │
      └────────────┬──────────────────┘
                   │
                   ▼
      ┌────────────────────────────────┐
      │ APP CHECKS FOR TRUNCATION      │
      │ • Expected IDs: [1,2,3...18]  │
      │ • Returned IDs: [1,2,3...14]  │
      │ • Missing: [15, 16, 17, 18]   │
      │ • ⚠️ Truncation detected!      │
      │ • Auto-generates follow-up     │
      └────────────┬───────────────────┘
                   │
                   ▼
  ┌───────────────────────────────────────┐
  │ APP: AUTO-GENERATED FOLLOW-UP PROMPT  │
  │ ⚠️ "4 article(s) missing"             │
  │ • Shows list of missing articles      │
  │ • Shows follow-up prompt (4 articles) │
  │ • "Copy Prompt for ChatGPT Project"   │
  │ • "Copy Full Prompt (no project)"     │
  │ • Paste response box                  │
  │ • "Merge Results" button              │
  │ • "Skip" button (show partial)        │
  └────────────┬────────────────────────┘
               │
               ▼
    ┌────────────────────────────────────┐
    │ USER ACTION 3: FOLLOW-UP           │
    │ "Analyze Missing Articles"         │
    ├────────────────────────────────────┤
    │ 1. Copy follow-up prompt (4 arts)  │
    │ 2. ChatGPT (NEW - 3rd conversation)│
    │ 3. Paste prompt (short, 4 articles)│
    │ 4. ChatGPT responds [JSON]         │
    │ 5. USER copies JSON array          │
    │ 6. USER pastes in app              │
    │ 7. USER clicks "Merge Results"     │
    └────────────┬───────────────────────┘
                 │
                 ▼
      ┌────────────────────────────────────┐
      │ APP: MERGES RESULTS                │
      │ • Step 2 results: [1..14]          │
      │ • Follow-up results: [15..18]      │
      │ • Merged: [1..18] (all articles)   │
      │ • Stores in session.lastSearchRes. │
      │ • Clears truncation warning        │
      │ • Shows "8: USER ACTION 4"         │
      └────────────┬───────────────────────┘
                   │
                   ▼
      ┌────────────────────────────────────┐
      │ USER ACTION 4: SHOW FINAL RESULTS  │
      │ Click "Show Results" again         │
      └────────────┬───────────────────────┘
                   │
                   ▼
    ┌───────────────────────────────────────┐
    │ APP: RESULTS PANEL                   │
    │ • Article cards (18 total)           │
    │ • All articles fully analyzed        │
    │ • Proposed edits for each            │
    │ • Screenshots to update              │
    │ • Export buttons                     │
    ├───────────────────────────────────────┤
    │ USER EXPORTS:                        │
    │ • Download PDF                       │
    │ • Export CSV                         │
    │ • Copy All                           │
    └───────────────────────────────────────┘

📊 STATS: 4 user interactions (+ 1 auto follow-up), ~20-30 minutes,
   15-18 articles analyzed (across 2 ChatGPT batches)
```

---

## Decision Tree: What Path Will You Take?

```
                    ┌─ User starts Manual Mode
                    │
         ┌──────────▼──────────────────────┐
         │ Will the release have many      │
         │ features (12+)?                 │
         └──────┬───────────────┬──────────┘
                │               │
           NO   │               │   YES
                ▼               ▼
         ┌─────────────────┐  ┌──────────────────┐
         │ HAPPY PATH      │  │ TRUNCATION CASE  │
         │                 │  │ (Likely)         │
         │ 4 interactions  │  │                  │
         │ 15-20 min       │  │ 4 + 1 auto       │
         │ Done!           │  │ 20-30 min        │
         │                 │  │ Done!            │
         └─────────────────┘  └──────────────────┘
                │                     │
                │                     │
                └──────────┬──────────┘
                           │
                    All paths lead to:
                           │
                    RESULTS PANEL ✅
                    (identical output)
```

---

## Detailed: What Happens at Each Step

### Step 1: Identify Features

```
┌─ APP generates system prompt
│  • "You are expert at analyzing release notes"
│  • Instructions: Extract feature changes and recommended articles
│  • Output format: {"featureChanges": [...], "recommendedArticles": [...]}
│
├─ USER copies + ChatGPT + pastes back
│
├─ APP stores in session.lastImpactAnalysis
│
└─ Zendesk search runs automatically
   • Uses recommendedArticles + searchQueries
   • Finds 8-20 matching articles
   • Fetches full article HTML content
   • Truncates to 8000 chars per article
   • Stores in session.manualArticleCache
```

### Step 2: Analyze Articles

```
┌─ APP generates batch prompt
│  • System prompt: "You are expert analyzing Help Center articles"
│  • 3 evaluation gates: Category, Content, Write
│  • All article chunks (8-20 articles)
│  • Output format: JSON array of article analyses
│
├─ USER copies + ChatGPT + pastes back
│
├─ APP parses response
│  • Extracts returned article IDs
│  • Compares against cached IDs
│  • If match: HAPPY PATH → skip to results
│  • If missing: TRUNCATION PATH → generate follow-up
│
└─ Result stored in session.lastSearchResults
   (identical location for both auto and manual modes)
```

### Step 2B: Detect Truncation & Generate Follow-up (Auto)

```
┌─ APP runs automatically (no user action needed)
│  • Reads session.missingArticleIds
│  • Reads session.manualArticleCache
│  • Re-fetches Zendesk content for missing articles only
│  • Calls buildBatchArticleMessages() helper (same as Step 2)
│  • Returns follow-up prompt
│
├─ APP displays:
│  • ⚠️ "X articles missing" warning
│  • List of missing article titles
│  • Pre-generated follow-up prompt
│  • Copy buttons + paste box
│
└─ USER sees new UI panel (manualStep === 'followup')
```

### Step 2C: Merge Follow-up Results (Auto)

```
┌─ USER copies + ChatGPT + pastes back
│
├─ APP parses follow-up response
│
├─ APP merges:
│  • session.lastSearchResults (from Step 2)
│  • Follow-up results (from this step)
│  • Union of all articles, no duplicates
│  • Filters out alreadyCovered articles
│
├─ APP stores in session.lastSearchResults
│  (overwrites with complete merged set)
│
└─ USER clicks "Show Results"
   Sees all articles analyzed (no missing articles)
```

---

## Time Breakdown

### Happy Path: 15–20 minutes

| Phase | Time | What's Happening |
|---|---|---|
| Setup | 1 min | Upload release notes |
| Step 1 | 3–5 min | Copy → ChatGPT → Paste |
| Auto Search | 30 sec | App searches Zendesk |
| Step 2 | 5–15 min | Copy → ChatGPT → Paste (depends on article count) |
| Results | <1 min | APP displays cards |
| **Total** | **15–20 min** | |

### Truncation Case: 20–30 minutes

| Phase | Time | What's Happening |
|---|---|---|
| Setup | 1 min | Upload release notes |
| Step 1 | 3–5 min | Copy → ChatGPT → Paste |
| Auto Search | 30 sec | App searches Zendesk (15+ articles found) |
| Step 2 | 5–15 min | Copy → ChatGPT → Paste (all articles) |
| Follow-up Auto | <1 min | App detects missing, generates follow-up |
| Follow-up Manual | 3–5 min | Copy → ChatGPT → Paste (missing articles only) |
| Merge | <1 min | App merges results |
| Results | <1 min | APP displays complete cards |
| **Total** | **20–30 min** | |

---

## Error Recovery Flowchart

```
          USER PASTES JSON RESPONSE
                     │
                     ▼
          ┌──────────────────────┐
          │ APP parses JSON      │
          └───────┬───────┬──────┘
                  │       │
              VALID       INVALID
                │           │
                ▼           ▼
         ┌──────────────┐  ┌─────────────────────┐
         │ Continue     │  │ Error: "Invalid JSON"│
         │ with         │  │                      │
         │ analysis     │  │ USER ACTION:         │
         └──────────────┘  │ 1. Re-copy (triple)│
                           │ 2. Paste in app     │
                           │ 3. Try again        │
                           └─────────────────────┘

If error persists:
1. Check that you copied the ENTIRE response (from [ to ])
2. Try pasting into jsonlint.com to validate
3. If ChatGPT response was incomplete, use the follow-up prompt instead
```

---

## Session State Management

```
┌──────────────────────────────────────────────────┐
│ session (maintained across HTTP requests)         │
├──────────────────────────────────────────────────┤
│                                                   │
│ After Step 1 Import:                             │
│ • lastImpactAnalysis                             │
│                                                   │
│ Before Step 2:                                   │
│ • manualArticleCache (cached article content)    │
│                                                   │
│ After Step 2 Import:                             │
│ • lastSearchResults (article analysis data)      │
│ • missingArticleIds (if truncation detected)     │
│                                                   │
│ For Step 2 Follow-up:                            │
│ • missingArticleIds (used to re-fetch content)   │
│ • manualArticleCache (used to check what's there)│
│                                                   │
│ After Follow-up Merge:                           │
│ • lastSearchResults (updated with all articles)  │
│ • missingArticleIds (cleared)                    │
│                                                   │
└──────────────────────────────────────────────────┘
```

All state is server-side, so:
- Multiple users can run Manual Mode simultaneously (different sessions)
- Results persist across page refreshes
- Exports (PDF, CSV) read from same session.lastSearchResults

---

## API Endpoints Called (Manual Mode Flow)

```
USER INTERACTION                    API ENDPOINT                      Response
────────────────────────────────────────────────────────────────────────────────
1. Upload release notes              (app handles locally)
                                                                       
2. [STEP 1] Copy button clicked      GET /manual-prompt               {prompt, user...}
                                                                       
3. [STEP 1] Paste ChatGPT response   POST /manual-import              {stored, continue}
                                                                       
4. [AUTO] Search & fetch articles    (app calls Zendesk, no HTTP)    
                                                                       
5. [STEP 2] Copy button clicked      GET /manual-article-prompt       {prompt, user...}
                                                                       
6. [STEP 2] Paste ChatGPT response   POST /manual-article-import      {results, missing?}
                                                                       
7. [AUTO] Detect truncation          (app compares IDs, no HTTP)     
                                                                       
IF MISSING ARTICLES:                                                  
8. [AUTO] Generate follow-up         GET /manual-article-followup-    {prompt, user...}
                                      prompt                           
                                                                       
9. [FOLLOW-UP] Paste ChatGPT response POST /manual-article-followup- {merged results}
                                       import                          
                                                                       
10. Show/export results              (app reads session, no HTTP)    
────────────────────────────────────────────────────────────────────────────────
```

Happy path uses 4 endpoints. Truncation path uses 6 endpoints (+ 2 auto).

---

## Consistency Guarantees

### Prompt Consistency Between Auto and Manual

```
AUTO MODE:
  POST /search-and-flag (API call)
    ├─ calls buildBatchArticleMessages()
    └─ returns same {systemPrompt, userContent} as manual

MANUAL MODE:
  GET /manual-article-prompt (export for copy/paste)
    ├─ calls same buildBatchArticleMessages()
    └─ returns same {systemPrompt, userContent} as auto

RESULT: Both produce identical prompts → identical ChatGPT responses
```

### Result Storage Consistency

```
AUTO MODE:
  POST /search-and-flag (API call to OpenAI)
    └─ stores result in session.lastSearchResults

MANUAL MODE:
  POST /manual-article-import (paste ChatGPT response)
    └─ stores result in session.lastSearchResults (same key)

RESULT: Exports (PDF, CSV) read from same location → identical output
        Whether you used API or copy/paste, exports are the same
```

---

*Last updated: April 22, 2026*
*Visual flowchart for Manual Mode implementation (Options B + C)*
