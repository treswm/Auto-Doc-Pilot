/**
 * Release Notes API Endpoints
 * Handles saving release notes and extracting keywords with OpenAI
 */

import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * GET /api/release-notes/input
 * Retrieve the current release notes and version
 */
router.get("/input", requireAuth, (req, res) => {
  try {
    const releaseNotes = req.session?.releaseNotes || "";
    const version = req.session?.releaseVersion || "";
    const addedAt = req.session?.releaseVersionTimestamp || null;
    const processedAt = req.session?.releaseProcessedAt || null;
    const extractedKeywords = req.session?.extractedKeywords || [];

    res.json({
      success: true,
      releaseNotes,
      version,
      addedAt,
      processedAt,
      extractedKeywords,
    });
  } catch (err) {
    console.error("Error retrieving release notes:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/release-notes/input
 * Save the release notes and version
 * Body: { releaseNotes: string, version: string }
 */
router.post("/input", requireAuth, (req, res) => {
  try {
    const { releaseNotes, version, markProcessed } = req.body;

    // Handle marking as processed
    if (markProcessed) {
      req.session.releaseProcessedAt = new Date().toISOString();
      console.log(`✅ Release marked as processed at ${req.session.releaseProcessedAt}`);
      return res.json({
        success: true,
        message: "Release marked as processed",
        processedAt: req.session.releaseProcessedAt,
      });
    }

    if (typeof releaseNotes !== "string") {
      return res.status(400).json({
        success: false,
        error: "releaseNotes must be a string",
      });
    }

    if (!version || typeof version !== "string") {
      return res.status(400).json({
        success: false,
        error: "version is required and must be a string",
      });
    }

    // Save to session (in production, save to database with timestamp)
    req.session.releaseNotes = releaseNotes;
    req.session.releaseVersion = version;
    req.session.releaseVersionTimestamp = new Date().toISOString();

    console.log(
      `✅ Release notes added (v${version}, ${releaseNotes.length} characters)`
    );

    res.json({
      success: true,
      message: "Release notes added successfully",
      version,
      length: releaseNotes.length,
      addedAt: req.session.releaseVersionTimestamp,
    });
  } catch (err) {
    console.error("Error saving release notes:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/release-notes/extract-keywords
 * Extract keywords from release notes using OpenAI
 * Body: { releaseNotes: string }
 */
router.post("/extract-keywords", requireAuth, async (req, res) => {
  try {
    const { releaseNotes } = req.body;

    if (!releaseNotes || typeof releaseNotes !== "string") {
      return res.status(400).json({
        success: false,
        error: "releaseNotes is required and must be a string",
      });
    }

    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }

    console.log(`🤖 Extracting keywords from release notes...`);

    // Build the system prompt
    const systemPrompt = `You are a Help Center content strategist. Given release notes, extract the
key features, components, and topics that might require Help Center article updates.

Return ONLY a comma-separated list of keywords (no explanations, no numbered list).
Focus on: new features, changed components, APIs, integrations, services.
Limit to 8-12 most important keywords.
Keep keywords concise (1-3 words each).`;

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Extract keywords from these release notes:\n\n${releaseNotes}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await openaiResponse.json();
    const keywordsText = data.choices[0].message.content.trim();
    
    // Parse keywords from comma-separated text
    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .slice(0, 15); // Limit to 15 keywords

    // Store keywords in session for later use
    req.session.extractedKeywords = keywords;

    // Return keywords in both array and comma-separated formats
    const keywordsForSearch = keywords.join(", ");

    console.log(
      `✅ Keywords extracted: [${keywords.join(", ")}]`
    );

    res.json({
      success: true,
      keywords,
      keywordsForSearch,
      count: keywords.length,
      tokens: data.usage.total_tokens,
    });
  } catch (err) {
    console.error("Keyword extraction error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
