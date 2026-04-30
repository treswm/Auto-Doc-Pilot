/**
 * Product Context API
 * Read and update config/product-context.json — the growing knowledge base
 * that informs release impact scanning.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();
const CONTEXT_PATH = path.join(process.cwd(), "config", "product-context.json");

function loadContext() {
  const raw = fs.readFileSync(CONTEXT_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveContext(data) {
  data._lastUpdated = new Date().toISOString().split("T")[0];
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * GET /api/product-context
 * Returns all current product knowledge rules.
 */
router.get("/", requireAuth, (req, res) => {
  try {
    const data = loadContext();
    res.json({
      success: true,
      rules: data.releaseToDocRules || [],
      lastUpdated: data._lastUpdated || null,
    });
  } catch (err) {
    console.error("Error loading product context:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/product-context/rules
 * Add a new plain-English rule.
 * Body: { rule: string }
 */
router.post("/rules", requireAuth, (req, res) => {
  try {
    const { rule } = req.body;
    if (!rule || typeof rule !== "string" || !rule.trim()) {
      return res.status(400).json({ success: false, error: "rule is required and must be a non-empty string" });
    }

    const data = loadContext();
    if (!Array.isArray(data.releaseToDocRules)) data.releaseToDocRules = [];

    const trimmed = rule.trim();

    // Prevent exact duplicates
    if (data.releaseToDocRules.includes(trimmed)) {
      return res.status(409).json({ success: false, error: "This rule already exists." });
    }

    data.releaseToDocRules.push(trimmed);
    saveContext(data);

    console.log(`📚 Product context rule added: "${trimmed.substring(0, 80)}..."`);
    res.json({ success: true, rules: data.releaseToDocRules });
  } catch (err) {
    console.error("Error adding product context rule:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/product-context/rules/:index
 * Edit an existing rule by index.
 * Body: { rule: string }
 */
router.patch("/rules/:index", requireAuth, (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const { rule } = req.body;
    if (!rule || typeof rule !== "string" || !rule.trim()) {
      return res.status(400).json({ success: false, error: "rule is required" });
    }

    const data = loadContext();
    if (!Array.isArray(data.releaseToDocRules) || index < 0 || index >= data.releaseToDocRules.length) {
      return res.status(404).json({ success: false, error: "Rule index out of range" });
    }

    data.releaseToDocRules[index] = rule.trim();
    saveContext(data);

    res.json({ success: true, rules: data.releaseToDocRules });
  } catch (err) {
    console.error("Error editing product context rule:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/product-context/rules/:index
 * Remove a rule by its array index.
 */
router.delete("/rules/:index", requireAuth, (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const data = loadContext();

    if (!Array.isArray(data.releaseToDocRules) || index < 0 || index >= data.releaseToDocRules.length) {
      return res.status(404).json({ success: false, error: "Rule index out of range" });
    }

    const removed = data.releaseToDocRules.splice(index, 1)[0];
    saveContext(data);

    console.log(`🗑️  Product context rule removed: "${removed.substring(0, 80)}"`);
    res.json({ success: true, rules: data.releaseToDocRules });
  } catch (err) {
    console.error("Error removing product context rule:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
