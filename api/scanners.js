/**
 * Article Scanner API Endpoints
 * Exposes three scanner functions for different workflow phases
 */

import express from "express";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  fetchRecentlyEditedArticles,
  fetchOutdatedArticles,
  fetchProductReleaseArticles,
} from "../lib/zendesk-api.js";
import { extractImagesWithSections, htmlToText } from "../lib/article-processor.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { sanitizeAndParseJson } from "../lib/json-sanitizer.js";

const router = express.Router();

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || "himarley";

/**
 * Build a map of section_id → { sectionName, categoryId, categoryName }.
 * This context is passed to per-article analysis so the AI can make informed
 * relevance decisions (e.g. "this is an API doc" or "this is a Partners guide").
 * No hard exclusions are applied here — the AI decides based on context.
 * Returns an empty Map on failure (safe fallback).
 */
async function buildSectionContextMap() {
  try {
    const headers = {
      Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`,
      Accept: "application/json",
    };
    const [catResp, secResp] = await Promise.all([
      fetch(`https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/help_center/categories.json?per_page=100`, { headers }),
      fetch(`https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/help_center/sections.json?per_page=100`, { headers }),
    ]);
    const catData = catResp.ok ? await catResp.json() : { categories: [] };
    const secData = secResp.ok ? await secResp.json() : { sections: [] };

    const categoryNames = new Map((catData.categories || []).map(c => [c.id, c.name]));
    const map = new Map();
    for (const s of secData.sections || []) {
      map.set(s.id, {
        sectionName: s.name,
        categoryId: s.category_id,
        categoryName: categoryNames.get(s.category_id) || "Unknown",
      });
    }
    console.log(`📂 Loaded section context map (${map.size} sections, ${categoryNames.size} categories)`);
    return map;
  } catch (e) {
    console.log(`⚠️  Could not load section context map: ${e.message}`);
    return new Map();
  }
}

// Helper: Build Help Center article URL
function helpCenterUrl(articleId, locale = "en-us") {
  return `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${locale}/articles/${articleId}`;
}
// Helper: Find matching recommendation by title similarity
// Helper: Find matching recommendation by title similarity
function findMatchingRecommendation(articleTitle, recommendations) {
  if (!articleTitle || !recommendations || recommendations.length === 0) {
    return null;
  }

  // Extract keywords from article title (lowercase, remove common words)
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with', 'how', 'do', 'i', 'you', 'is', 'are']);
  const articleWords = new Set(
    articleTitle
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
  );

  let bestMatch = null;
  let bestScore = 0;

  for (const rec of recommendations) {
    if (typeof rec === 'string') continue;
    const recTitle = rec.title || '';

    const recWords = new Set(
      recTitle
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2 && !commonWords.has(word))
    );

    // Calculate Jaccard similarity
    const intersection = new Set([...articleWords].filter(word => recWords.has(word)));
    const union = new Set([...articleWords, ...recWords]);
    let score = union.size > 0 ? intersection.size / union.size : 0;

    // Boost score if recommendation has a reason
    if (rec.reason && rec.reason.length > 10) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = rec;
    }
  }

  // Much lower threshold - accept any match with keyword overlap if it has a reason
  const threshold = bestMatch && bestMatch.reason ? 0.1 : 0.25;
  return bestScore > threshold ? bestMatch : null;
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
    
    console.log(`🔍 Analysis data:`, JSON.stringify({
      affectedFeatures: analysis.affectedFeatures?.length || 0,
      recommendedArticles: analysis.recommendedArticles?.length || 0,
      firstRec: analysis.recommendedArticles?.[0]
    }, null, 2));

    const searchQueries = analysis.searchQueries || [];
    const affectedFeatures = analysis.affectedFeatures || [];
    const recommendedArticles = analysis.recommendedArticles || [];

    console.log(`📊 Release analysis complete:`);
    console.log(`   Affected features: ${affectedFeatures.length}`);
    console.log(`   Recommended articles: ${recommendedArticles.length}`);
    console.log(`   Search queries: ${searchQueries.length}`);

    // Step 2: Fetch section context map (section name + category name per article)
    // Used to give the AI accurate context about what type of article it's analyzing.
    const sectionContextMap = await buildSectionContextMap();

    // Step 3: Search for articles (single pass — build articlesFoundByQuery at the same time)
    const allArticles = [];
    const seenIds = new Set();
    const articlesFoundByQuery = new Map();

    for (const query of searchQueries) {
      console.log(`   Searching for: "${query}"`);
      const articles = await fetchProductReleaseArticles([query], "en-us", 25);
      articlesFoundByQuery.set(query, articles.map(a => a.id));
      articles.forEach((a) => {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          allArticles.push(a);
        }
      });
    }

    console.log(`✅ Found ${allArticles.length} unique articles`);

    // Step 4: Pre-filter — only remove the release notes section itself.
    // Integration/partner articles are NOT hard-excluded here; the AI per-article
    // analysis decides relevance based on release content and article category context.
    const RELEASE_NOTES_SECTION_ID = 1500000353602;
    const filteredArticles = allArticles.filter(a => {
      if (a.section_id === RELEASE_NOTES_SECTION_ID) {
        console.log(`⏭️  Skipping "${a.title}" (release note itself)`);
        return false;
      }
      return true;
    });

    console.log(`📋 After pre-filter: ${filteredArticles.length} articles (removed ${allArticles.length - filteredArticles.length} release notes)`);

    // Step 5: Attach initial recommendation metadata (action, screenshot flag, related features)
    // These are placeholder values that will be OVERRIDDEN by per-article analysis below.
    const enrichedArticles = filteredArticles.map((a) => {
      // Find the best-matching recommendation by seeing which query found this article
      let recommendation = null;
      for (const rec of recommendedArticles) {
        if (typeof rec !== 'object') continue;
        for (const query of searchQueries) {
          if ((articlesFoundByQuery.get(query) || []).includes(a.id)) {
            recommendation = rec;
            break;
          }
        }
        if (recommendation) break;
      }

      return {
        ...a,
        helpCenterUrl: helpCenterUrl(a.id),
        helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
        // reason and sectionToUpdate are placeholder — overridden by per-article analysis
        reason: recommendation?.reason || null,
        affectedFeatures: recommendation?.relatedFeatures || [],
        action: recommendation?.action || null,
        sectionToUpdate: recommendation?.sectionToUpdate || null,
        suggestedPlacement: recommendation?.suggestedPlacement || null,
        screenshotUpdateNeeded: recommendation?.screenshotUpdateNeeded || false,
        phase: "release_updates",
      };
    });


        // Analyze each article to determine specifically affected sections
    // Get release notes text from session (needed for per-article analysis)
    const releaseNotes = req.session?.releaseNotes || '';

    const scanWarnings = [];

    // ── Phase 1: Fetch all article content from Zendesk in parallel ──────────
    console.log(`📥 Fetching content for ${enrichedArticles.length} article(s) from Zendesk...`);
    const contentResults = await Promise.all(enrichedArticles.map(async (article) => {
      try {
        const articleResponse = await fetch(
          `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/help_center/articles/${article.id}.json`,
          {
            headers: {
              "Authorization": `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`,
              "Accept": "application/json"
            }
          }
        );
        if (!articleResponse.ok) {
          return { article, fetchError: `Zendesk HTTP ${articleResponse.status}` };
        }
        const articleData = await articleResponse.json();
        const fullContent = articleData.article?.body || "";
        const articleImages = extractImagesWithSections(fullContent);
        const sectionCtx = sectionContextMap.get(article.section_id) || {};
        return {
          article,
          fullContent,
          articleImages,
          articleSectionName: sectionCtx.sectionName || "",
          articleCategoryName: sectionCtx.categoryName || "",
        };
      } catch (err) {
        return { article, fetchError: err.message };
      }
    }));
    console.log(`✅ Content fetch complete. Analyzing ${enrichedArticles.length} article(s) with AI...`);

    // ── Phase 2: Analyze each article sequentially (respects OpenAI rate limits) ──
    for (let i = 0; i < contentResults.length; i++) {
      const { article, fullContent, articleImages, articleSectionName, articleCategoryName, fetchError } = contentResults[i];

      if (fetchError) {
        const warnMsg = `Could not fetch article content for "${article.title}" (${fetchError}) — article skipped`;
        console.log(`⚠️  ${warnMsg}`);
        scanWarnings.push(warnMsg);
        article.alreadyCovered = true;
        article.affectedSections = "";
        article.specificImpact = "";
        article.proposedCopy = [];
        continue;
      }

      if (articleSectionName) {
        console.log(`   [${i + 1}/${enrichedArticles.length}] "${article.title}" — ${articleCategoryName} > ${articleSectionName}`);
      }
      if (articleImages.length > 0) {
        console.log(`   📸 ${articleImages.length} image(s) found in article`);
      }

      try {
        // Analyze with OpenAI (internal HTTP call to reuse the endpoint logic)
        const analysisResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/release-notes/analyze-article-impact`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie || ''
          },
          body: JSON.stringify({
            releaseNotes,
            articleTitle: article.title,
            articleContent: fullContent,
            articleSectionName,
            articleCategoryName,
            articleImages,
            articleLastUpdated: article.updated_at || null,
          })
        });

        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();

          // Surface token-limit truncations as warnings
          if (analysisData.truncated) {
            const warnMsg = `Token limit hit analyzing "${article.title}" — response was cut off and article was excluded. This may indicate the article is unusually large.`;
            console.warn(`⚠️  ${warnMsg}`);
            scanWarnings.push(warnMsg);
          }

          // Surface JSON parse failures from the AI as warnings
          if (analysisData.parseError) {
            const warnMsg = `Could not parse AI response for "${article.title}" — article excluded. (Parse error: ${analysisData.parseError})`;
            console.warn(`⚠️  ${warnMsg}`);
            scanWarnings.push(warnMsg);
          }

          article.alreadyCovered = analysisData.alreadyCovered || false;

          if (article.alreadyCovered) {
            console.log(`✓ Not relevant: "${article.title}" — filtering out`);
          } else {
            // Per-article analysis is the authoritative source — override the generic
            // recommendation reason so every article gets a unique, accurate description.
            if (analysisData.specificImpact) {
              article.reason = analysisData.specificImpact;
            }
            if (analysisData.affectedSections && analysisData.affectedSections !== 'Already documented') {
              article.sectionToUpdate = analysisData.affectedSections;
            }
            article.affectedSections = analysisData.affectedSections || "";
            article.specificImpact = analysisData.specificImpact || "";
            article.proposedCopy = analysisData.proposedCopy || [];
            article.screenshotsToUpdate = (analysisData.screenshotsToUpdate || []).map(s => {
              // If AI didn't return a type, cross-reference with the article image inventory
              if (s.type) return s;
              const inventoryMatch = articleImages.find(img => img.filename === s.filename);
              return inventoryMatch ? { ...s, type: inventoryMatch.type } : s;
            });
            // Per-article AI is the authoritative source for screenshots.
            // Override the initial recommendation's boolean flag so the UI is specific, not generic.
            article.screenshotUpdateNeeded = article.screenshotsToUpdate.length > 0;
            console.log(`✅ "${article.title}" — ${article.proposedCopy.length} suggested edit(s)${article.screenshotsToUpdate.length > 0 ? `, ${article.screenshotsToUpdate.length} screenshot(s) flagged` : ''}`);
          }
        } else {
          const errText = await analysisResponse.text().catch(() => '');
          const warnMsg = `Analysis failed for "${article.title}" (HTTP ${analysisResponse.status}) — article excluded`;
          console.log(`⚠️  ${warnMsg}: ${errText.slice(0,100)}`);
          scanWarnings.push(warnMsg);
          article.alreadyCovered = true;
          article.affectedSections = "";
          article.specificImpact = "";
          article.proposedCopy = [];
        }
      } catch (err) {
        const warnMsg = `Unexpected error analyzing "${article.title}" — article excluded: ${err.message}`;
        console.error(`⚠️  ${warnMsg}`);
        scanWarnings.push(warnMsg);
        article.alreadyCovered = true;
        article.affectedSections = "";
        article.specificImpact = "";
        article.proposedCopy = [];
      }
    }

    // Log sample of enriched articles for debugging
    console.log(`📊 Sample enriched articles (first 3):`);
    enrichedArticles.slice(0, 3).forEach((a, i) => {
      console.log(`  [${i}] "${a.title}"
    - reason: ${a.reason ? a.reason.substring(0, 60) + '...' : 'NULL'}
    - affectedFeatures: ${JSON.stringify(a.affectedFeatures)}`);
    });

    // Filter out articles where content already covers the release changes
    const actionableArticles = enrichedArticles.filter(a => !a.alreadyCovered);
    const alreadyCoveredCount = enrichedArticles.length - actionableArticles.length;
    if (alreadyCoveredCount > 0) {
      console.log(`✓ Filtered out ${alreadyCoveredCount} already-covered article(s)`);
    }

    // Compute confidence scores and sort actionable articles (highest confidence first)
    actionableArticles.forEach(a => { a.confidence = computeArticleConfidence(a); });
    actionableArticles.sort((a, b) => b.confidence - a.confidence);

    // Store actionable articles and warnings in session
    req.session.lastSearchResults = actionableArticles;
    req.session.lastSearchResults.releaseId = releaseId;
    req.session.scanWarnings = scanWarnings;

    // Extract create_new recommendations for display and store in session
    const releaseNotesText = req.session?.releaseNotes || '';
    const createNewArticles = extractCreateNewArticles(req.session?.releaseImpactAnalysis, releaseNotesText);
    req.session.createNewArticles = createNewArticles;

    // Compute release note sections that produced no documentation output
    const unflaggedFeatures = computeUnflaggedFeatures({
      affectedFeatures,
      recommendedArticles,
      actionableArticles,
      allAnalyzedArticles: enrichedArticles,
      createNewArticles,
    });
    req.session.unflaggedFeatures = unflaggedFeatures;
    if (unflaggedFeatures.length > 0) {
      console.log(`🔍 ${unflaggedFeatures.length} feature(s) produced no article output: ${unflaggedFeatures.map(u => `"${u.title}"`).join(', ')}`);
    }

    if (scanWarnings.length > 0) {
      console.log(`⚠️  ${scanWarnings.length} scan warning(s):`);
      scanWarnings.forEach(w => console.log(`   - ${w}`));
    }
    if (createNewArticles.length > 0) {
      console.log(`🆕 ${createNewArticles.length} new article(s) recommended: ${createNewArticles.map(a => a.title).join(', ')}`);
    }

    // Write run log — overwrites previous run's log for memory hygiene
    await writeRunLog({
      timestamp: new Date().toISOString(),
      releaseVersion: req.session?.releaseVersion || releaseId,
      releaseTitle,
      featuresDetected: affectedFeatures || [],
      searchQueriesUsed: searchQueries || [],
      articlesAnalyzed: enrichedArticles.length,
      alreadyCoveredFiltered: alreadyCoveredCount,
      articlesToUpdate: actionableArticles.map(a => ({
        id: a.id,
        title: a.title,
        confidence: a.confidence,
        action: a.action || 'update_existing',
        reason: a.reason || '',
        sectionToUpdate: a.sectionToUpdate || '',
        proposedEditCount: (a.proposedCopy || []).length,
        screenshotsFlagged: (a.screenshotsToUpdate || []).length,
      })),
      newArticlesToCreate: createNewArticles.map(r => ({
        title: r.title,
        confidence: r.confidence,
        reason: r.reason,
        suggestedPlacement: r.suggestedPlacement,
        relatedFeatures: r.relatedFeatures,
      })),
      unflaggedFeatures: unflaggedFeatures.map(u => u.title),
      warnings: scanWarnings,
    });

    // Return actionable articles only
    const totalFound = actionableArticles.length;

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
      foundArticles: actionableArticles,
      articleCount: actionableArticles.length,
      totalArticlesFound: totalFound,
      warnings: scanWarnings,
      createNewArticles,
      unflaggedFeatures,
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


