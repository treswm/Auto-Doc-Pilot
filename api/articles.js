/**
 * Articles API
 * Scans articles for screenshots and tracks screenshot update decisions
 */

import express from "express";
import fs from "fs";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

const APPROVAL_STATE_PATH = "config/approval_state.json";
const SCREENSHOT_STATE_PATH = "config/screenshot_state.json";
const AUDIT_LOG_PATH = "config/audit_log.json";
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || "himarley";
const ZENDESK_BRAND_ID = process.env.ZENDESK_STAGING_BRAND_ID || "49194539612563";

function loadApprovalState() {
  if (!fs.existsSync(APPROVAL_STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(APPROVAL_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function loadScreenshotState() {
  if (!fs.existsSync(SCREENSHOT_STATE_PATH)) return { screenshots: {} };
  try {
    return JSON.parse(fs.readFileSync(SCREENSHOT_STATE_PATH, "utf-8"));
  } catch {
    return { screenshots: {} };
  }
}

function saveScreenshotState(data) {
  fs.writeFileSync(SCREENSHOT_STATE_PATH, JSON.stringify(data, null, 2));
}

function loadAuditLog() {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return { logs: [] };
  try {
    return JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, "utf-8"));
  } catch {
    return { logs: [] };
  }
}

function saveAuditLog(data) {
  fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(data, null, 2));
}

function addAuditEntry(screenshotId, action, user) {
  const log = loadAuditLog();
  log.logs.push({
    screenshotId,
    action,
    user: user || "unknown",
    timestamp: new Date().toISOString(),
  });
  saveAuditLog(log);
}

/**
 * Check if this is a new workflow cycle (new Monday morning)
 * If so, reset any "update_later" items back to "pending"
 */
function handleNewWorkflowCycle() {
  const state = loadScreenshotState();
  const now = new Date();
  const lastCycleStr = state.lastWorkflowCycle;

  // If no last cycle recorded, set it and return
  if (!lastCycleStr) {
    state.lastWorkflowCycle = now.toISOString();
    saveScreenshotState(state);
    return;
  }

  const lastCycle = new Date(lastCycleStr);

  // Check if a week has passed (workflow runs weekly on Mondays)
  const timeSinceLast = now.getTime() - lastCycle.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  if (timeSinceLast >= oneWeek) {
    // New cycle detected — reset all "update_later" items to "pending"
    let resetCount = 0;
    for (const id in state.screenshots) {
      if (state.screenshots[id].status === "update_later") {
        state.screenshots[id].status = "pending";
        state.screenshots[id].resetAt = now.toISOString();
        addAuditEntry(id, "reset_from_update_later", "system");
        resetCount++;
      }
    }

    // Update last cycle timestamp
    state.lastWorkflowCycle = now.toISOString();
    saveScreenshotState(state);

    console.log(`[New Workflow Cycle] Reset ${resetCount} "update_later" items back to pending`);
  }
}

/**
 * Extract images, GIFs, and videos from HTML body
 * Returns array of { src, alt, type: 'image' | 'gif' | 'video' }
 */
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
      // Determine if it's a GIF or regular image
      const type = src.toLowerCase().endsWith('.gif') ? 'gif' : 'image';
      media.push({ src, alt, type });
    }
  }

  // Extract embedded videos (YouTube, Vimeo, Wistia, etc.)
  const iframeRegex = /<iframe[^>]+>/gi;
  const iframeSrcRegex = /src=["']([^"']+)["']/i;
  const titleRegex = /title=["']([^"']*)["']/i;

  while ((match = iframeRegex.exec(html)) !== null) {
    const tag = match[0];
    const src = iframeSrcRegex.exec(tag)?.[1] || "";
    const title = titleRegex.exec(tag)?.[1] || "";
    
    // Only include video hosting platforms
    if (src && (src.includes('youtube') || src.includes('vimeo') || src.includes('wistia'))) {
      media.push({ src, alt: title || 'Embedded video', type: 'video' });
    }
  }

  return media;
}



/**
 * Build Zendesk published article URL.
 * Links to the published article, which allows users to click the "Edit" button to access the editor.
 * This avoids the complexity of mapping numeric IDs to internal UUIDs.
 */
function buildEditorUrl(articleId) {
  // Format: https://{subdomain}.zendesk.com/hc/en-us/articles/{articleId}
  return `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/en-us/articles/${articleId}`;
}

