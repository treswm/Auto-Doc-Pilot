# Manual Mode Documentation Index

## Quick Navigation

**You are here:** Manual Mode is now fully implemented and documented. Read this page first to navigate to the right guide for your needs.

---

## Choose Your Guide

### 👤 **I'm a User Testing Manual Mode**
→ Start with **[`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md)**
- Complete step-by-step instructions (15–25 minutes)
- Screenshots and visual descriptions
- Troubleshooting guide
- FAQ (answers common questions)
- Expected outputs at each step

### ⚡ **I Need the Quick Checklist**
→ See **[`MANUAL_MODE_QUICK_START.md`](./MANUAL_MODE_QUICK_START.md)**
- 8-step process (1 page)
- Error fixes (3 common issues)
- Time estimates
- JSON format examples to copy/paste

### 🔧 **I'm a Developer / DevOps**
→ Check **[`CLAUDE.md`](./CLAUDE.md)** section "Manual Mode (OpenAI Quota Workaround)"
- 6 API endpoints (manual mode only)
- Detailed implementation (helpers, session state, merging logic)
- Consistency guarantees between auto and manual modes
- Architecture overview

### 📋 **I Want the Full Technical Details**
→ Read **[`MANUAL_MODE_IMPLEMENTATION_SUMMARY.md`](./MANUAL_MODE_IMPLEMENTATION_SUMMARY.md)**
- What was built (4 core features)
- All code changes (5 files modified/created)
- Happy path vs. truncation scenario
- Testing checklist
- Known limitations and future improvements

---

## What Is Manual Mode?

**Short version:** When the OpenAI API quota is exhausted, Manual Mode lets you use ChatGPT's web interface instead. You copy prompts, paste responses, and get identical results.

**When to use:**
- ❌ OpenAI API quota exhausted (`You exceeded your current quota` error)
- 📊 Testing release impact analysis
- 🔍 Learning what the AI sees before making decisions

**Time required:**
- Happy path (no truncation): 10–15 minutes
- With truncation follow-up: 15–25 minutes

---

## The Workflow at a Glance

```
1. Toggle "Manual Mode" ON

2. STEP 1: Identify Features Affected
   Copy prompt → Open ChatGPT (new conversation) → Paste → Copy JSON → Paste back

3. STEP 2: Analyze Individual Articles
   Copy prompt → Open ChatGPT (new conversation) → Paste → Copy JSON → Paste back
   
   IF "Missing Articles" warning appears:
   ├─ Copy follow-up prompt → ChatGPT (new conversation) → Paste → Copy → Paste back
   └─ Click "Merge Results"

4. Download PDF, Export CSV, or Copy Edits
```

**Key rule:** Each step uses a separate ChatGPT conversation. Reusing conversations causes ChatGPT to misinterpret and write full articles instead of returning JSON.

---

## Files in This Documentation

| File | Size | Purpose | Read Time |
|---|---|---|---|
| `MANUAL_MODE_README.md` (this file) | 3 KB | Navigation index | 2 min |
| `MANUAL_MODE_QUICK_START.md` | 3.5 KB | 8-step checklist + quick ref | 3 min |
| `MANUAL_MODE_GUIDE.md` | 14 KB | Full workflow + FAQ + troubleshooting | 15 min |
| `MANUAL_MODE_IMPLEMENTATION_SUMMARY.md` | 11 KB | What was built, technical details | 10 min |
| `CLAUDE.md` (section: Manual Mode) | Part of 15 KB file | Developer docs, API endpoints | 5 min |

---

## Testing Before You Use

### Prerequisites

- App running: `npm run dev` (port 3000)
- ChatGPT access: [Hi Marley project](https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project) or [plain ChatGPT](https://chatgpt.com)
- Release notes ready (text, PDF, or URL)

### Test It

1. Go to **Releases tab** in the app
2. Toggle **"Manual Mode"** ON (should turn blue)
3. Upload any release notes (even a small test one)
4. Follow the steps in `MANUAL_MODE_GUIDE.md`
5. See article recommendations appear

---

## Troubleshooting Flowchart

```
❌ Error after pasting Step 1/2 response?
  ├─ "Invalid JSON" → You copied only part of the response
  │  └─ Fix: Re-copy using triple-click to select whole block
  │
  ├─ "Expected array" in Step 2 → Response wasn't a JSON array
  │  └─ Fix: Step 2 returns [...], not {...}. Check ChatGPT output.
  │
  └─ Parse error → Syntax issue in JSON
     └─ Fix: Try pasting into a JSON validator (jsonlint.com) first

⚠️ "Missing articles" warning?
  ├─ This is normal with 12+ articles (ChatGPT ran out of context)
  └─ Fix: Use the auto-generated follow-up prompt (3 more steps)

📱 App doesn't respond to "Copy" button?
  ├─ JavaScript disabled → Enable it
  ├─ Browser tab not active → Click the app window
  └─ Page needs refresh → Cmd+R or Ctrl+R

❌ Can't find "Manual Mode" toggle?
  └─ Make sure you're in the "Releases" tab (not Translation or Outdated)
```

For more help, see **[`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md) → Troubleshooting** section.