/**
 * GET /api/scanners/export-results
 * Export all search results as CSV for offline sharing
 * Query: ?releaseId=release_1234567890
 */
router.get('/export-results', requireAuth, async (req, res) => {
  try {
    const { releaseId } = req.query;

    if (!releaseId) {
      return res.status(400).json({ 
        success: false, 
        error: 'releaseId query parameter is required' 
      });
    }

    // Get articles from session storage (they were found during search-and-flag)
    const sessionArticles = req.session?.lastSearchResults || [];
    
    if (!sessionArticles || sessionArticles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No search results found. Please run "Find Affected Articles" first.'
      });
    }

    // Import CSV utilities
    const { articlestoCSV, generateCSVFilename, generateCSVHeaders } = await import('../lib/csv-export.js');

    // Format articles for CSV (use reason descriptions instead of feature list)
    const csvArticles = sessionArticles.map(a => ({
      title: a.title,
      reason: a.reason || '',
      affectedFeatures: a.affectedFeatures || [],
      lastUpdated: a.updated_at || new Date(a.updated_at_in_ms).toISOString().split('T')[0],
      url: a.helpCenterUrl || a.html_url
    }));

    // Generate CSV
    const csv = articlestoCSV(csvArticles);
    const filename = generateCSVFilename(releaseId);
    const headers = generateCSVHeaders(filename);

    // Send as attachment
    res.set(headers);
    res.send(csv);

    console.log(`✅ Exported ${csvArticles.length} articles to CSV: ${filename}`);
  } catch (err) {
    console.error('Error exporting CSV:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// sanitizeAndParseJson imported from ../lib/json-sanitizer.js


// ─── PDF helper: render a single line with inline **bold** support ────────────
// Splits text on **...** markers and alternates between regular and bold font.
function renderInlineBoldLine(doc, text, x, width) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  if (parts.length === 1) {
    // No bold markers — render normally
    doc.font('Helvetica').text(text, x, doc.y, { width, align: 'left' });
    return;
  }
  // Render segments inline using PDFKit continued mode
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    const isLast = pi === parts.length - 1;
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      doc.font('Helvetica-Bold').text(part.slice(2, -2), x, doc.y, { width, continued: !isLast, lineBreak: false });
    } else {
      doc.font('Helvetica').text(part, x, doc.y, { width, continued: !isLast, lineBreak: false });
    }
  }
  // Ensure we end in regular weight for subsequent text
  doc.font('Helvetica');
}

