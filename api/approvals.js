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

  // Build args: always pass sectionId (defaults to Best Practices for demo)
  const args = [schedulerPath, "--now"];
  args.push(`--section=${sectionId || DEMO_SECTION_ID}`);

  // Run scheduler --now as a background child process
  const child = execFile(
    process.execPath,
    args,
    { detached: true, stdio: "ignore" },
    (err) => {
      if (err) {
        console.error("Workflow trigger error:", err.message);
      }
    }
  );

  child.unref(); // Let it run independently

  const finalSectionId = sectionId || DEMO_SECTION_ID;
  const sectionLabel = finalSectionId === "49206877282195" ? "Best Practices (demo)" : `Section ${finalSectionId}`;

  res.json({
    message: "Workflow triggered",
    note: "Running in background. Check the Translation tab in ~30 seconds for pending approvals.",
    scanning: sectionLabel,
  });
});

export default router;
