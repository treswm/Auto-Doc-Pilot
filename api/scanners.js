/**
 * Article Scanner API Endpoints
 * Exposes three scanner functions for different workflow phases
 */

import express from "express";
import {
  fetchRecentlyEditedArticles,
  fetchOutdatedArticles,
  fetchProductReleaseArticles,
} from "../lib/zendesk-api.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || "himarley";

// Helper: Build Help Center article URL
function helpCenterUrl(articleId, locale = "en-us") {
  return `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${locale}/articles/${articleId}`;
}

/**
 * GET /api/scanners/recent
 * Phase 1: Fetch recently edited articles (default: last 7 days)
 * Query params: daysBack (optional, default 7), limit (optional, default 50)
 */
router.get("/recent", requireAuth, async (req, res) => {
  try {
    const daysBack = parseInt(req.query.daysBack) || 7;
    const limit = parseInt(req.query.limit) || 50;

    console.log(
      `📋 Scanning recent articles (last ${daysBack} days, limit ${limit})`
    );

    const articles = await fetchRecentlyEditedArticles(daysBack, "en-us", limit);

    // Enrich with Help Center URLs
    const enriched = articles.map((a) => ({
      ...a,
      helpCenterUrl: helpCenterUrl(a.id),
      helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
      phase: "translation",
    }));

    res.json({
      success: true,
      phase: "Phase 1: Translation",
      scanType: "Recently Edited",
      articlesCount: enriched.length,
      parameters: { daysBack, limit },
      articles: enriched,
    });
  } catch (err) {
    console.error("Error scanning recent articles:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/scanners/outdated
 * Phase 2: Fetch outdated articles (default: not updated in 90+ days)
 * Query params: daysSinceUpdate (optional, default 90), limit (optional, default 50)
 */
router.get("/outdated", requireAuth, async (req, res) => {
  try {
    const daysSinceUpdate = parseInt(req.query.daysSinceUpdate) || 30;
    const limit = parseInt(req.query.limit) || 50;

    console.log(
      `📋 Scanning outdated articles (${daysSinceUpdate}+ days (outdated threshold), limit ${limit})`
    );

    const articles = await fetchOutdatedArticles(
      daysSinceUpdate,
      "en-us",
      limit
    );

    // Enrich with Help Center URLs
    const enriched = articles.map((a) => ({
      ...a,
      helpCenterUrl: helpCenterUrl(a.id),
      helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
      phase: "outdated_detection",
      daysStale: Math.floor(
        (Date.now() - new Date(a.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    res.json({
      success: true,
      phase: "Phase 2: Outdated Detection",
      scanType: "Outdated Articles",
      articlesCount: enriched.length,
      parameters: { daysSinceUpdate, limit },
      articles: enriched,
    });
  } catch (err) {
    console.error("Error scanning outdated articles:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/scanners/releases
 * Phase 3: Fetch articles related to product release keywords
 * Query params: keywords (comma-separated string, required), limit (optional, default 50)
 * Example: /api/scanners/releases?keywords=AI,Mobile,Dashboard&limit=50
 */
router.get("/releases", requireAuth, async (req, res) => {
  try {
    const keywordsParam = req.query.keywords;

    if (!keywordsParam) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: keywords (comma-separated)',
        example:
          "/api/scanners/releases?keywords=AI,Mobile,Dashboard&limit=50",
      });
    }

    const keywords = keywordsParam
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
    const limit = parseInt(req.query.limit) || 50;

    console.log(
      `📋 Scanning release-related articles (keywords: [${keywords.join(", ")}], limit ${limit})`
    );

    const articles = await fetchProductReleaseArticles(keywords, "en-us", limit);

    // Enrich with Help Center URLs
    const enriched = articles.map((a) => ({
      ...a,
      helpCenterUrl: helpCenterUrl(a.id),
      helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
      phase: "release_updates",
    }));

    res.json({
      success: true,
      phase: "Phase 3: Release Updates",
      scanType: "Product Release Articles",
      articlesCount: enriched.length,
      parameters: { keywords, limit },
      articles: enriched,
    });
  } catch (err) {
    console.error("Error scanning release articles:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scanners/search-and-flag
 * Search and flag articles based on cached release analysis
 * Body: { releaseId: string, releaseTitle: string }
 * Uses: cached analysis from session (populated by /api/release-notes/analyze-impact)
 * Flow: use cached analysis → search articles → return flagged articles
 */
router.post("/search-and-flag", requireAuth, async (req, res) => {
  try {
    const { releaseId, releaseTitle } = req.body;

    if (!releaseId || !releaseTitle) {
      return res.status(400).json({
        success: false,
        error: "releaseId and releaseTitle are required",
      });
    }

    console.log(`🔍 Using cached release impact analysis...`);

    // Step 1: Get the cached analysis from session
    const cachedAnalysis = req.session?.releaseImpactAnalysis;
    if (!cachedAnalysis) {
      throw new Error("No analysis data found. Please analyze the release first.");
    }

    const analysis = cachedAnalysis;

    const searchQueries = analysis.searchQueries || [];
    const affectedFeatures = analysis.affectedFeatures || [];
    const recommendedArticles = analysis.recommendedArticles || [];

    console.log(`📊 Release analysis complete:`);
    console.log(`   Affected features: ${affectedFeatures.length}`);
    console.log(`   Recommended articles: ${recommendedArticles.length}`);
    console.log(`   Search queries: ${searchQueries.length}`);

    // Step 2: Search for articles using the search queries
    const allArticles = [];
    const seenIds = new Set();

    for (const query of searchQueries) {
      console.log(`   Searching for: "${query}"`);
      const articles = await fetchProductReleaseArticles([query], "en-us", 25);
      articles.forEach((a) => {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          allArticles.push(a);
        }
      });
    }

    console.log(`✅ Found ${allArticles.length} unique articles`);

    // Enrich articles with Help Center URLs
    const enrichedArticles = allArticles.map((a) => ({
      ...a,
      helpCenterUrl: helpCenterUrl(a.id),
      helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
      phase: "release_updates",
    }));

    // Return analysis and articles (frontend will call flag-by-release to persist)
    res.json({
      success: true,
      releaseId,
      releaseTitle,
      analysis: {
        affectedFeatures,
        recommendedArticles,
        searchQueries,
      },
      foundArticles: enrichedArticles,
      articleCount: enrichedArticles.length,
    });
  } catch (err) {
    console.error("Error in search-and-flag:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/scanners/info
 * Returns information about available scanners
 */
router.get("/info", requireAuth, (req, res) => {
  res.json({
    scanners: [
      {
        endpoint: "GET /api/scanners/recent",
        phase: "Phase 1: Translation",
        description: "Scans for recently edited articles",
        parameters: {
          daysBack: "number (optional, default 7)",
          limit: "number (optional, default 50)",
        },
        example: "/api/scanners/recent?daysBack=7&limit=50",
      },
      {
        endpoint: "GET /api/scanners/outdated",
        phase: "Phase 2: Outdated Detection",
        description: "Scans for articles not updated in N+ days",
        parameters: {
          daysSinceUpdate: "number (optional, default 90)",
          limit: "number (optional, default 50)",
        },
        example: "/api/scanners/outdated?daysSinceUpdate=90&limit=50",
      },
      {
        endpoint: "GET /api/scanners/releases",
        phase: "Phase 3: Release Updates",
        description: "Scans for articles matching product release keywords",
        parameters: {
          keywords: "string (required, comma-separated)",
          limit: "number (optional, default 50)",
        },
        example: "/api/scanners/releases?keywords=AI,Mobile,Dashboard&limit=50",
      },
    ],
  });
});

export default router;
