/**
 * Approvers API
 * Read/write config/approvers.json
 */

import express from "express";
import fs from "fs";
import { requireAdmin } from "../middleware/requireAuth.js";

const router = express.Router();
const APPROVERS_PATH = "config/approvers.json";

function loadApprovers() {
  const data = JSON.parse(fs.readFileSync(APPROVERS_PATH, "utf-8"));
  return data;
}

function saveApprovers(data) {
  fs.writeFileSync(APPROVERS_PATH, JSON.stringify(data, null, 2));
}

// GET /api/approvers
router.get("/", (req, res) => {
  try {
    const data = loadApprovers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/approvers — add a new approver
router.post("/", requireAdmin, (req, res) => {
  const { name, email, slack_user_id, role } = req.body;

  if (!name || !email || !slack_user_id) {
    return res
      .status(400)
      .json({ error: "name, email, and slack_user_id are required" });
  }

  try {
    const data = loadApprovers();
    const exists = data.approvers.find((a) => a.slack_user_id === slack_user_id);
    if (exists) {
      return res
        .status(409)
        .json({ error: "Approver with that Slack ID already exists" });
    }

    data.approvers.push({
      name,
      email,
      slack_user_id,
      role: role || "reviewer",
    });

    saveApprovers(data);
    res.status(201).json({ message: "Approver added", approvers: data.approvers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/approvers/:slackUserId — update approver role
router.put("/:slackUserId", requireAdmin, (req, res) => {
  const { slackUserId } = req.params;
  const { role } = req.body;

  if (!role || !["admin", "reviewer"].includes(role)) {
    return res.status(400).json({ error: "role must be 'admin' or 'reviewer'" });
  }

  try {
    const data = loadApprovers();
    const approver = data.approvers.find((a) => a.slack_user_id === slackUserId);
    if (!approver) {
      return res.status(404).json({ error: "Approver not found" });
    }

    approver.role = role;
    saveApprovers(data);
    res.json({ message: "Role updated", approvers: data.approvers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/approvers/:slackUserId — remove an approver
router.delete("/:slackUserId", requireAdmin, (req, res) => {
  const { slackUserId } = req.params;

  try {
    const data = loadApprovers();
    const before = data.approvers.length;
    data.approvers = data.approvers.filter(
      (a) => a.slack_user_id !== slackUserId
    );

    if (data.approvers.length === before) {
      return res.status(404).json({ error: "Approver not found" });
    }

    saveApprovers(data);
    res.json({ message: "Approver removed", approvers: data.approvers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
