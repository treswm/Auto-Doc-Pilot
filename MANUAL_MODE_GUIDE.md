# Manual Mode User Guide

## Overview

**Manual Mode** is a workaround for when the OpenAI API quota is exhausted. Instead of the app making API calls to analyze releases, you copy prompts to ChatGPT's web interface, paste responses back, and the app produces the same results.

**Use Manual Mode when:**
- You see an error like `❌ OpenAI API error: You exceeded your current quota`
- The `/analyze-impact` or `/search-and-flag` endpoints time out
- You want to test release impact analysis outside the API

**Identical to normal mode:** The article cards, proposed edits, screenshot flags, and export options are all the same. The only difference is the delivery method — copy/paste instead of background API calls.

---

## Full Workflow (15–25 minutes)

### Prerequisites

- Manual Mode toggle enabled in the Releases tab header
- Access to [Hi Marley's ChatGPT project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project) (recommended) or plain ChatGPT.com
- Release notes ready (text, PDF file, or URL)

### PHASE 1: Upload Release Notes

1. In the **Releases** tab, toggle **"Manual Mode"** ON (blue toggle in the header)
   - The tab should now say "Manual Mode" next to the toggle
2. Upload or paste your release notes:
   - **Text input:** Paste release notes directly into the text box
   - **PDF upload:** Click "Upload PDF" and select your file
   - **URL:** Paste a URL to release notes
3. Click the blue **"Continue"** button (or similar)
4. Wait ~2 seconds for the app to validate the input

**Expected:** The app shows "Step 1 - Identify Features" with a prompt text box and two copy buttons.

---

### STEP 1: Identify Features Affected

**Time:** 3–5 minutes

#### 1a. Copy the Prompt

The app displays a large prompt box starting with "You are an expert..." 

You'll see two copy buttons:
- **"Copy Prompt for ChatGPT Project"** ← Use this for Hi Marley's project
- **"Copy Full Prompt (no project)"** ← Use this for plain ChatGPT

Choose based on where you're pasting:
- **If using Hi Marley's ChatGPT project:** Click **"Copy Prompt for ChatGPT Project"**
- **If using plain ChatGPT.com:** Click **"Copy Full Prompt (no project)"**

The prompt is now in your clipboard.

#### 1b. Open ChatGPT

1. Open [Hi Marley's ChatGPT project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project) 
   - OR go to [ChatGPT.com](https://chatgpt.com)
2. **Start a new conversation** — do not reuse an old conversation
   - Click the "+" or "New chat" button

**Important:** Each step must be in a fresh conversation. If you paste Step 2 into the Step 1 conversation, ChatGPT will misinterpret it and write full articles instead of returning JSON.

#### 1c. Paste and Run

1. Paste the prompt (Cmd+V or Ctrl+V)
2. Hit Enter and wait for ChatGPT to respond
3. ChatGPT will return a JSON response like:

```json
{
  "featureChanges": ["Inbox notification options", "Admin configuration"],
  "recommendedArticles": [
    {
      "title": "Managing Your Inbox",
      "action": "update_existing",
      "reason": "New notification option added to inbox"
    }
  ],
  "searchQueries": ["inbox notifications", "notification options"]
}
```

#### 1d. Copy and Paste Back

1. Select and copy the entire JSON response (use triple-click to select the code block)
2. In the app, find the **"Paste ChatGPT Response"** box under Step 1
3. Paste the JSON (Cmd+V or Ctrl+V)
4. Click the blue **"Continue"** button

**Expected:** The app validates the JSON and moves to Step 2. You'll see "Step 2 - Analyze Articles" with a new prompt and the note: "Articles found: N"

---

### STEP 2: Analyze Individual Articles

**Time:** 5–15 minutes (depends on number of articles)

The app automatically searched Zendesk and fetched article content based on Step 1's recommended features. Now Step 2 analyzes each article individually.

#### 2a. Copy the Step 2 Prompt

You'll see another prompt box starting with "You are an expert Help Center...". Below it, you'll see:
- **"Copy Prompt for ChatGPT Project"** or **"Copy Full Prompt (no project)"** (same choice as Step 1)
- **"Articles found: 8"** (or however many)

Click the same copy button you used in Step 1.

#### 2b. Start a NEW ChatGPT Conversation

**This is critical.** Do not paste Step 2 into your Step 1 conversation.

1. Go back to ChatGPT (same project or plain ChatGPT as Step 1)
2. Start a **completely new conversation** (click "+" or "New chat")
3. Do not copy anything from the Step 1 conversation

#### 2c. Paste and Run

1. Paste the Step 2 prompt
2. Hit Enter and wait (may take 30–60 seconds for 8+ articles)
3. ChatGPT returns a **JSON array**, like:

```json
[
  {
    "articleId": 12345678,
    "alreadyCovered": false,
    "affectedSections": "Inbox Configuration",
    "specificImpact": "Section now includes new 'Dismiss for Myself' option",
    "proposedCopy": [
      {
        "section": "Inbox Configuration",
        "changeType": "update_text",
        "instruction": "Update the notification options list",
        "proposedText": "You can dismiss notifications for yourself only..."
      }
    ],
    "screenshotsToUpdate": [
      {
        "section": "Inbox Configuration",
        "filename": "notification-dropdown.png",
        "reason": "Add 'Dismiss for Myself' to the screenshot"
      }
    ]
  },
  { /* ... more article objects ... */ }
]
```

**Important:** The response must be a **JSON array** (starts with `[` and ends with `]`), and it must include every article, even ones marked `alreadyCovered: true`.

#### 2d. Copy and Paste Back

1. Select and copy the entire JSON array
2. In the app, find the **"Paste ChatGPT Response"** box under Step 2
3. Paste the JSON array
4. Click **"Show Results"**

**Expected:** Results display as article cards. If articles were fully analyzed, you see cards like:
- Article title
- ✏️ "Proposed Edits" section with specific text changes
- 📸 "Screenshots to Update" with filenames and reasons
- Buttons to copy edits or copy to clipboard

---

## Special Case: Missing Articles (Truncation)

If ChatGPT's Step 2 response was incomplete, the app **automatically detects** which articles weren't analyzed.

You'll see an **amber warning** like:
```
⚠️ 3 article(s) missing from analysis:
• Article Title A
• Article Title B
• Article Title C
```

### What Happened

When Step 2 includes many articles (12+), ChatGPT sometimes runs out of context and stops mid-response, leaving some articles unanalyzed. The app detected this by checking which article IDs made it into the response vs. which were sent to ChatGPT.

### What to Do

The app has automatically generated a **follow-up prompt** for only the missing articles.

#### 3a. Copy the Follow-up Prompt

Below the "Missing articles" section, you'll see another prompt box:

- **"Copy Prompt for ChatGPT Project"** or **"Copy Full Prompt (no project)"**

Click the same option you used before.

#### 3b. Start Another New ChatGPT Conversation

1. Go back to ChatGPT
2. Start a **third new conversation** (not Step 1, not Step 2)
3. Paste the follow-up prompt

ChatGPT will return a JSON array with only 2–3 articles (much faster than Step 2).

#### 3c. Paste the Follow-up Response

1. Copy the JSON array from ChatGPT
2. Paste into the **"Paste Follow-up Response"** box
3. Click **"Merge Results"**

**Expected:** The app merges the follow-up articles with Step 2 results. The amber warning disappears. You now have complete analysis for all articles.

#### 3d. View Final Results

Click **"Show Results"** to see the final merged output with all articles analyzed.

---

### Alternative: Skip Follow-up (Partial Results)

If the follow-up is inconvenient, you can skip it:

1. Click **"Skip (show partial results only)"**
2. The app displays results for articles that were analyzed in Step 2
3. You can analyze missing articles manually later, or edit the PDF/CSV yourself

---

## Results Panel

After showing results, you see article cards like:

```
📄 Managing Your Inbox
────────────────────
✏️ Proposed Edits
   • Inbox Configuration
     Update the list of notification options to include 'Dismiss for Myself'
     [Copy] [Copy to Clipboard]

📸 Screenshots to Update
   • notification-options.png (Inbox Configuration)
     The screenshot shows outdated notification options. Update the dropdown to show 'Dismiss for Myself'.

🔗 Location: Integrations > Support Tools > Inbox Operations
[Copy All] [Copy to PDF] [Download PDF] [Export CSV]
```

### Available Actions

- **Copy All** — Copy all proposed edits as plain text (for pasting into a note)
- **Copy to PDF** — Copy one article's section as PDF
- **Download PDF** — Export the full report as a multi-page PDF
- **Export CSV** — Export results as a spreadsheet

All of these work identically to normal (API) mode.

---

## Frequently Asked Questions

### Q: Why do Steps 1 and 2 need separate ChatGPT conversations?

**A:** ChatGPT interprets conversation context. If you paste Step 2 into the Step 1 conversation, ChatGPT sees it as "continue analyzing release notes" and writes full articles instead of returning a JSON data structure. Starting a new conversation resets the context, so ChatGPT treats Step 2 as a new analysis task that should return JSON.

### Q: What if ChatGPT returns an error or invalid JSON?

**A:** 
- **Syntax error:** Make sure the entire response is selected (from `[` to `]` for Step 2, or from `{` to `}` for Step 1). Partial copies cause parsing errors.
- **"Unexpected field" error:** ChatGPT may have added extra fields. You can usually still paste it back — the app ignores unknown fields.
- **Timeout:** If pasting doesn't work after 10 seconds, try copying again and pasting into a fresh text box.

### Q: What if some articles say `alreadyCovered: true`?

**A:** Include them in the JSON array when you paste back. The app filters out `alreadyCovered: true` articles before displaying results, so you'll see only the articles that actually need updates.

### Q: Can I use plain ChatGPT instead of Hi Marley's project?

**A:** Yes. Click **"Copy Full Prompt (no project)"** instead of **"Copy Prompt for ChatGPT Project"**. The full prompt includes system instructions, so it works on plain ChatGPT.com. Results are identical.

### Q: What if I see the "missing articles" warning?

**A:** The app has already generated a follow-up prompt. Just copy it, paste into a fresh ChatGPT conversation, copy the response back, and click **"Merge Results"**. It's one extra round-trip (5–10 minutes), but you get complete results instead of partial ones.

### Q: Can I edit the proposed text before exporting?

**A:** Not in Manual Mode (no edit UI yet). You can:
- Copy results to a text editor and edit manually
- Download the PDF, open in a PDF editor, and annotate
- Copy proposed text into your actual Help Center article and refine there

### Q: How long does this take?

**A:** 
- Step 1: 3–5 minutes (identify features)
- Zendesk search: ~30 seconds (automatic)
- Step 2: 5–15 minutes (analyze articles; slower with 12+ articles)
- Follow-up (if needed): 3–5 minutes (only missing articles)
- **Total:** 10–25 minutes depending on release size and whether follow-up is needed

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Invalid JSON" error when pasting Step 1 response | Make sure you copied the entire `{...}` block. Partial JSON causes parsing errors. Re-select using triple-click and try again. |
| "Expected array, got object" error when pasting Step 2 | Step 2 response must be a `[...]` array, not a single `{...}` object. Check that ChatGPT returned an array starting with `[`. |
| ChatGPT returns text instead of JSON | Make sure you started a new conversation. Continuing the previous conversation causes ChatGPT to write articles instead of returning data. |
| "Missing articles" warning after Step 2 | This is expected with 12+ articles. Copy the follow-up prompt, paste in a new ChatGPT conversation, and merge the response. |
| Copy buttons not working | Make sure JavaScript is enabled and the browser tab is active. Try refreshing the page. |
| App crashes after pasting | Check browser console (F12) for error messages. Report any `JSON.parse` errors to the development team. |

---

## Tips for Best Results

1. **Use Hi Marley's project** if available — it's trained on your writing style and context
2. **Keep release notes under 10 pages** — very large PDFs may slow down Step 1
3. **Review proposed text** — ChatGPT's suggestions are usually good but may need tone adjustments
4. **Check screenshot filenames** — Proposed filenames should match what's actually in your Help Center
5. **If Step 2 has 15+ articles**, expect a follow-up for 2–3 missing ones — this is normal
6. **Save frequently** — The app doesn't auto-save; download PDFs/CSVs when you're done reviewing

---

## When to Use Manual Mode vs. Normal Mode

| Scenario | Use Manual Mode | Use Normal Mode |
|---|---|---|
| OpenAI API quota exhausted | ✅ Yes | ❌ No |
| Testing release impact analysis | ✅ Yes | ✅ Yes |
| Large releases (20+ features) | ❌ Slow (multiple follow-ups) | ✅ Faster (single API call) |
| You want ChatGPT's interface | ✅ Yes | ❌ No |
| You want background processing | ❌ No | ✅ Yes |
| Integrating with other tools | ❌ No | ✅ Yes (API calls) |

---

## Next Steps

After viewing results:

1. **Review the proposed edits** in the results panel
2. **Download the PDF report** for documentation
3. **Export as CSV** if you need to track article updates in a spreadsheet
4. **Copy individual edits** and apply them to Help Center articles in Zendesk
5. **Check screenshots** — validate that the suggested filenames are correct and screenshots actually need updating

All export and copy features work exactly the same as normal (non-manual) mode.