---

## Key Differences: Manual Mode vs. Normal Mode

| Aspect | Manual Mode | Normal Mode |
|---|---|---|
| **How it works** | Copy → ChatGPT → Paste (you control) | API call (automatic) |
| **Speed** | 10–25 min (manual steps) | 2–5 min (automatic) |
| **When to use** | API quota exhausted | Normal operation |
| **ChatGPT quality** | Same (uses Hi Marley project) | Same (uses product context) |
| **Results** | Identical | Identical |
| **Exports** | PDF, CSV, copy buttons all work | PDF, CSV, copy buttons all work |

---

## The 4 Core Features Implemented

1. **Copy/Paste Workflow**
   - Replace 2 API calls with manual ChatGPT interactions
   - Two-step analysis (features → articles)
   - JSON request/response format

2. **Automatic Truncation Detection**
   - App compares returned articles against what was sent to ChatGPT
   - Detects missing articles automatically (no user detection needed)
   - Returns count and list in UI

3. **Automatic Follow-up Prompt Generation**
   - When articles missing, app generates follow-up prompt automatically
   - Includes only missing articles (not the full batch again)
   - User just copy → paste without writing a new prompt

4. **Graceful Merging**
   - User pastes follow-up response
   - App merges with Step 2 results automatically
   - Final results complete and consistent

---

## Next Steps

1. **First time using Manual Mode?** → Read [`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md)
2. **Already read the guide?** → Use [`MANUAL_MODE_QUICK_START.md`](./MANUAL_MODE_QUICK_START.md) as quick reference
3. **Need to debug something?** → Check the Troubleshooting section in [`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md)
4. **Want to understand the code?** → See [`CLAUDE.md`](./CLAUDE.md) or [`MANUAL_MODE_IMPLEMENTATION_SUMMARY.md`](./MANUAL_MODE_IMPLEMENTATION_SUMMARY.md)

---

## Server Commands

```bash
# Start app (includes React dev server + Express API)
npm run dev

# Restart servers (if needed)
npm run restart

# Just the API server (port 3001)
npm run server

# Just the React dev server (port 5173, proxies /api to 3001)
npm run vite
```

---

## Useful Links

- **App:** http://localhost:3000 (when `npm run dev` is running)
- **API Health Check:** http://localhost:3001/api/health
- **ChatGPT Hi Marley Project:** https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project
- **Plain ChatGPT:** https://chatgpt.com

---

## Questions?

- **How do I use Manual Mode?** → Read [`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md)
- **How does it work technically?** → Read [`CLAUDE.md`](./CLAUDE.md) section "Manual Mode"
- **What was implemented?** → Read [`MANUAL_MODE_IMPLEMENTATION_SUMMARY.md`](./MANUAL_MODE_IMPLEMENTATION_SUMMARY.md)
- **I need a quick reminder** → See [`MANUAL_MODE_QUICK_START.md`](./MANUAL_MODE_QUICK_START.md)

---

## Status

✅ **Fully Implemented and Tested**

- ✅ Manual Mode UI with toggle
- ✅ Step 1: Identify features (ChatGPT copy/paste)
- ✅ Step 2: Analyze articles (ChatGPT copy/paste)
- ✅ Automatic truncation detection
- ✅ Automatic follow-up prompt generation
- ✅ Graceful result merging
- ✅ Comprehensive user documentation
- ✅ Developer documentation
- ✅ API endpoints for all operations
- ✅ Server verified running

Ready to use. See [`MANUAL_MODE_GUIDE.md`](./MANUAL_MODE_GUIDE.md) to get started.

---

*Last updated: April 22, 2026*
*Manual Mode Implementation: Complete (Options B + C)*