// GET /api/articles/screenshots
router.get("/screenshots", requireAuth, (req, res) => {
  // Check if this is a new workflow cycle and reset "update_later" items
  handleNewWorkflowCycle();

  const state = loadApprovalState();
  const screenshotState = loadScreenshotState();

  const pendingApproval = [];
  const invalidDate = [];
  const articles = [];
  const resolved = [];

  function makeScreenshot(articleId, articleTitle, img, index) {
    const id = `${articleId}_${index}`;
    const saved = screenshotState.screenshots[id] || {};
    return {
      id,
      articleId: String(articleId),
      articleTitle,
      src: img.src,
      alt: img.alt,
      status: saved.status || "pending",
      updatedAt: saved.updatedAt || null,
      updatedBy: saved.updatedBy || null,
      zendeskEditorUrl: buildEditorUrl(articleId),
    };
  }

  // 1. Pending Approval — screenshots in articles awaiting an approval vote
  const queuedArticles = state?.pending_approval?.articles || [];
  for (const article of queuedArticles) {
    const imgs = extractImages(article.body);
    imgs.forEach((img, i) => {
      const screenshot = makeScreenshot(article.id, article.title, img, i);
      if (screenshot.status === "pending") {
        pendingApproval.push(screenshot);
      } else {
        resolved.push(screenshot);
      }
    });
  }

  // 2. Invalid Date — screenshots in articles whose last-updated date is stale (> 90 days)
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const seenInvalidIds = new Set();
  for (const run of state?.history || []) {
    for (const article of run.articles || []) {
      if (seenInvalidIds.has(article.id)) continue;
      const updatedMs = new Date(article.updated_at || article.timestamp || 0).getTime();
      if (updatedMs > 0 && updatedMs < ninetyDaysAgo) {
        const imgs = extractImages(article.body);
        if (imgs.length > 0) {
          seenInvalidIds.add(article.id);
          imgs.forEach((img, i) => {
            const screenshot = makeScreenshot(article.id, article.title, img, i);
            if (screenshot.status === "pending") {
              invalidDate.push(screenshot);
            } else {
              resolved.push(screenshot);
            }
          });
        }
      }
    }
  }

  // 3. Articles — all articles from history that contain screenshots
  const seenArticleIds = new Set();
  for (const run of state?.history || []) {
    for (const article of run.articles || []) {
      if (seenArticleIds.has(article.id)) continue;
      const imgs = extractImages(article.body);
      if (imgs.length > 0) {
        seenArticleIds.add(article.id);
        imgs.forEach((img, i) => {
          const screenshot = makeScreenshot(article.id, article.title, img, i);
          if (screenshot.status === "pending") {
            articles.push(screenshot);
          } else {
            resolved.push(screenshot);
          }
        });
      }
    }
  }

  res.json({
    pendingApproval,
    invalidDate,
    articles,
    resolved,
    total: pendingApproval.length + invalidDate.length + articles.length + resolved.length,
  });
});

// PATCH /api/articles/screenshots/:id — update a screenshot's status
router.patch("/screenshots/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["updated", "update_later", "no_update", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Use: updated, update_later, no_update, pending" });
  }

  const user = req.user?.name || req.user?.email || "unknown";
  const data = loadScreenshotState();
  data.screenshots[id] = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: user,
  };
  saveScreenshotState(data);

  // Log the action
  addAuditEntry(id, status, user);

  res.json({ message: "Screenshot status updated", id, status });
});

// POST /api/articles/save-scanned-images — save images from scanned translation articles
router.post("/save-scanned-images", requireAuth, (req, res) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images)) {
      return res.status(400).json({ error: "images must be an array" });
    }

    const state = loadScreenshotState();
    let savedCount = 0;

    for (const img of images) {
      const id = `${img.articleId}_${img.index}`;

      // Only save if not already tracked
      if (!state.screenshots[id]) {
        state.screenshots[id] = {
          articleId: String(img.articleId),
          articleTitle: img.articleTitle,
          src: img.src,
          alt: img.alt,
          status: "pending",
          createdAt: new Date().toISOString(),
          source: "scanned"
        };
        savedCount++;
      }
    }

    saveScreenshotState(state);
    res.json({
      success: true,
      message: `Saved ${savedCount} new images from scanned articles`,
      savedCount
    });
  } catch (err) {
    console.error("Error saving scanned images:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/audit-log — retrieve audit log
router.get("/audit-log", requireAuth, (req, res) => {
  const log = loadAuditLog();
  res.json(log);
});

export default router;
