# Manual Mode — Quick Reference (TL;DR)

Use this when you've read the full guide and just need a checklist.

## The 8-Step Process

```
1. Toggle "Manual Mode" ON in Releases tab
2. Upload/paste release notes → Click "Continue"

STEP 1 — Identify Features:
3. Click "Copy Prompt for ChatGPT Project" (or "Copy Full Prompt")
4. Start NEW ChatGPT conversation → Paste → Copy JSON response → Paste back → Click "Continue"

STEP 2 — Analyze Articles:
5. Click "Copy Prompt for ChatGPT Project" (or "Copy Full Prompt")
6. Start NEW ChatGPT conversation → Paste → Copy JSON array → Paste back → Click "Show Results"

IF MISSING ARTICLES WARNING APPEARS:
7. Click "Copy Prompt" again → Start NEW ChatGPT conversation → Paste → Copy → Paste back
8. Click "Merge Results" → Click "Show Results"

DONE: Download PDF, export CSV, or copy edits to Help Center
```

## Key Rules

| Rule | Why |
|---|---|
| Each step = NEW ChatGPT conversation | Reusing conversations causes ChatGPT to misinterpret and write full articles |
| Copy entire JSON response | Partial copies cause "invalid JSON" errors |
| Use "Copy Prompt for ChatGPT Project" if you have access | Project includes your writing style; results are better tuned |
| Include `alreadyCovered: true` articles when pasting back | App filters them out before showing results |
| Missing articles = automatic follow-up prompt | Don't write a new prompt; use the one the app generated |

## Expected Errors & Fixes

| Error | Fix |
|---|---|
| "Invalid JSON" | Re-copy the entire response block (use triple-click) |
| "Expected array, got object" in Step 2 | Step 2 returns `[array]` not `{object}`; check ChatGPT output |
| ChatGPT returns text prose instead of JSON | You pasted into the Step 1 conversation instead of new one |
| "Missing articles" warning | Normal with 12+ articles. Do the follow-up (3 more clicks). |
| Copy button doesn't work | Try refreshing page (Cmd+R or Ctrl+R) |

## Time Estimates

- Step 1: 3–5 min
- Zendesk search: ~30 sec (automatic)
- Step 2: 5–15 min (depends on article count)
- Follow-up (if needed): 3–5 min
- **Total: 10–25 minutes**

## Links & Commands

```bash
# Start the app
npm run dev

# Restart servers if needed
npm run restart
```

**ChatGPT:**
- [Hi Marley Project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project)
- [Plain ChatGPT](https://chatgpt.com)

## When Each Copy Button Is Used

| Button | When to Use |
|---|---|
| "Copy Prompt for ChatGPT Project" | You're in Hi Marley's ChatGPT project (recommended) |
| "Copy Full Prompt (no project)" | You're on plain ChatGPT.com without the project |

Use the same button for both Step 1 and Step 2.

## JSON Formats (For Reference)

**Step 1 response** (paste back to app):
```json
{
  "featureChanges": ["Feature A", "Feature B"],
  "recommendedArticles": [{ "title": "...", "action": "update_existing", "reason": "..." }],
  "searchQueries": ["query 1", "query 2"]
}
```

**Step 2 response** (paste back to app) — **must be an array**:
```json
[
  {
    "articleId": 12345678,
    "alreadyCovered": false,
    "affectedSections": "Section name",
    "specificImpact": "What changed and why",
    "proposedCopy": [{ "section": "...", "changeType": "update_text", "instruction": "...", "proposedText": "..." }],
    "screenshotsToUpdate": [{ "section": "...", "filename": "...", "reason": "..." }]
  }
]
```

---

**Full guide:** See `MANUAL_MODE_GUIDE.md`  
**Developer docs:** See `CLAUDE.md` section "Manual Mode (OpenAI Quota Workaround)"