// ─── PDF helper: render proposedText with bullet detection + bold support ─────
function renderFormattedText(doc, text, x, _startY, width) {
  if (!text) return;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { doc.moveDown(0.3); continue; }
    // Bullet: •, -, or * followed by a space (not **bold**)
    const isBullet = (/^[•\-]\s/.test(line) || /^\*\s/.test(line));
    const content  = isBullet ? '\u2022 ' + line.replace(/^[•\-\*]\s+/, '') : line;
    const lx       = isBullet ? x + 8 : x;
    const lw       = isBullet ? width - 8 : width;
    renderInlineBoldLine(doc, content, lx, lw);
    if (i < lines.length - 1) doc.moveDown(0.1);
  }
}

// ─── Helper: build the ChatGPT prompt for drafting a brand-new article ───────
function buildNewArticleDraftPrompt(rec, releaseNotes) {
  const title     = rec.title || 'New Article';
  const reason    = rec.reason || '';
  const placement = rec.suggestedPlacement ? `Suggested placement: ${rec.suggestedPlacement}\n` : '';
  const features  = (rec.relatedFeatures || []).length > 0 ? `Related features: ${rec.relatedFeatures.join(', ')}\n` : '';
  return `You are writing a brand-new Help Center article for Hi Marley's Zendesk Help Center.

ARTICLE TO CREATE
Title: ${title}
${placement}${features}
WHY THIS ARTICLE IS NEEDED
${reason}

RELEVANT RELEASE NOTES
${releaseNotes}

Write a complete, ready-to-publish Help Center article in Hi Marley's voice — professional, clear, and action-oriented. Write for system administrators and operators at insurance carriers.

Structure the article with:
• A brief intro paragraph explaining what the feature is and who it is for
• Prerequisites or access requirements (if applicable)
• Step-by-step instructions for configuring or using the feature
• Any relevant notes, tips, or FAQs

Format in clean HTML suitable for Zendesk Guide. Use <h2> and <h3> for section headers, <p> for paragraphs, <ul><li> for bullets, <ol><li> for steps, and <table> for tabular data. Do NOT include the article title as a heading — Zendesk adds it automatically.`;
}

// ─── Helper: write run log to config/run_log.json (overwrites each run) ───────
async function writeRunLog(logData) {
  try {
    const logPath = path.join(process.cwd(), "config", "run_log.json");
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), "utf-8");
    console.log(`📋 Run log written → config/run_log.json`);
  } catch (e) {
    console.warn(`⚠️  Could not write run log: ${e.message}`);
  }
}

// ─── Helper: compute confidence score for an article update recommendation ────
// Scores 0.0–1.0 based on signal strength from the analysis.
// Higher = more specific, more evidence, more actionable.
function computeArticleConfidence(article) {
  let score = 0.30; // base: article passed both domain gate and content gate

  const copy = article.proposedCopy || [];
  if (copy.length >= 1) score += 0.20; // has at least one concrete edit
  if (copy.length >= 2) score += 0.05; // multiple specific edits
  if (article.sectionToUpdate) score += 0.15; // specific section identified
  if (article.specificImpact && article.specificImpact.length > 50) score += 0.10; // detailed impact
  const featureCount = (article.affectedFeatures || []).length;
  score += Math.min(featureCount * 0.05, 0.15); // more linked features = higher confidence
  if ((article.screenshotsToUpdate || []).length > 0) score += 0.05; // UI change = clearer evidence

  // Age bonus: articles not updated in 12+ months are more likely to contain stale content.
  // A 2-year-old article describing a feature that just changed needs updating more urgently
  // than one updated two weeks ago.
  if (article.updated_at) {
    const ageMonths = Math.floor((Date.now() - new Date(article.updated_at)) / (1000 * 60 * 60 * 24 * 30.44));
    if (ageMonths >= 24)      score += 0.08; // 2+ years: strong staleness signal
    else if (ageMonths >= 12) score += 0.05; // 1-2 years: moderate staleness signal
    else if (ageMonths >= 6)  score += 0.02; // 6-12 months: mild signal
    // < 6 months: no adjustment — recently maintained
  }

  return Math.min(parseFloat(score.toFixed(2)), 1.0);
}

// ─── Helper: compute confidence score for a create_new recommendation ─────────
function computeCreateNewConfidence(rec) {
  let score = 0.40; // base: AI flagged a genuine documentation gap

  if (rec.reason && rec.reason.length > 80) score += 0.15; // detailed reason
  if (rec.suggestedPlacement) score += 0.10; // knows where it belongs
  const featureCount = (rec.relatedFeatures || []).length;
  score += Math.min(featureCount * 0.10, 0.20); // linked features
  // Title length heuristic: too short = vague, too long = uncertain
  if (rec.title && rec.title.length >= 15 && rec.title.length <= 65) score += 0.10;

  return Math.min(parseFloat(score.toFixed(2)), 0.95);
}

// ─── Helper: compute release note sections that produced no documentation output ──
// Returns one entry per affectedFeature that had no actionable article update AND
// no create_new recommendation. Includes reasoning: what was searched and why no
// articles were flagged (already covered, not found, or no documentation impact).
//
// Params:
//   affectedFeatures    – string[] from Step 1 AI (full section titles)
//   recommendedArticles – Step 1 recommendation objects (relatedFeatures, searchQueries, reason)
//   actionableArticles  – articles that passed the alreadyCovered gate
//   allAnalyzedArticles – ALL articles that were analyzed (incl. alreadyCovered ones); null in manual mode
//   createNewArticles   – extracted create_new recommendations
function computeUnflaggedFeatures({
  affectedFeatures,
  recommendedArticles = [],
  actionableArticles,
  allAnalyzedArticles = null,
  createNewArticles,
}) {
  // Features covered by at least one actionable article update
  const coveredByUpdate = new Set(
    actionableArticles.flatMap(a => a.affectedFeatures || [])
  );
  // Features covered by a create_new recommendation
  const coveredByNew = new Set(
    createNewArticles.flatMap(r => r.relatedFeatures || [])
  );

  // Features covered by articles that were found but assessed as already covered
  const coveredButFiltered = new Set(
    (allAnalyzedArticles || [])
      .filter(a => a.alreadyCovered)
      .flatMap(a => a.affectedFeatures || [])
  );

  return (affectedFeatures || [])
    .filter(feature => !coveredByUpdate.has(feature) && !coveredByNew.has(feature))
    .map(feature => {
      // Find any recommendation(s) for this feature
      const matchingRecs = (recommendedArticles || []).filter(
        r => typeof r === 'object' && (r.relatedFeatures || []).includes(feature)
      );

      // Collect search queries from matching recommendations
      const searchQueriesUsed = [...new Set(
        matchingRecs.flatMap(r => r.searchQueries || [])
      )];

      let noOutputReason;
      if (matchingRecs.length === 0) {
        // No recommendation at all — AI assessed this section as not needing docs
        noOutputReason = 'The AI found no documentation impact for this section — the change either doesn\'t introduce new user-facing behavior or is already covered by existing documentation.';
      } else if (coveredButFiltered.has(feature)) {
        // Articles were found and analyzed but assessed as already covering this change
        noOutputReason = 'Existing Help Center articles were found and assessed as already covering this change — no updates are needed.';
      } else if (searchQueriesUsed.length > 0) {
        // Recommendation existed but no articles came back from the searches
        noOutputReason = `No matching Help Center articles were found for the searches used (${searchQueriesUsed.map(q => `"${q}"`).join(', ')}). This may indicate a coverage gap or that the article title doesn't match common search terms.`;
      } else {
        // Recommendation existed but no search queries were defined
        noOutputReason = 'A recommendation existed for this section but no search queries were generated — the AI may have determined no existing article needed updating.';
      }

      return {
        title: feature,
        noOutputReason,
        searchQueriesUsed,
      };
    });
}

