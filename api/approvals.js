/**
 * Approvals API
 * REST endpoints wrapping approval-manager.js
 * Handles pending approvals, voting, history, and workflow trigger
 */

import express from "express";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import {
  loadApprovalState,
  recordApproval,
  getApprovalStatus,
} from "../lib/approval-manager.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = express.Router();
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || "himarley";

// Build a Help Center article URL from an article ID
function helpCenterUrl(articleId, locale = "en-us") {
  return `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${locale}/articles/${articleId}`;
}

// Extract images from HTML content
function extractImages(html) {
  if (!html) return [];
  const media = [];

  // Extract images and GIFs
  const imgRegex = /<img[^>]+>/gi;
  const srcRegex = /src=["']([^"']+)["']/i;
  const altRegex = /alt=["']([^"']*)["']/i;

  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const src = srcRegex.exec(tag)?.[1] || "";
    const alt = altRegex.exec(tag)?.[1] || "";

    if (src) {
      media.push({ src, alt });
    }
  }

  if (media.length > 0) {
    console.log(`🖼️ extractImages found ${media.length} images`);
  }

  return media;
}

// GET /api/approvals/pending
// Returns the current pending approval round (if any)
router.get("/pending", requireAuth, (req, res) => {
  try {
    const state = loadApprovalState();

    if (!state.current_run_id) {
      return res.json({ pending: null, message: "No active approval round" });
    }

    // Enrich articles with Help Center links
    const articles = (state.articles || []).map((a) => ({
      ...a,
      helpCenterUrl: helpCenterUrl(a.id),
      helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
    }));

    res.json({
      pending: {
        runId: state.current_run_id,
        timestamp: state.run_timestamp,
        articles,
        approvalsNeeded: state.approvals_needed,
        approvalsReceived: state.approvals_received,
        allApproved: state.all_approved,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/history
// Returns past approval rounds from CSV audit logs
router.get("/history", requireAuth, (req, res) => {
  try {
    const outputDir = "output";
    if (!fs.existsSync(outputDir)) {
      return res.json({ history: [] });
    }

    const csvFiles = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith(".csv"))
      .sort()
      .reverse()
      .slice(0, 20); // Last 20 runs

    const history = csvFiles.map((filename) => {
      const content = fs.readFileSync(path.join(outputDir, filename), "utf-8");
      const lines = content.trim().split("\n");
      return {
        filename,
        date: filename.replace("phase1_audit_", "").replace(".csv", ""),
        rows: lines.length - 1, // Minus header
        preview: lines.slice(0, 2).join("\n"),
      };
    });

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/download-csv/:filename
// Download a CSV audit log file
router.get("/download-csv/:filename", (req, res) => {
  try {
    const { filename } = req.params;

    // Security: only allow translation_*.csv files (supports both old and new naming)
    if (!filename.match(/^(phase1_audit_|translation_update_).*\.csv$/)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const outputDir = "output";
    const filepath = path.join(outputDir, filename);

    // Verify file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Send file as attachment
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error("Download error:", err);
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/state
// Returns full raw approval state (for debugging)
router.get("/state", requireAdmin, (req, res) => {
  try {
    const state = loadApprovalState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/approvals/:runId/vote
// Submit an approve or deny vote for a run
router.post("/:runId/vote", requireAuth, (req, res) => {
  const { runId } = req.params;
  const { approved } = req.body;
  const user = req.user;

  if (typeof approved !== "boolean") {
    return res
      .status(400)
      .json({ error: "'approved' must be true or false" });
  }

  if (!user?.role || user.role === "viewer") {
    return res
      .status(403)
      .json({ error: "Only admins and reviewers can vote" });
  }

  try {
    const state = recordApproval(
      runId,
      user.id,
      user.name || user.email,
      approved
    );

    res.json({
      message: approved ? "Approved" : "Denied",
      runId,
      voter: user.name || user.email,
      allApproved: state.all_approved,
      approvalsReceived: state.approvals_received,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/workflow/trigger
// Manually trigger the Phase 1 workflow (runs scheduler --now in background)
// For demo: scans Best Practices section (49206877282195) by default
// Supports optional ?sectionId=ID to scan a different section
// Note: No auth required — safe for automated/cron execution
router.post("/trigger", (req, res) => {
  const schedulerPath = path.resolve("scheduler.js");
  const DEMO_SECTION_ID = "49206877282195"; // Best Practices section
  const { sectionId } = req.query;

  if (!fs.existsSync(schedulerPath)) {
    return res.status(500).json({ error: "scheduler.js not found" });
  }

  // Generate a unique runId for this workflow execution
  const runId = `phase1_${Date.now()}`;

  // Build args: always pass sectionId (defaults to Best Practices for demo)
  const args = [schedulerPath, "--now"];
  args.push(`--section=${sectionId || DEMO_SECTION_ID}`);
  args.push(`--runId=${runId}`);

  // Run scheduler --now as a background child process
  const child = execFile(
    process.execPath,
    args,
    { detached: true, stdio: "pipe" }, // Changed from "ignore" to "pipe" to capture output
    (err) => {
      if (err) {
        console.error("Workflow trigger error:", err.message);
      }
    }
  );

  // Capture stdout and stderr for debugging
  if (child.stdout) {
    child.stdout.on("data", (data) => {
      console.log(`[workflow] ${data}`);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (data) => {
      console.error(`[workflow] ${data}`);
    });
  }

  child.unref(); // Let it run independently

  const finalSectionId = sectionId || DEMO_SECTION_ID;
  const sectionLabel = finalSectionId === "49206877282195" ? "Best Practices (demo)" : `Section ${finalSectionId}`;

  res.json({
    message: "Workflow triggered",
    runId: runId,
    note: "Running in background. Check the Translation tab in ~30 seconds for pending approvals.",
    scanning: sectionLabel,
  });
});

// GET /api/approvals/status/:runId
// Returns the current translation status for a specific run
// Status file location: ~/.focus-desk/translation-status-{runId}.json
router.get("/status/:runId", requireAuth, (req, res) => {
  try {
    const { runId } = req.params;

    const STATUS_DIR = path.join(
      process.env.HOME || process.env.USERPROFILE,
      ".focus-desk"
    );
    const statusFile = path.join(STATUS_DIR, `translation-status-${runId}.json`);

    // If status file doesn't exist, return pending status
    if (!fs.existsSync(statusFile)) {
      return res.json({
        runId,
        status: "pending",
        message: "Workflow starting...",
        articlesTranslated: 0,
        articlesFailed: 0,
        totalArticles: 0,
      });
    }

    // Read and return status file
    const statusContent = fs.readFileSync(statusFile, "utf-8");
    const statusData = JSON.parse(statusContent);

    res.json(statusData);
  } catch (err) {
    console.error("Error reading translation status:", err.message);
    res.status(500).json({
      error: "Failed to read translation status",
      message: err.message,
    });
  }
});

export default router;

// GET /api/approvals/scan-section
// Scan a section for articles that need translation
// Returns articles where English version is newer than French translation
router.get("/scan-section", (req, res) => {
  const { sectionId = "49206877282195" } = req.query; // Default to Best Practices
  
  (async () => {
    try {
      console.log(`\n📋 Scanning section ${sectionId} for translation candidates...`);
      
      const articles = [];
      let nextPage = `/help_center/en-us/sections/${sectionId}/articles.json?page[size]=100`;
      const zendeskBaseUrl = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
      
      // Fetch all articles in the section
      while (nextPage) {
        const res = await fetch(`${zendeskBaseUrl}${nextPage}`, {
          headers: {
            Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to fetch articles: ${res.status} ${text}`);
        }
        
        const data = await res.json();
        const sectionArticles = data.articles || [];
        
        for (const article of sectionArticles) {
          if (article.draft) continue; // Skip drafts

          // Fetch full article content to get body with images
          const fullArticleRes = await fetch(
            `${zendeskBaseUrl}/help_center/articles/${article.id}.json`,
            { headers: { Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}` } }
          );

          let fullArticleBody = article.body || "";
          if (fullArticleRes.ok) {
            const fullArticleData = await fullArticleRes.json();
            fullArticleBody = fullArticleData.article?.body || article.body || "";
          }

          // Check if French translation exists
          const translationRes = await fetch(
            `${zendeskBaseUrl}/help_center/articles/${article.id}/translations/fr-ca.json`,
            { headers: { Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}` } }
          );

          let frenchUpdatedAt = null;
          if (translationRes.ok) {
            const frenchData = await translationRes.json();
            frenchUpdatedAt = frenchData.translation?.updated_at;
          }

          // Compare timestamps
          const englishUpdatedAt = article.updated_at;
          const needsTranslation = !frenchUpdatedAt || new Date(englishUpdatedAt) > new Date(frenchUpdatedAt);

          // Extract images from the full article body
          const images = extractImages(fullArticleBody);

          if (needsTranslation && images.length > 0) {
            console.log(`📋 Article ${article.id} (${article.title}): needsTranslation=${needsTranslation}, images=${images.length}`);
          }

          articles.push({
            id: article.id,
            title: article.title,
            englishUpdatedAt,
            frenchUpdatedAt,
            needsTranslation,
            url: article.html_url,
            images,
          });
        }
        
        nextPage = data.next_page ? data.next_page.replace(zendeskBaseUrl, "") : null;
      }
      
      const needsTranslation = articles.filter(a => a.needsTranslation);
      console.log(`✅ Found ${articles.length} articles, ${needsTranslation.length} need translation`);
      
      res.json({
        sectionId,
        total: articles.length,
        needingTranslation: needsTranslation.length,
        articles: articles.sort((a, b) => new Date(b.englishUpdatedAt) - new Date(a.englishUpdatedAt)),
      });
    } catch (err) {
      console.error("Scan error:", err.message);
      res.status(500).json({ error: err.message });
    }
  })();
});
