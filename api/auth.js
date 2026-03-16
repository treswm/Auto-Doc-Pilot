/**
 * Auth API
 * POC: Simple email-based login with session
 * Future: Slack OAuth
 */

import express from "express";
import fs from "fs";

const router = express.Router();
const APPROVERS_PATH = "config/approvers.json";

// POST /api/auth/login
// POC: accepts any email that matches an approver, or any email for dev mode
router.post("/login", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Load approvers to check if email is recognized
  let approvers = [];
  try {
    const data = JSON.parse(fs.readFileSync(APPROVERS_PATH, "utf-8"));
    approvers = data.approvers || [];
  } catch {
    // If no approvers file, allow any email in dev mode
  }

  const knownApprover = approvers.find(
    (a) => a.email?.toLowerCase() === email.toLowerCase()
  );

  // Build user object
  const user = knownApprover
    ? {
        id: knownApprover.slack_user_id || email,
        name: knownApprover.name,
        email: knownApprover.email,
        role: knownApprover.role,
        source: "approvers_list",
      }
    : {
        id: email,
        name: email.split("@")[0],
        email,
        role: "viewer",
        source: "guest",
      };

  // Save to session
  req.session.user = user;

  res.json(user);
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.json({ message: "Logged out" });
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json(req.session.user);
});

// GET /api/auth/slack
// Placeholder for Slack OAuth redirect (Step 2 extension)
router.get("/slack", (req, res) => {
  res.status(501).json({
    error: "Slack OAuth not yet configured",
    message: "Use email login for now. Slack OAuth requires app approval.",
  });
});

export default router;