// ─── Helper: extract create_new recommendations + attach draft prompts ────────
function extractCreateNewArticles(cachedAnalysis, releaseNotes) {
  const recs = cachedAnalysis?.recommendedArticles || [];
  return recs
    .filter(r => typeof r === 'object' && r.action === 'create_new')
    .map(r => {
      const rec = {
        title:             r.title || 'New Article',
        reason:            r.reason || '',
        suggestedPlacement: r.suggestedPlacement || '',
        relatedFeatures:   r.relatedFeatures || [],
        draftPrompt:       buildNewArticleDraftPrompt(r, releaseNotes || ''),
      };
      rec.confidence = computeCreateNewConfidence(rec);
      return rec;
    })
    .sort((a, b) => b.confidence - a.confidence); // highest confidence first
}

/**
 * GET /api/scanners/export-full-pdf
 * Export a combined PDF: Release Impact Analysis + Found Affected Articles
 */
router.get('/export-full-pdf', requireAuth, (req, res) => {
  try {
    const analysis = req.session?.releaseImpactAnalysis;
    const version = req.session?.releaseVersion || 'Unknown';
    const pdfImageData = req.session?.pdfImageData || null;
    const articles = req.session?.lastSearchResults || [];
    const scanWarnings = req.session?.scanWarnings || [];
    const createNewArticles = req.session?.createNewArticles || [];
    const unflaggedFeatures = req.session?.unflaggedFeatures || [];

    if (!analysis && articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data available. Please run an analysis and find affected articles first.',
      });
    }

    const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Full_Release_Report_v${safeVersion}.pdf"`);
    doc.pipe(res);

    // ── Helper: ensure enough space or add a new page ──
    function ensureSpace(needed) {
      if (doc.y + needed > 720) {
        doc.addPage();
      }
    }

    // ── Helper: section heading ──
    function sectionHeading(text) {
      ensureSpace(40);
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#000000').text(text);
      doc.moveDown(0.4);
    }

    // ════════════════════════════════════════
    // NEW ARTICLES TO CREATE (shown first)
    // ════════════════════════════════════════
    if (createNewArticles.length > 0) {
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#000000')
        .text('New Articles to Create', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#555555')
        .text(`${createNewArticles.length} new article${createNewArticles.length !== 1 ? 's' : ''} recommended — no existing article covers this feature`, { align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.8);
      doc.fillColor('#000000');

      for (let ni = 0; ni < createNewArticles.length; ni++) {
        const rec = createNewArticles[ni];
        ensureSpace(120);

        const recConfidenceLabel = rec.confidence != null ? `  · Confidence: ${Math.round(rec.confidence * 100)}%` : '';
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#2563eb')
          .text('CREATE NEW', { continued: recConfidenceLabel.length > 0 });
        if (recConfidenceLabel) {
          doc.font('Helvetica').fillColor('#6b7280').text(recConfidenceLabel);
        }
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a56db')
          .text(`${ni + 1}. ${rec.title}`);
        doc.fillColor('#000000');

        if (rec.suggestedPlacement) {
          doc.moveDown(0.15);
          doc.fontSize(9).font('Helvetica').fillColor('#555555')
            .text(`Placement: ${rec.suggestedPlacement}`, { indent: 15, width: 462 });
        }
        if (rec.relatedFeatures && rec.relatedFeatures.length > 0) {
          doc.moveDown(0.1);
          doc.fontSize(9).font('Helvetica').fillColor('#555555')
            .text(`Features: ${rec.relatedFeatures.join(', ')}`, { indent: 15, width: 462 });
        }

        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
          .text('Why this article is needed:', { indent: 15 });
        doc.moveDown(0.1);
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text(rec.reason, { indent: 20, width: 452 });

        doc.moveDown(0.4);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
          .text('To draft this article:', { indent: 15 });
        doc.moveDown(0.1);
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text('1. Open the Hi Marley Help Center Article Writer ChatGPT project', { indent: 20, width: 452 });
        doc.fontSize(9).font('Helvetica').fillColor('#1a56db')
          .text('https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project',
            { indent: 25, width: 447, link: 'https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project', underline: true });
        doc.moveDown(0.15);
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text('2. Start a new conversation and paste the "Draft Article Prompt" from the web app', { indent: 20, width: 452 });
        doc.moveDown(0.15);
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text('3. Paste the resulting HTML into the Zendesk article editor Source view', { indent: 20, width: 452 });

        doc.fillColor('#000000').moveDown(0.8);
        if (ni < createNewArticles.length - 1) {
          doc.strokeColor('#e5e5e5').lineWidth(0.5).moveTo(65, doc.y).lineTo(547, doc.y).stroke();
          doc.moveDown(0.6);
        }
      }

      // Page break before Affected Articles
      doc.addPage();
    }

    // ════════════════════════════════════════
    // AFFECTED ARTICLES
    // ════════════════════════════════════════

    const affectedSubtitle = createNewArticles.length > 0
      ? `Version ${version}  •  ${articles.length} to update  •  ${createNewArticles.length} new to create`
      : `Version ${version}  •  ${articles.length} article${articles.length !== 1 ? 's' : ''} flagged for review`;

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#000000').text('Affected Articles', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(13).font('Helvetica').fillColor('#555555')
      .text(affectedSubtitle, { align: 'center' });
    doc.moveDown(0.5);
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);
    doc.fillColor('#000000');

    if (articles.length === 0) {
      doc.fontSize(11).font('Helvetica').fillColor('#666666')
        .text('No affected articles found. Run "Find Affected Articles" first.', { align: 'center' });
    } else {
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const articleTitle = article.title || 'Untitled Article';
        const articleUrl = article.helpCenterUrl || article.html_url || '';
        const action = article.action || null;
        const reason = article.reason || '';
        const sectionToUpdateRaw = article.sectionToUpdate || article.affectedSections || '';
        const sectionToUpdate = Array.isArray(sectionToUpdateRaw) ? sectionToUpdateRaw.join(' · ') : sectionToUpdateRaw;
        const specificImpact = article.specificImpact || '';
        const screenshotNeeded = article.screenshotUpdateNeeded || false;
        const screenshotsToUpdate = article.screenshotsToUpdate || [];
        const affectedFeatures = article.affectedFeatures || [];
        const confidence = article.confidence != null ? article.confidence : null;

        // Estimate block height (conservative)
        ensureSpace(120);

        // Action badge + confidence on the same line
        const actionLabel = action === 'create_new' ? 'CREATE NEW' : 'UPDATE EXISTING';
        const actionColor = action === 'create_new' ? '#2563eb' : '#059669';
        const confidenceLabel = confidence != null ? `  · Confidence: ${Math.round(confidence * 100)}%` : '';
        doc.fontSize(9).font('Helvetica-Bold').fillColor(actionColor)
          .text(actionLabel, { continued: confidenceLabel.length > 0 });
        if (confidenceLabel) {
          doc.font('Helvetica').fillColor('#6b7280').text(confidenceLabel);
        }

        // Title as clickable link (pdfkit supports link option)
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a56db')
          .text(`${i + 1}. ${articleTitle}`, { link: articleUrl || null, underline: !!articleUrl });
        doc.fillColor('#000000');

        // URL on its own line for copy-paste fallback
        if (articleUrl) {
          doc.moveDown(0.1);
          doc.fontSize(9).font('Helvetica').fillColor('#555555')
            .text(articleUrl, { link: articleUrl, underline: true, width: 462 });
          doc.fillColor('#000000');
        }

        if (reason) {
          doc.moveDown(0.25);
          doc.fontSize(10).font('Helvetica').fillColor('#333333')
            .text(reason, { indent: 15, width: 447 });
        }

        if (sectionToUpdate) {
          doc.moveDown(0.2);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Section(s) to Update:', { indent: 15, continued: true });
          doc.font('Helvetica').fillColor('#444444').text(`  ${sectionToUpdate}`, { width: 432 });
        }

        if (affectedFeatures.length > 0) {
          doc.moveDown(0.15);
          doc.fontSize(9).font('Helvetica').fillColor('#777777')
            .text(`Related features: ${affectedFeatures.join(', ')}`, { indent: 15, width: 447 });
        }

        if (screenshotsToUpdate.length > 0) {
          doc.moveDown(0.2);
          ensureSpace(30 + screenshotsToUpdate.length * 28);
          
          // Separate media by type
          const videos = screenshotsToUpdate.filter(s => s.type === 'video');
          const gifs = screenshotsToUpdate.filter(s => s.type === 'gif');
          const images = screenshotsToUpdate.filter(s => s.type === 'image' || !s.type);
          
          // Display videos first (red flag)
          if (videos.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626')
              .text('[VIDEO] Videos to Review:', { indent: 15 });
            for (const video of videos) {
              doc.moveDown(0.12);
              const sectionLabel = video.section ? `${video.section}  ` : '';
              doc.fontSize(9).font('Helvetica').fillColor('#991b1b')
                .text(`${sectionLabel}"${video.filename}"`, { indent: 25, width: 437 });
              if (video.reason) {
                doc.moveDown(0.05);
                doc.text(`— ${video.reason}`, { indent: 35, width: 427 });
              }
            }
          }
          
          // Display GIFs (orange flag)
          if (gifs.length > 0) {
            if (videos.length > 0) doc.moveDown(0.1);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#ea580c')
              .text('[GIF] Animations to Update:', { indent: 15 });
            for (const gif of gifs) {
              doc.moveDown(0.12);
              const sectionLabel = gif.section ? `${gif.section}  ` : '';
              const filenameLabel = gif.filename ? `"${gif.filename}"` : '(no filename)';
              doc.fontSize(9).font('Helvetica').fillColor('#92400e')
                .text(`${sectionLabel}${filenameLabel}`, { indent: 25, width: 437 });
              if (gif.reason) {
                doc.moveDown(0.05);
                doc.text(`— ${gif.reason}`, { indent: 35, width: 427 });
              }
            }
          }
          
          // Display regular screenshots (amber flag)
          if (images.length > 0) {
            if (videos.length > 0 || gifs.length > 0) doc.moveDown(0.1);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#b45309')
              .text('[IMG] Screenshots to Update:', { indent: 15 });
            for (const shot of images) {
              doc.moveDown(0.12);
              const sectionLabel = shot.section ? `${shot.section}  ` : '';
              const filenameLabel = shot.filename ? `"${shot.filename}"` : '(no filename)';
              doc.fontSize(9).font('Helvetica').fillColor('#92400e')
                .text(`${sectionLabel}${filenameLabel}`, { indent: 25, width: 437 });
              if (shot.reason) {
                doc.moveDown(0.05);
                doc.text(`— ${shot.reason}`, { indent: 35, width: 427 });
              }
            }
          }
          
          doc.fillColor('#000000');
        } else if (screenshotNeeded) {
          doc.moveDown(0.15);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#b45309')
            .text('[!] Screenshots may need updating', { indent: 15 });
        }

        // Proposed copy blocks
        const proposedCopyArr = article.proposedCopy || [];
        if (proposedCopyArr.length > 0) {
          doc.moveDown(0.4);
          ensureSpace(60);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e40af')
            .text('Suggested Edits:', { indent: 15 });

          for (const entry of proposedCopyArr) {
            doc.moveDown(0.3);
            ensureSpace(80);

            // Section label
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
              .text(`Section: ${entry.section || ''}`, { indent: 20, width: 442 });

            // Instruction
            if (entry.instruction) {
              doc.moveDown(0.1);
              const isTableUpdate = entry.changeType === 'table_update';
              doc.fontSize(9).font('Helvetica-Oblique').fillColor(isTableUpdate ? '#b45309' : '#6b7280')
                .text(entry.instruction, { indent: 20, width: 442 });
            }

            // Proposed text — left accent line + block with better formatting
            if (entry.proposedText) {
              doc.moveDown(0.25);
              const lineStartY = doc.y;
              const textX = 78; // absolute left edge of text
              const textWidth = 464; // stays within right margin
              
              // Use color based on change type
              const textColor = entry.changeType === 'add_to_list' ? '#059669' : 
                               entry.changeType === 'add_paragraph' ? '#0891b2' :
                               entry.changeType === 'table_update' ? '#b45309' : '#1f2937';
              doc.fillColor(textColor);
              
              // Render formatted text (preserves bullets, line breaks, etc)
              renderFormattedText(doc, entry.proposedText, textX, lineStartY, textWidth);
              
              const lineEndY = doc.y;
              // Colored left border matching change type
              doc.strokeColor(textColor).lineWidth(3)
                .moveTo(68, lineStartY - 2)
                .lineTo(68, lineEndY + 2)
                .stroke();
              
              doc.fillColor('#000000');
              doc.moveDown(0.25);
            }
          }
        }

        doc.fillColor('#000000').moveDown(0.7);

        if (i < articles.length - 1) {
          doc.strokeColor('#e5e5e5').lineWidth(0.5).moveTo(65, doc.y).lineTo(547, doc.y).stroke();
          doc.moveDown(0.6);
        }
      }
    }

    // ── Scan Warnings (shown before footer if any occurred) ──
    if (scanWarnings.length > 0) {
      doc.moveDown(1);
      ensureSpace(40 + scanWarnings.length * 28);
      doc.strokeColor('#fbbf24').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#92400e')
        .text('Scan Warnings', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica').fillColor('#78350f')
        .text('The following issues occurred during analysis. Affected articles were excluded from results and may need manual review.', { width: 462 });
      doc.moveDown(0.4);
      for (const w of scanWarnings) {
        doc.fontSize(9).font('Helvetica').fillColor('#92400e')
          .text(`•  ${w}`, { indent: 10, width: 452 });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.5);
    }

    // ── Release Notes Sections With No Articles Flagged ───────────────────────
    if (unflaggedFeatures.length > 0) {
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
        .text('Release Notes Sections With No Articles Flagged', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#555555')
        .text(
          `${unflaggedFeatures.length} section${unflaggedFeatures.length !== 1 ? 's' : ''} from the release notes had no Help Center articles flagged for update or creation`,
          { align: 'center' }
        );
      doc.moveDown(0.5);
      doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.7);
      doc.fontSize(10).font('Helvetica').fillColor('#4b5563')
        .text(
          'These release note sections produced no documentation output. Review the reasoning below — if an article should have been flagged, add a product context rule in Auto Doc Pilot to improve future scans.',
          { width: 462 }
        );
      doc.moveDown(0.9);
      doc.fillColor('#000000');

      for (let ui = 0; ui < unflaggedFeatures.length; ui++) {
        const item = unflaggedFeatures[ui];
        ensureSpace(80);

        // Section title
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151')
          .text(`${ui + 1}. ${item.title}`);
        doc.moveDown(0.3);

        // Reasoning
        doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
          .text(item.noOutputReason || '', { width: 462, indent: 12 });
        doc.moveDown(0.25);

        // Search queries used (if any)
        if (item.searchQueriesUsed && item.searchQueriesUsed.length > 0) {
          doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
            .text(`Searches used: ${item.searchQueriesUsed.map(q => `"${q}"`).join(', ')}`, { width: 450, indent: 12 });
          doc.moveDown(0.25);
        }

        doc.fillColor('#000000').moveDown(0.25);
        if (ui < unflaggedFeatures.length - 1) {
          doc.strokeColor('#e5e5e5').lineWidth(0.5).moveTo(65, doc.y).lineTo(547, doc.y).stroke();
          doc.moveDown(0.5);
        }
      }
    }

    // ── Footer (both pages share this style; add one at the end) ──
    doc.moveDown(1.5);
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#999999')
      .text('Generated by Auto Doc Pilot  •  AI-assisted analysis — review recommendations before acting', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error generating full PDF:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

/**
 * Builds the batch system prompt + user message for article-level analysis.
 * Shared by /manual-article-prompt (initial batch) and /manual-article-followup-prompt (missing articles).
 */
async function buildBatchArticleMessages(articlesWithContent, releaseNotes) {
  let productContext = "";
  try {
    const productContextData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "product-context.json"), "utf-8"));
    const rules = productContextData.releaseToDocRules || [];
    if (rules.length > 0) {
      productContext = "\n\nHI MARLEY PRODUCT KNOWLEDGE — use these rules to decide relevance:\n";
      for (const rule of rules) productContext += `- ${rule}\n`;
    }
  } catch (e) {}

  const systemPrompt = `You are a Help Center content writer for Hi Marley, an insurance communication platform. Given release notes and a list of Help Center articles, determine which articles need updating — and for those that do, write the EXACT replacement copy a writer could paste directly.

Each article below includes its location (category > section) and image inventory. Use that context when analyzing each article.
${productContext}
━━━ STEP 1: CATEGORY GATE (apply to each article) ━━━
This release may contain multiple types of changes. For each article, evaluate it ONLY against features that match its domain.

Using the Article Location provided for each article, apply these domain rules:
  • INTEGRATIONS / API / WEBHOOKS / PARTNER articles → only relevant to features that EXPLICITLY change API endpoints, webhook payloads, OAuth flows, SSO behavior, or the setup steps of a named third-party integration. Web app UI changes (inbox, badges, notifications, filters, away status, contact fields) are NEVER relevant to these articles.
  • OPERATOR/ADJUSTER UI articles (Inbox, Cases, Messaging, Personal Settings, Auto Replies, Managing Personal Settings) → relevant to web app UI changes only. Not relevant to API or webhook changes. NOTE: "Managing Your Personal Settings" is OPERATOR/ADJUSTER UI — NOT admin settings — even though the title contains "settings". It documents operator personal preferences: away status, profile dropdown, notification prefs. Always flag it for operator-facing UI changes involving the personal settings dropdown or away/available status.
  • ADMIN/SETTINGS articles → relevant to admin configuration features only. CRITICAL SUBSECTION RULE: Admin Settings is divided into distinct subsections (Notifications, Security, Branding, Integrations, etc.). An article covering the "Notifications" subsection is ONLY relevant to notification configuration features — never to Security, OAuth, or authentication changes. An article covering "Security" is ONLY relevant to authentication, OAuth, SSO, or security features — never to notification settings. A feature in one Admin subsection NEVER affects an article from a different Admin subsection. When in doubt, check whether the article's title or section name matches the feature's subsection before flagging it.
  • POLICYHOLDER / MOBILE articles → relevant to policyholder-facing or mobile features only.
- If NO release features match an article's domain, set alreadyCovered: true for that article.

━━━ STEP 2: CONTENT GATE (apply to each article) ━━━
For each release feature you identified as potentially relevant in Step 1:
- Find the SPECIFIC sentence, paragraph, or section in the article content that documents the functionality this feature changes.
- If you CANNOT point to specific existing text that would need to change, set alreadyCovered: true.
- A vague topic overlap is NOT enough. The article must ACTUALLY DOCUMENT the specific thing the release changes.

━━━ STEP 3: WRITE THE UPDATE (only for articles that pass both gates) ━━━
Write proposed copy in Hi Marley's style. Maximum 3 proposedCopy entries per article — focus on what matters most.
Use **double asterisks** in proposedText for bold text, matching the article's existing bold patterns (e.g., **Q:** / **A:** for FAQ entries, **Term:** for defined terms). This renders as <strong> in Zendesk.

TABLE DETECTION: If a section being updated is an HTML table, set "changeType": "table_update" and provide only the new row(s) in pipe-delimited format as proposedText.

MEDIA GUIDANCE: If an article contains videos, GIFs, or screenshots in sections you are recommending to update, you MUST include them in screenshotsToUpdate:
- For images/GIFs: use the exact filename from the inventory (e.g., "screenshot-123.png", "demo.gif"). Include EVERY image in an affected section — do not skip images just because their filename is generic.
- For videos (type: "video"): include the video name/title as provided in the inventory. Videos in affected sections should ALWAYS be flagged — a video showing the old UI is just as outdated as a screenshot.
- In the "reason" field, describe what changed in the UI that makes this media outdated
- If you are recommending ANY section for update, check the image inventory for media in that section and include all of it
Do NOT invent filenames. Reference media exactly as listed in the inventory.

Analyze ALL articles and return a JSON array. Include every article — even those where alreadyCovered is true.

Return ONLY a valid JSON array (no markdown, no code blocks):
[
  {
    "articleId": 12345678,
    "alreadyCovered": false,
    "affectedSections": "Section titles that need updating",
    "specificImpact": "1-2 sentences: what specific text needs to change and why",
    "proposedCopy": [
      {
        "section": "Section heading",
        "changeType": "update_text | add_to_list | new_section | add_paragraph | table_update",
        "instruction": "One sentence: exactly what to do",
        "proposedText": "Exact replacement text in Hi Marley's style. Use \\n for line breaks. Use **double asterisks** for bold text (e.g., **Q:** / **A:** for FAQ entries, **Term:** for defined terms, or any bold label matching the article's existing formatting)."
      }
    ],
    "screenshotsToUpdate": [
      {
        "section": "Section heading",
        "filename": "exact-filename-from-inventory.png",
        "type": "image | gif | video",
        "reason": "One sentence: what changed in the UI"
      }
    ]
  }
]
For articles where alreadyCovered is true: { "articleId": 12345678, "alreadyCovered": true, "affectedSections": "", "specificImpact": "", "proposedCopy": [], "screenshotsToUpdate": [] }`;

  const articleBlocks = articlesWithContent.map((a, idx) => {
    const locationLine = (a.articleCategoryName || a.articleSectionName)
      ? `Article Location: ${a.articleCategoryName || "Unknown"} > ${a.articleSectionName || "Unknown"}\nNote: Only flag this article for features that match its domain.`
      : "";
    let ageLine = "";
    if (a.updated_at) {
      const ageMonths = Math.floor((Date.now() - new Date(a.updated_at)) / (1000 * 60 * 60 * 24 * 30.44));
      const dateStr = new Date(a.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      ageLine = `\nArticle Last Updated: ${dateStr} (${ageMonths} month${ageMonths !== 1 ? 's' : ''} ago)`;
    }
    let imagesBlock = "";
    if (Array.isArray(a.articleImages) && a.articleImages.length > 0) {
      imagesBlock = "\nARTICLE MEDIA INVENTORY (includes images, videos, and GIFs):\n";
      a.articleImages.forEach((img, i) => {
        const typeLabel = img.type === 'video' ? '[VIDEO]' : img.type === 'gif' ? '[GIF]' : '[IMG]';
        imagesBlock += `  ${i + 1}. ${typeLabel} Section: "${img.section}"  |  Name/Filename: ${img.filename ? `"${img.filename}"` : "(no name)"}\n`;
      });
    }
    return `=== ARTICLE ${idx + 1} ===\nID: ${a.id}\nTitle: "${a.title}"\n${locationLine}${ageLine}${imagesBlock}\n${a.articleText || "(no content available)"}`;
  });

  const divider = "─".repeat(60);

  const userContent = `IMPORTANT: Respond with a JSON array ONLY. No prose, no article drafts, no headers, no explanations. Pure JSON that can be parsed directly.

⚠️ JSON ESCAPING REQUIREMENT: All quotes inside string values MUST be escaped with backslashes.
Examples of WRONG and RIGHT escaping:
  WRONG: "proposedText": "Example: "value""
  RIGHT: "proposedText": "Example: \"value\""
This applies to ALL proposedText fields, especially those containing JSON code, API examples, or field names in quotes.

Required format — one object per article:
[
  { "articleId": 12345678, "alreadyCovered": false, "affectedSections": "...", "specificImpact": "...", "proposedCopy": [], "screenshotsToUpdate": [] }
]

Release Notes:
${releaseNotes}

${divider}

Analyze each article below against the release notes above. Return a JSON array with one result per article, in the same order.

${articleBlocks.join("\n\n")}`;

  const combined = `[FOR PLAIN ChatGPT (no trained project) — paste BOTH sections below as separate messages]\n[If using the Hi Marley ChatGPT project, use "Copy Message for ChatGPT Project" instead — paste only the YOUR MESSAGE section in a NEW conversation]\n\n[SYSTEM INSTRUCTIONS — paste first, or add to custom instructions]\n\n${systemPrompt}\n\n${divider}\n\n[YOUR MESSAGE — paste this as your message to ChatGPT]\n\n${userContent}`;

  return { systemPrompt, userContent, combined };
}

/**
 * GET /api/scanners/manual-article-prompt
 * Manual mode: run the Zendesk search from cached analysis, then build a single batch
 * prompt containing all found articles so the user can paste it into ChatGPT once.
 * Stores raw article metadata in session for /manual-article-import to use.
 */
router.get("/manual-article-prompt", requireAuth, async (req, res) => {
  try {
    const cachedAnalysis = req.session?.releaseImpactAnalysis;
    if (!cachedAnalysis) {
      return res.status(400).json({
        success: false,
        error: "No analysis found. Complete Step 1 (import analysis) first.",
      });
    }

    const releaseNotes = req.session?.releaseNotes || "";
    const { searchQueries = [], recommendedArticles = [] } = cachedAnalysis;

    // Build section context map (same as search-and-flag)
    const sectionContextMap = await buildSectionContextMap();

    // Search Zendesk (same as search-and-flag)
    const allArticles = [];
    const seenIds = new Set();
    const articlesFoundByQuery = new Map();
    for (const query of searchQueries) {
      const articles = await fetchProductReleaseArticles([query], "en-us", 25);
      articlesFoundByQuery.set(query, articles.map(a => a.id));
      articles.forEach(a => {
        if (!seenIds.has(a.id)) { seenIds.add(a.id); allArticles.push(a); }
      });
    }

    // Pre-filter release-notes section
    const RELEASE_NOTES_SECTION_ID = 1500000353602;
    const filteredArticles = allArticles.filter(a => a.section_id !== RELEASE_NOTES_SECTION_ID);

    // Enrich with initial metadata
    const enrichedArticles = filteredArticles.map(a => {
      let recommendation = null;
      for (const rec of recommendedArticles) {
        if (typeof rec !== "object") continue;
        for (const query of searchQueries) {
          if ((articlesFoundByQuery.get(query) || []).includes(a.id)) { recommendation = rec; break; }
        }
        if (recommendation) break;
      }
      return {
        ...a,
        helpCenterUrl: helpCenterUrl(a.id),
        helpCenterUrlFr: helpCenterUrl(a.id, "fr-ca"),
        reason: recommendation?.reason || null,
        affectedFeatures: recommendation?.relatedFeatures || [],
        action: recommendation?.action || null,
        sectionToUpdate: recommendation?.sectionToUpdate || null,
        suggestedPlacement: recommendation?.suggestedPlacement || null,
        screenshotUpdateNeeded: recommendation?.screenshotUpdateNeeded || false,
        phase: "release_updates",
      };
    });

    // Fetch full content + images for each article in parallel
    console.log(`📋 Fetching content for ${enrichedArticles.length} articles to build batch prompt...`);
    const articlesWithContent = await Promise.all(enrichedArticles.map(async (article) => {
      try {
        const resp = await fetch(
          `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/help_center/articles/${article.id}.json`,
          { headers: { Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`, Accept: "application/json" } }
        );
        if (!resp.ok) return { ...article, articleText: "", articleImages: [], articleSectionName: "", articleCategoryName: "" };
        const articleData = await resp.json();
        const fullContent = articleData.article?.body || "";
        const fullText = htmlToText(fullContent);
        const articleText = fullText.length > 8000 ? fullText.substring(0, 8000) + "\n[... content truncated ...]" : fullText;
        const articleImages = extractImagesWithSections(fullContent);
        const sectionCtx = sectionContextMap.get(article.section_id) || {};
        return {
          ...article,
          articleText,
          articleImages,
          articleSectionName: sectionCtx.sectionName || "",
          articleCategoryName: sectionCtx.categoryName || "",
        };
      } catch (err) {
        return { ...article, articleText: "", articleImages: [], articleSectionName: "", articleCategoryName: "" };
      }
    }));

    // Store article metadata in session for import step
    req.session.manualArticleCache = articlesWithContent.map(a => ({
      id: a.id, title: a.title, helpCenterUrl: a.helpCenterUrl, helpCenterUrlFr: a.helpCenterUrlFr,
      updated_at: a.updated_at, section_id: a.section_id, html_url: a.html_url,
      reason: a.reason, affectedFeatures: a.affectedFeatures, action: a.action,
      sectionToUpdate: a.sectionToUpdate, suggestedPlacement: a.suggestedPlacement,
      screenshotUpdateNeeded: a.screenshotUpdateNeeded, phase: a.phase,
      articleSectionName: a.articleSectionName, articleCategoryName: a.articleCategoryName,
    }));

    // Build batch prompt using shared helper
    const { systemPrompt, userContent, combined } = await buildBatchArticleMessages(articlesWithContent, releaseNotes);

    res.json({
      success: true,
      combined,
      systemPrompt,
      userMessage: userContent,
      articleCount: articlesWithContent.length,
      articleTitles: articlesWithContent.map(a => a.title),
    });
  } catch (err) {
    console.error("Error building manual article prompt:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scanners/manual-article-import
 * Accept the batch JSON array pasted from ChatGPT, merge with cached article metadata,
 * and return the same shape as /search-and-flag so the frontend renders results identically.
 * Body: { responseText: string }
 */
router.post("/manual-article-import", requireAuth, async (req, res) => {
  try {
    const { responseText } = req.body;
    if (!responseText || typeof responseText !== "string") {
      return res.status(400).json({ success: false, error: "responseText is required" });
    }

    const cachedArticles = req.session?.manualArticleCache;
    if (!cachedArticles || cachedArticles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No article cache found. Please fetch the article prompt (Step 2) first.",
      });
    }

    const cachedAnalysis = req.session?.releaseImpactAnalysis;
    const releaseId = req.body.releaseId || `release_${Date.now()}`;

    // Strip markdown fences, fix smart quotes & unescaped interior quotes, then parse
    let results;
    try {
      results = sanitizeAndParseJson(responseText);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: `Could not parse the response as JSON. Make sure you copied the full JSON array from ChatGPT. (Parse error: ${parseErr.message})`,
      });
    }

    if (!Array.isArray(results)) {
      return res.status(400).json({ success: false, error: "Response must be a JSON array (one object per article)" });
    }

    // Build a lookup map from articleId to AI result
    const resultsByArticleId = new Map(results.map(r => [String(r.articleId), r]));

    // Merge AI results into cached article metadata
    const enrichedArticles = cachedArticles.map(article => {
      const aiResult = resultsByArticleId.get(String(article.id));
      if (!aiResult || aiResult.alreadyCovered) {
        return { ...article, alreadyCovered: true };
      }
      return {
        ...article,
        alreadyCovered: false,
        affectedSections: aiResult.affectedSections || "",
        specificImpact: aiResult.specificImpact || "",
        // Per-article AI is authoritative — override generic reason
        reason: aiResult.specificImpact || article.reason,
        sectionToUpdate: aiResult.affectedSections || article.sectionToUpdate,
        proposedCopy: aiResult.proposedCopy || [],
        screenshotsToUpdate: aiResult.screenshotsToUpdate || [],
        screenshotUpdateNeeded: (aiResult.screenshotsToUpdate || []).length > 0,
      };
    });

    const actionableArticles = enrichedArticles.filter(a => !a.alreadyCovered);
    const alreadyCoveredCount = enrichedArticles.length - actionableArticles.length;
    if (alreadyCoveredCount > 0) {
      console.log(`✓ Filtered out ${alreadyCoveredCount} already-covered article(s) from manual import`);
    }

    // Compute confidence scores and sort (same as auto mode)
    actionableArticles.forEach(a => { a.confidence = computeArticleConfidence(a); });
    actionableArticles.sort((a, b) => b.confidence - a.confidence);

    // Detect articles that were in the cache but NOT in ChatGPT's response (likely truncated)
    const returnedIds = new Set(results.map(r => String(r.articleId)));
    const missingArticles = cachedArticles
      .filter(a => !returnedIds.has(String(a.id)))
      .map(a => ({ id: a.id, title: a.title }));
    req.session.missingArticleIds = missingArticles.map(a => a.id);
    if (missingArticles.length > 0) {
      console.log(`⚠️  Manual article import: ${missingArticles.length} article(s) missing from ChatGPT response (may have been truncated)`);
    }

    // Store in session — same key as search-and-flag so export endpoints work
    req.session.lastSearchResults = actionableArticles;
    req.session.lastSearchResults.releaseId = releaseId;
    req.session.scanWarnings = [];

    const releaseNotesText = req.session?.releaseNotes || '';
    const createNewArticles = extractCreateNewArticles(cachedAnalysis, releaseNotesText);
    req.session.createNewArticles = createNewArticles;

    // Compute release note sections that produced no documentation output
    // allAnalyzedArticles = enrichedArticles includes alreadyCovered ones so we can
    // show "articles found but already covered" reasoning in the unflagged section.
    const unflaggedFeatures = computeUnflaggedFeatures({
      affectedFeatures: cachedAnalysis?.affectedFeatures || [],
      recommendedArticles: cachedAnalysis?.recommendedArticles || [],
      actionableArticles,
      allAnalyzedArticles: enrichedArticles,
      createNewArticles,
    });
    req.session.unflaggedFeatures = unflaggedFeatures;

    console.log(`✅ Manual article import: ${actionableArticles.length} actionable articles${unflaggedFeatures.length > 0 ? `, ${unflaggedFeatures.length} unflagged feature(s)` : ''}`);

    res.json({
      success: true,
      releaseId,
      analysis: cachedAnalysis || {},
      foundArticles: actionableArticles,
      articleCount: actionableArticles.length,
      totalArticlesFound: actionableArticles.length,
      warnings: [],
      missingArticles,
      createNewArticles,
      unflaggedFeatures,
    });
  } catch (err) {
    console.error("Manual article import error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/scanners/manual-article-followup-prompt
 * Manual mode: build a batch prompt for only the articles that were missing from the
 * Step 2 ChatGPT response (detected by /manual-article-import). Re-fetches content
 * for those articles from Zendesk and returns the same prompt format as manual-article-prompt.
 */
router.get("/manual-article-followup-prompt", requireAuth, async (req, res) => {
  try {
    const missingIds = req.session?.missingArticleIds || [];
    const cachedArticles = req.session?.manualArticleCache || [];
    const releaseNotes = req.session?.releaseNotes || "";

    if (missingIds.length === 0) {
      return res.status(400).json({ success: false, error: "No missing articles to follow up on." });
    }

    const missingMeta = cachedArticles.filter(a => missingIds.includes(a.id));
    if (missingMeta.length === 0) {
      return res.status(400).json({ success: false, error: "Could not find cached metadata for missing articles." });
    }

    // Re-fetch article content for the missing articles in parallel
    console.log(`📋 Follow-up: fetching content for ${missingMeta.length} missing article(s)...`);
    const sectionContextMap = await buildSectionContextMap();
    const articlesWithContent = await Promise.all(missingMeta.map(async (article) => {
      try {
        const resp = await fetch(
          `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/help_center/articles/${article.id}.json`,
          { headers: { Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`, Accept: "application/json" } }
        );
        if (!resp.ok) return { ...article, articleText: "", articleImages: [], articleSectionName: article.articleSectionName || "", articleCategoryName: article.articleCategoryName || "" };
        const articleData = await resp.json();
        const fullContent = articleData.article?.body || "";
        const fullText = htmlToText(fullContent);
        const articleText = fullText.length > 8000 ? fullText.substring(0, 8000) + "\n[... content truncated ...]" : fullText;
        const articleImages = extractImagesWithSections(fullContent);
        const sectionCtx = sectionContextMap.get(article.section_id) || {};
        return {
          ...article,
          articleText,
          articleImages,
          articleSectionName: sectionCtx.sectionName || article.articleSectionName || "",
          articleCategoryName: sectionCtx.categoryName || article.articleCategoryName || "",
        };
      } catch (err) {
        return { ...article, articleText: "", articleImages: [], articleSectionName: article.articleSectionName || "", articleCategoryName: article.articleCategoryName || "" };
      }
    }));

    const { systemPrompt, userContent, combined } = await buildBatchArticleMessages(articlesWithContent, releaseNotes);

    res.json({
      success: true,
      combined,
      systemPrompt,
      userMessage: userContent,
      articleCount: articlesWithContent.length,
      articleTitles: articlesWithContent.map(a => a.title),
    });
  } catch (err) {
    console.error("Error building follow-up article prompt:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scanners/manual-article-followup-import
 * Manual mode: accept the follow-up JSON array from ChatGPT (covering previously-missing
 * articles) and MERGE the results into the existing session.lastSearchResults.
 */
router.post("/manual-article-followup-import", requireAuth, async (req, res) => {
  try {
    const { responseText } = req.body;
    if (!responseText || typeof responseText !== "string") {
      return res.status(400).json({ success: false, error: "responseText is required" });
    }

    const cachedArticles = req.session?.manualArticleCache;
    const missingIds = req.session?.missingArticleIds || [];
    const existingResults = req.session?.lastSearchResults || [];
    const cachedAnalysis = req.session?.releaseImpactAnalysis;

    if (!cachedArticles || cachedArticles.length === 0) {
      return res.status(400).json({ success: false, error: "No article cache found. Please restart from Step 2." });
    }

    let results;
    try {
      results = sanitizeAndParseJson(responseText);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: `Could not parse the response as JSON. Make sure you copied the full JSON array. (Parse error: ${parseErr.message})`,
      });
    }

    if (!Array.isArray(results)) {
      return res.status(400).json({ success: false, error: "Response must be a JSON array (one object per article)" });
    }

    // Only process articles that were actually missing
    const missingMeta = cachedArticles.filter(a => missingIds.includes(a.id));
    const resultsByArticleId = new Map(results.map(r => [String(r.articleId), r]));

    // Build full enriched set (incl. alreadyCovered) so computeUnflaggedFeatures
    // can distinguish "articles found but already covered" from "nothing found".
    const followupEnrichedArticles = missingMeta.map(article => {
      const aiResult = resultsByArticleId.get(String(article.id));
      if (!aiResult || aiResult.alreadyCovered) return { ...article, alreadyCovered: true };
      return {
        ...article,
        alreadyCovered: false,
        affectedSections: aiResult.affectedSections || "",
        specificImpact: aiResult.specificImpact || "",
        reason: aiResult.specificImpact || article.reason,
        sectionToUpdate: aiResult.affectedSections || article.sectionToUpdate,
        proposedCopy: aiResult.proposedCopy || [],
        screenshotsToUpdate: aiResult.screenshotsToUpdate || [],
        screenshotUpdateNeeded: (aiResult.screenshotsToUpdate || []).length > 0,
      };
    });
    const newArticles = followupEnrichedArticles.filter(a => !a.alreadyCovered);

    // Merge with existing results (deduplicate by id just in case)
    const existingIds = new Set(existingResults.map(a => String(a.id)));
    const merged = [...existingResults, ...newArticles.filter(a => !existingIds.has(String(a.id)))];

    // Recompute confidence + re-sort the full merged set
    merged.forEach(a => { if (a.confidence == null) a.confidence = computeArticleConfidence(a); });
    merged.sort((a, b) => b.confidence - a.confidence);

    // Clear missing IDs now that we've processed them
    req.session.missingArticleIds = [];
    req.session.lastSearchResults = merged;
    req.session.lastSearchResults.releaseId = existingResults.releaseId;

    console.log(`✅ Follow-up import: added ${newArticles.length} article(s), total now ${merged.length}`);

    const releaseNotesText = req.session?.releaseNotes || '';
    const createNewArticles = extractCreateNewArticles(cachedAnalysis, releaseNotesText);
    req.session.createNewArticles = createNewArticles;

    // Recompute release note sections with no documentation output against merged article set.
    // allAnalyzedArticles = existing actionable results + follow-up enriched set (incl. alreadyCovered)
    const unflaggedFeatures = computeUnflaggedFeatures({
      affectedFeatures: cachedAnalysis?.affectedFeatures || [],
      recommendedArticles: cachedAnalysis?.recommendedArticles || [],
      actionableArticles: merged,
      allAnalyzedArticles: [...existingResults, ...followupEnrichedArticles],
      createNewArticles,
    });
    req.session.unflaggedFeatures = unflaggedFeatures;

    res.json({
      success: true,
      foundArticles: merged,
      articleCount: merged.length,
      newArticleCount: newArticles.length,
      analysis: cachedAnalysis || {},
      warnings: [],
      createNewArticles,
      unflaggedFeatures,
    });
  } catch (err) {
    console.error("Follow-up article import error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/scanners/add-context-rule ──────────────────────────────────────
// Appends a new plain-English rule to config/product-context.json.
// Called after the user dismisses a recommendation and opts to explain why.
router.post("/add-context-rule", requireAuth, async (req, res) => {
  try {
    const { rule } = req.body;
    if (!rule || typeof rule !== "string" || !rule.trim()) {
      return res.status(400).json({ success: false, error: "A non-empty rule string is required." });
    }
    const contextPath = path.join(process.cwd(), "config", "product-context.json");
    const raw = fs.readFileSync(contextPath, "utf-8");
    const context = JSON.parse(raw);
    context.releaseToDocRules = [...(context.releaseToDocRules || []), rule.trim()];
    context._lastUpdated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2), "utf-8");
    const preview = rule.trim().length > 80 ? rule.trim().slice(0, 80) + "…" : rule.trim();
    console.log(`📚 Product context rule added (${context.releaseToDocRules.length} total): "${preview}"`);
    res.json({ success: true, ruleCount: context.releaseToDocRules.length });
  } catch (err) {
    console.error("add-context-rule error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/scanners/dismiss-create-new ─────────────────────────────────────
// Removes a "create new article" recommendation from the session by title.
router.post("/dismiss-create-new", requireAuth, (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "title is required." });
    const existing = req.session.createNewArticles || [];
    const before = existing.length;
    req.session.createNewArticles = existing.filter(r => r.title !== title);
    const removed = before - req.session.createNewArticles.length;
    console.log(`🗑️  Dismissed create-new recommendation: "${title}" (removed ${removed})`);
    res.json({ success: true, removed });
  } catch (err) {
    console.error("dismiss-create-new error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
