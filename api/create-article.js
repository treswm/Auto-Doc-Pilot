/**
 * Create Article API Endpoints
 * Feedback-only endpoint — prompt generation happens client-side.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * POST /api/create-article/feedback
 * Save feedback about an article creation result to improve future prompts.
 * Body: { description, feedback, rating (1-5) }
 */
router.post("/feedback", requireAuth, async (req, res) => {
  try {
    const { description, feedback, rating } = req.body;
    if (!feedback?.trim() && !rating) {
      return res.status(400).json({ success: false, error: "feedback or rating is required" });
    }

    const configPath = path.join(process.cwd(), "config", "create-article-examples.json");
    let data = { examples: [] };
    try { data = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch (e) {}
    if (!Array.isArray(data.examples)) data.examples = [];

    data.examples.push({
      timestamp: new Date().toISOString(),
      topic: description || "unknown",
      feedback: feedback?.trim() || "",
      rating: typeof rating === "number" ? rating : null,
    });

    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`💬 Create-article feedback saved (rating: ${rating ?? "none"})`);

    res.json({ success: true });
  } catch (err) {
    console.error("Create article feedback error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
