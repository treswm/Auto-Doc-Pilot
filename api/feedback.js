/**
 * Feedback API
 * Stores AI quality feedback and updates glossary.json for translation corrections
 */

import express from "express";
import fs from "fs";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();
const FEEDBACK_LOG = "config/feedback_log.json";
const GLOSSARY_PATH = "glossary.json";

function loadFeedback() {
  if (!fs.existsSync(FEEDBACK_LOG)) return { feedback: [] };
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_LOG, "utf-8"));
  } catch {
    return { feedback: [] };
  }
}

function saveFeedback(data) {
  fs.writeFileSync(FEEDBACK_LOG, JSON.stringify(data, null, 2));
}

/**
 * Parse a correction comment and attempt to update glossary.json
 * Looks for patterns like: "X should be Y" or "use Y for X"
 */
function applyGlossaryCorrection(correctionText, type) {
  if (!correctionText || type !== "translation") return false;

  let glossary;
  try {
    glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, "utf-8"));
  } catch {
    return false;
  }

  // Pattern: "X" should be "Y" (quoted or unquoted)
  const match = correctionText.match(
    /[""']?(.+?)[""']?\s+should (?:be|translate to)\s+[""']?(.+?)[""']?(?:\s|$)/i
  );

  if (match) {
    const [, englishTerm, frenchCorrection] = match;
    const existing = glossary.find(
      (g) => g.english?.toLowerCase() === englishTerm.trim().toLowerCase()
    );

    if (existing) {
      existing.french = frenchCorrection.trim();
      existing.feedback_corrected = true;
      existing.last_corrected = new Date().toISOString();
    } else {
      glossary.push({
        english: englishTerm.trim(),
        french: frenchCorrection.trim(),
        category: "feedback_correction",
        context: "Added via dashboard feedback",
        feedback_corrected: true,
        last_corrected: new Date().toISOString(),
      });
    }

    fs.writeFileSync(GLOSSARY_PATH, JSON.stringify(glossary, null, 2));
    return true;
  }

  return false;
}

// POST /api/feedback/translation
router.post("/translation", requireAuth, (req, res) => {
  const { entityId, rating, correction } = req.body;
  if (!rating) return res.status(400).json({ error: "rating is required" });

  const data = loadFeedback();
  const entry = {
    id: `fb_${Date.now()}`,
    type: "translation",
    entity_id: entityId || "unknown",
    rating,
    correction: correction || null,
    user: req.user?.name || req.user?.email || "unknown",
    timestamp: new Date().toISOString(),
    glossary_updated: false,
  };

  if (rating === "bad" && correction) {
    entry.glossary_updated = applyGlossaryCorrection(correction, "translation");
  }

  data.feedback.push(entry);
  saveFeedback(data);

  res.json({
    message: "Feedback saved",
    glossaryUpdated: entry.glossary_updated,
  });
});

// POST /api/feedback/outdated
router.post("/outdated", requireAuth, (req, res) => {
  const { entityId, rating, correction } = req.body;
  if (!rating) return res.status(400).json({ error: "rating is required" });

  const data = loadFeedback();
  data.feedback.push({
    id: `fb_${Date.now()}`,
    type: "outdated",
    entity_id: entityId || "unknown",
    rating,
    correction: correction || null,
    user: req.user?.name || req.user?.email || "unknown",
    timestamp: new Date().toISOString(),
  });

  saveFeedback(data);
  res.json({ message: "Feedback saved" });
});

// POST /api/feedback/release
router.post("/release", requireAuth, (req, res) => {
  const { entityId, rating, correction } = req.body;
  if (!rating) return res.status(400).json({ error: "rating is required" });

  const data = loadFeedback();
  data.feedback.push({
    id: `fb_${Date.now()}`,
    type: "release",
    entity_id: entityId || "unknown",
    rating,
    correction: correction || null,
    user: req.user?.name || req.user?.email || "unknown",
    timestamp: new Date().toISOString(),
  });

  saveFeedback(data);
  res.json({ message: "Feedback saved" });
});

// GET /api/feedback/history
router.get("/history", requireAuth, (req, res) => {
  const data = loadFeedback();
  const { type } = req.query;
  const items = type
    ? data.feedback.filter((f) => f.type === type)
    : data.feedback;
  res.json({ feedback: items.slice(-100).reverse() }); // Latest 100
});

export default router;
