/**
 * Release Notes API Endpoints
 * Handles saving release notes and extracting keywords with OpenAI
 */

import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import PDFDocument from "pdfkit";
import { requireAuth } from "../middleware/requireAuth.js";
import { processReleasePDF, cleanupUpload } from "../lib/pdf-processor.js";
import { htmlToText, processArticleFromUrl } from "../lib/article-processor.js";
import { sanitizeAndParseJson } from "../lib/json-sanitizer.js";

const router = express.Router();

// Builds the system prompt + user message for release impact analysis.
// Used by both /analyze-impact (API call) and /manual-prompt (export for ChatGPT).
async function buildAnalyzeImpactMessages(releaseNotes, pdfImageData) {
  let productContextForAnalysis = "";
  try {
    const productContextData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "config", "product-context.json"), "utf-8")
    );
    const rules = productContextData.releaseToDocRules || [];
    if (rules.length > 0) {
      productContextForAnalysis = "\n\nHI MARLEY PRODUCT KNOWLEDGE (apply these rules when deciding which articles to recommend):\n";
      for (const rule of rules) productContextForAnalysis += `- ${rule}\n`;
    }
  } catch (e) {}

  let trainingContext = "";
  try {
    const trainingData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "config", "training-examples.json"), "utf-8")
    );
    const examples = trainingData.releaseExamples || [];
    if (examples.length > 0) {
      trainingContext = `\n\nHere are real examples of how a human reviewer mapped release features to Help Center articles. Use these to calibrate your recommendations:\n`;
      for (const ex of examples) {
        trainingContext += `\n--- Example (${ex.releaseVersion}) ---`;
        trainingContext += `\nRelease Feature: "${ex.releaseFeature}"`;
        trainingContext += `\nHuman Decision: ${ex.humanDecision === "create_new" ? "CREATE NEW ARTICLE" : "UPDATE EXISTING ARTICLE"}`;
        trainingContext += `\nArticle: "${ex.articleTitle}" (${ex.articleUrl})`;
        trainingContext += `\nWhat Changed: ${ex.whatChanged}`;
        trainingContext += `\nSection Affected: ${ex.sectionAffected}`;
        trainingContext += `\nWhy This Article: ${ex.whyThisArticle}`;
        trainingContext += `\nSearch Queries That Worked: ${ex.searchQueriesThatWork.join(", ")}`;
        if (ex.noExistingArticle) {
          trainingContext += `\nNote: No existing article was found — a new one was created and placed in: ${ex.articlePlacement}`;
        }
        trainingContext += `\n`;
      }
      const patterns = trainingData.patterns || {};
      if (patterns.updateExisting) {
        trainingContext += `\nSignals that an EXISTING article should be updated:\n`;
        for (const s of patterns.updateExisting.signals) trainingContext += `- ${s}\n`;
      }
      if (patterns.createNew) {
        trainingContext += `\nSignals that a NEW article should be created:\n`;
        for (const s of patterns.createNew.signals) trainingContext += `- ${s}\n`;
      }
      if (patterns.doNotMatch) {
        trainingContext += `\nCRITICAL — Common mistakes to AVOID:\n`;
        for (const s of patterns.doNotMatch.signals) trainingContext += `- ${s}\n`;
      }
      const negativeExamples = trainingData.negativeExamples || [];
      if (negativeExamples.length > 0) {
        trainingContext += `\n--- INCORRECT MATCHES TO LEARN FROM ---\n`;
        for (const neg of negativeExamples) {
          trainingContext += `\nRelease Feature: "${neg.releaseFeature}"`;
          if (neg.incorrectlyFlaggedArticle) {
            trainingContext += `\nINCORRECTLY matched to: "${neg.incorrectlyFlaggedArticle}"`;
          } else if (neg.incorrectIncidentDescription) {
            trainingContext += `\nIncorrect behavior: ${neg.incorrectIncidentDescription}`;
          }
          trainingContext += `\nWhy this was WRONG: ${neg.whyItWasWrong}`;
          trainingContext += `\nLesson: ${neg.lesson}\n`;
        }
      }
    }
  } catch (err) {}

  let imageContext = "";
  if (pdfImageData && pdfImageData.imageCount > 0) {
    imageContext = `\n\nIMPORTANT — IMAGE/SCREENSHOT DETECTION:
This release notes PDF contains ${pdfImageData.imageCount} images/screenshots${pdfImageData.totalPages ? ` across ${pdfImageData.totalPages} pages` : ''}.
The following feature sections appear to contain UI screenshots in the release notes PDF, suggesting these features may have visual UI changes:
${pdfImageData.sectionsWithImages.map(s => `- ${s}`).join("\n")}

For articles affected by these features, consider setting "screenshotUpdateNeeded": true. Treat these as hints based on image proximity in the PDF — the per-article analysis should make the final determination based on actual article content.`;
  }

  const systemPrompt = `You are a Help Center content strategist for Hi Marley's Zendesk Help Center. Hi Marley is an insurance communication platform.

Given release notes, analyze what features are being added/changed and what documentation needs updates.
${productContextForAnalysis}
HI MARLEY ARTICLE CATEGORIES — match features to the correct category only:
- OPERATOR/ADJUSTER UI: Inbox, Cases, Messaging, Quick Filters, Tags, Templates, Address Case, Personal Settings, Auto Replies → affects only operator-facing guides. NEVER affects API docs, webhooks, or integration setup articles. NOTE: "Managing Your Personal Settings" and "Auto Replies" articles are OPERATOR/ADJUSTER UI — they document personal settings (away status, profile dropdown) and auto-reply behavior. Flag them for any operator-facing UI change to those areas.
- ADMIN/ORG SETTINGS: Organization settings, Feature flags, LOB configuration, Auto-Close → affects only admin settings articles. NEVER affects the Inbox article or operator workflow guides.
  ADMIN SETTINGS SUBSECTIONS: Admin Settings is divided into subsections (Notifications, Security, Branding, Integrations, etc.). When recommending an existing article to update, match it to ONLY the specific subsection the feature belongs to — e.g. a Security/OAuth feature maps to the Security article only, NOT the Notifications article. Do not cross-match subsections.
- POLICYHOLDER EXPERIENCE: Opt-in/opt-out keywords, Welcome messages, Texting consent → affects only policyholder-facing guides and opt-in workflow articles.
- INTEGRATIONS (ClaimCenter, Mitchell, Salesforce, Guidewire, etc.): ONLY affects the specific integration's own setup or config article. A change to inbox UI does NOT affect any integration article.
- API/WEBHOOKS/DEVELOPER: ONLY affects API reference or webhook documentation. Operator or admin UI changes do NOT affect these.

IMPORTANT RULES:
1. Be SELECTIVE — only recommend articles that are ACTUALLY affected by each feature. Do NOT list every article for every feature.
2. Match features to articles in the same product category (see above). A notification badge change → Inbox article only, not webhooks. An opt-in keyword change → opt-in/opt-out article only, not API docs.
3. For each recommended article, decide: should an existing article be UPDATED, or should a NEW article be CREATED?
4. Be SPECIFIC about what sections of the article need changing and why.
5. Generate search queries that will find the RIGHT article without flooding results with false positives — see strict rules below.
6. BUG FIXES — include in featureChanges, but only recommend an article update if the fix changes behavior that was previously documented as working correctly. Pure UI display bugs, dropdown glitches, or back-end data bugs typically do not need documentation changes. Only flag a bug fix if it changes a user-facing workflow described in the Help Center.
7. USE AVAILABILITY SCOPE — each feature may include "Available to:" (e.g., "System Admins only", "All carriers", "SSO-enabled organizations using the Public API"). Use this to narrow down affected article categories: admin-only features affect admin articles; API/SSO/developer features affect developer docs; all-carriers features affect general operator guides.
8. NEW UI SECTIONS — if a release note mentions a new menu path, tab, or settings section (e.g., "Admin Settings → Security", "a new section within the Organization tab") that sounds like it hasn't existed before, treat that as a CREATE NEW article recommendation. Do not assume an article exists just because it's in a familiar area. When in doubt, recommend creating a new article for any newly-named section.
9. API FIELD ADDITIONS — if a release note for a Contact or Case field includes phrases like "set and retrieved via API", "supported via API", "fully supported via API", "available via API", or "returned in API responses", that is the explicit signal to flag API and webhook documentation. Generate search queries targeting the relevant resource and event (e.g., "contact updated", "contact API", "event ID contact" for a Contact field; "case API", "case updated" for a Case field). The correct payload field name for Contact Prefix is "contactPrefix" (not "prefix"). For other API changes (non-Contact/Case), flag all articles that document the affected API action (create, update, get, list) and generate queries targeting the specific resource and action.
10. UI ELEMENT CHANGES — if a release note describes a change to a named UI element (e.g., "Personal Settings Dropdown", "profile avatar", "a new button", "sidebar panel", "modal dialog", "toggle"), set screenshotUpdateNeeded: true for ANY article recommendation that documents that area of the UI. A named UI element change is a strong signal that the article's screenshots are outdated.
${trainingContext}

SEARCH QUERY RULES — follow these exactly:
- Use 1–2 queries per major feature (Features and Feature Enhancements). Bug fixes only get a query if the fix changes a documented workflow.
- Scale total queries to the release size: up to 5 features → max 10 queries; 6–10 features → max 14 queries; 11+ features → max 18 queries.
- Each query must be 1-3 words ONLY — never a full phrase or sentence
- Each query must be specific to a SINGLE feature — one query per feature concept
- FORBIDDEN as standalone queries (too generic, match hundreds of articles): "notification", "settings", "update", "case", "message", "admin", "operator", "integration"
- ALLOWED: the actual feature name or UI element (e.g., "address case", "away status", "feature audit log", "contact prefix", "opt-in oui", "OAuth API")
- DO NOT generate queries that would search integration, API, or partner docs for a webapp UI change. EXCEPTION: if the release notes include phrases like "set and retrieved via API", "supported via API", "fully supported via API", "available via API", or "returned in API responses" for a Contact or Case field, ALSO generate "contact updated" and "contact API" queries — the explicit API language in the release notes is the signal. For all other webapp UI changes that do not contain this language, only include API/webhook queries if the release EXPLICITLY states those are changing.
- If in doubt, use FEWER queries. 5 precise queries are better than 10 broad ones.

Return ONLY a valid JSON object (no markdown, no code blocks). IMPORTANT: If any field contains quotes or JSON examples, escape them with backslashes (e.g., \"value\").

Return with exactly these fields:
{
  "featureChanges": ["Section Header: Feature Name", "Another Feature"],
  "recommendedArticles": [
    {
      "title": "Exact or likely article title",
      "url": "https://himarley.zendesk.com/hc/en-us/articles/... (include ONLY if you are certain of the URL from training examples — omit otherwise)",
      "action": "update_existing",
      "reason": "Specific explanation of what content needs to change and why",
      "sectionToUpdate": ["Section 1", "Section 2 if the feature spans multiple parts of the article — list all affected sections"],
      "relatedFeatures": ["Section Header: Feature Name"],
      "searchQueries": ["query 1", "query 2"],
      "screenshotUpdateNeeded": false
    },
    {
      "title": "Suggested title for new article",
      "action": "create_new",
      "reason": "Why a new article is needed and what it should cover",
      "suggestedPlacement": "Help Center category > section path",
      "relatedFeatures": ["Another Feature"],
      "searchQueries": ["query for new article"]
    }
  ],
  "searchQueries": ["address case", "away status", "feature audit log"]
}

IMPORTANT NOTES ON featureChanges and relatedFeatures:
- In "featureChanges", use the FULL release notes section title. If the feature appears under a parent section header (e.g., "Focus on What Needs to be Addressed"), include it: "Focus on What Needs to be Addressed: Address Case Now Generally Available (GA)". If there is no parent header, use the feature name as-is.
- In each recommendedArticle's "relatedFeatures", use the EXACT same strings you used in "featureChanges" — they must match character-for-character so the system can link them.
- In each recommendedArticle's "searchQueries", list the 1-3 word search queries used to find that specific article (a subset of the top-level "searchQueries" list).`;

  const userContent = imageContext
    ? `${imageContext.trimStart()}\n\nAnalyze this release and identify what Help Center articles need updating:\n\n${releaseNotes}`
    : `Analyze this release and identify what Help Center articles need updating:\n\n${releaseNotes}`;

  return { systemPrompt, userContent };
}

// Configure multer for PDF uploads
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

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
 * POST /api/release-notes/upload-pdf
 * Upload release notes as a PDF file
 * Extracts text and detects images for screenshot flagging
 */
router.post("/upload-pdf", requireAuth, upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No PDF file uploaded" });
    }

    const version = req.body.version || "";
    if (!version.trim()) {
      cleanupUpload(req.file.path);
      return res.status(400).json({ success: false, error: "Version is required" });
    }

    console.log(`📄 Processing uploaded PDF: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)`);

    // Process the PDF
    const result = await processReleasePDF(req.file.path);

    // Store in session (same as text input)
    req.session.releaseNotes = result.text;
    req.session.releaseVersion = version;
    req.session.releaseAddedAt = new Date().toISOString();
    req.session.releaseProcessedAt = null;

    // Store image detection data
    req.session.pdfImageData = {
      imageCount: result.imageCount,
      totalPages: result.totalPages,
      sectionsWithImages: result.sectionsWithImages,
      originalFilename: req.file.originalname,
    };

    console.log(`✅ PDF processed: ${result.totalPages} pages, ${result.imageCount} images`);
    if (result.sectionsWithImages.length > 0) {
      console.log(`📸 Sections with images: ${result.sectionsWithImages.join(", ")}`);
    }

    // Clean up the uploaded file
    cleanupUpload(req.file.path);

    res.json({
      success: true,
      text: result.text,
      totalPages: result.totalPages,
      imageCount: result.imageCount,
      sectionsWithImages: result.sectionsWithImages,
      version,
      addedAt: req.session.releaseAddedAt,
    });
  } catch (err) {
    // Clean up file on error
    if (req.file) cleanupUpload(req.file.path);
    console.error("Error processing PDF:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/release-notes/fetch-from-url
 * Fetch a Zendesk Help Center article by URL (e.g. the release notes article),
 * extract its text and detect images, then store in session for analysis.
 * Body: { url: string, version: string }
 */
router.post("/fetch-from-url", requireAuth, async (req, res) => {
  try {
    const { url, version } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "url is required" });
    }
    if (!version || !version.trim()) {
      return res.status(400).json({ success: false, error: "version is required" });
    }

    const result = await processArticleFromUrl(url);

    // Store in session — same shape as text/PDF input
    req.session.releaseNotes = result.text;
    req.session.releaseVersion = version;
    req.session.releaseAddedAt = new Date().toISOString();
    req.session.releaseProcessedAt = null;

    // Store image detection data
    req.session.pdfImageData = {
      imageCount: result.imageCount,
      totalPages: null, // n/a for articles
      sectionsWithImages: result.sectionsWithImages,
      originalFilename: result.title,
      source: "article",
    };

    res.json({
      success: true,
      text: result.text,
      title: result.title,
      articleId: result.articleId,
      imageCount: result.imageCount,
      sectionsWithImages: result.sectionsWithImages,
      version,
      addedAt: req.session.releaseAddedAt,
    });
  } catch (err) {
    console.error("Error fetching article from URL:", err.message);
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
        model: "gpt-4o-mini",
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

/**
 * POST /api/release-notes/analyze-impact
 * Intelligent release analysis: identify affected features and recommend articles to update
 * Body: { releaseNotes: string }
 * Returns: { affectedFeatures: [], recommendedArticles: [], searchQueries: [] }
 */
router.post("/analyze-impact", requireAuth, async (req, res) => {
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

    console.log(`🤖 Analyzing release impact...`);

    // Load product context rules
    let productContextForAnalysis = "";
    try {
      const productContextData = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "config", "product-context.json"), "utf-8")
      );
      const rules = productContextData.releaseToDocRules || [];
      if (rules.length > 0) {
        productContextForAnalysis = "\n\nHI MARLEY PRODUCT KNOWLEDGE (apply these rules when deciding which articles to recommend):\n";
        for (const rule of rules) {
          productContextForAnalysis += `- ${rule}\n`;
        }
      }
    } catch (e) {
      // product-context.json not available — continue without it
    }

    // Load training examples for few-shot learning
    let trainingContext = "";
    try {
      const trainingData = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "config", "training-examples.json"), "utf-8")
      );
      const examples = trainingData.releaseExamples || [];
      if (examples.length > 0) {
        trainingContext = `\n\nHere are real examples of how a human reviewer mapped release features to Help Center articles. Use these to calibrate your recommendations:\n`;
        for (const ex of examples) {
          trainingContext += `\n--- Example (${ex.releaseVersion}) ---`;
          trainingContext += `\nRelease Feature: "${ex.releaseFeature}"`;
          trainingContext += `\nHuman Decision: ${ex.humanDecision === "create_new" ? "CREATE NEW ARTICLE" : "UPDATE EXISTING ARTICLE"}`;
          trainingContext += `\nArticle: "${ex.articleTitle}" (${ex.articleUrl})`;
          trainingContext += `\nWhat Changed: ${ex.whatChanged}`;
          trainingContext += `\nSection Affected: ${ex.sectionAffected}`;
          trainingContext += `\nWhy This Article: ${ex.whyThisArticle}`;
          trainingContext += `\nSearch Queries That Worked: ${ex.searchQueriesThatWork.join(", ")}`;
          if (ex.noExistingArticle) {
            trainingContext += `\nNote: No existing article was found — a new one was created and placed in: ${ex.articlePlacement}`;
          }
          trainingContext += `\n`;
        }

        // Add patterns
        const patterns = trainingData.patterns || {};
        if (patterns.updateExisting) {
          trainingContext += `\nSignals that an EXISTING article should be updated:\n`;
          for (const signal of patterns.updateExisting.signals) {
            trainingContext += `- ${signal}\n`;
          }
        }
        if (patterns.createNew) {
          trainingContext += `\nSignals that a NEW article should be created:\n`;
          for (const signal of patterns.createNew.signals) {
            trainingContext += `- ${signal}\n`;
          }
        }
        if (patterns.doNotMatch) {
          trainingContext += `\nCRITICAL — Common mistakes to AVOID:\n`;
          for (const signal of patterns.doNotMatch.signals) {
            trainingContext += `- ${signal}\n`;
          }
        }

        // Add negative examples (what NOT to match)
        const negativeExamples = trainingData.negativeExamples || [];
        if (negativeExamples.length > 0) {
          trainingContext += `\n--- INCORRECT MATCHES TO LEARN FROM ---\n`;
          for (const neg of negativeExamples) {
            trainingContext += `\nRelease Feature: "${neg.releaseFeature}"`;
            if (neg.incorrectlyFlaggedArticle) {
              trainingContext += `\nINCORRECTLY matched to: "${neg.incorrectlyFlaggedArticle}"`;
            } else if (neg.incorrectIncidentDescription) {
              trainingContext += `\nIncorrect behavior: ${neg.incorrectIncidentDescription}`;
            }
            trainingContext += `\nWhy this was WRONG: ${neg.whyItWasWrong}`;
            trainingContext += `\nLesson: ${neg.lesson}\n`;
          }
        }
      }
      console.log(`📚 Loaded ${examples.length} training examples for few-shot learning`);
    } catch (err) {
      console.log(`⚠️  Could not load training examples: ${err.message}`);
    }

    // Add image detection context if release notes were uploaded as PDF
    let imageContext = "";
    const pdfImageData = req.session.pdfImageData;
    if (pdfImageData && pdfImageData.imageCount > 0) {
      imageContext = `\n\nIMPORTANT — IMAGE/SCREENSHOT DETECTION:
This release notes PDF contains ${pdfImageData.imageCount} images/screenshots${pdfImageData.totalPages ? ` across ${pdfImageData.totalPages} pages` : ''}.
The following feature sections appear to contain UI screenshots in the release notes PDF, suggesting these features may have visual UI changes:
${pdfImageData.sectionsWithImages.map(s => `- ${s}`).join("\n")}

For articles affected by these features, consider setting "screenshotUpdateNeeded": true. Treat these as hints based on image proximity in the PDF — the per-article analysis should make the final determination based on actual article content.`;
      console.log(`📸 Including image detection context: ${pdfImageData.imageCount} images in ${pdfImageData.sectionsWithImages.length} sections`);
    }

    // Build the intelligent system prompt with training examples
    const systemPrompt = `You are a Help Center content strategist for Hi Marley's Zendesk Help Center. Hi Marley is an insurance communication platform.

Given release notes, analyze what features are being added/changed and what documentation needs updates.
${productContextForAnalysis}
HI MARLEY ARTICLE CATEGORIES — match features to the correct category only:
- OPERATOR/ADJUSTER UI: Inbox, Cases, Messaging, Quick Filters, Tags, Templates, Address Case, Personal Settings, Auto Replies → affects only operator-facing guides. NEVER affects API docs, webhooks, or integration setup articles. NOTE: "Managing Your Personal Settings" and "Auto Replies" articles are OPERATOR/ADJUSTER UI — they document personal settings (away status, profile dropdown) and auto-reply behavior. Flag them for any operator-facing UI change to those areas.
- ADMIN/ORG SETTINGS: Organization settings, Feature flags, LOB configuration, Auto-Close → affects only admin settings articles. NEVER affects the Inbox article or operator workflow guides.
  ADMIN SETTINGS SUBSECTIONS: Admin Settings is divided into subsections (Notifications, Security, Branding, Integrations, etc.). When recommending an existing article to update, match it to ONLY the specific subsection the feature belongs to — e.g. a Security/OAuth feature maps to the Security article only, NOT the Notifications article. Do not cross-match subsections.
- POLICYHOLDER EXPERIENCE: Opt-in/opt-out keywords, Welcome messages, Texting consent → affects only policyholder-facing guides and opt-in workflow articles.
- INTEGRATIONS (ClaimCenter, Mitchell, Salesforce, Guidewire, etc.): ONLY affects the specific integration's own setup or config article. A change to inbox UI does NOT affect any integration article.
- API/WEBHOOKS/DEVELOPER: ONLY affects API reference or webhook documentation. Operator or admin UI changes do NOT affect these.

IMPORTANT RULES:
1. Be SELECTIVE — only recommend articles that are ACTUALLY affected by each feature. Do NOT list every article for every feature.
2. Match features to articles in the same product category (see above). A notification badge change → Inbox article only, not webhooks. An opt-in keyword change → opt-in/opt-out article only, not API docs.
3. For each recommended article, decide: should an existing article be UPDATED, or should a NEW article be CREATED?
4. Be SPECIFIC about what sections of the article need changing and why.
5. Generate search queries that will find the RIGHT article without flooding results with false positives — see strict rules below.
6. BUG FIXES — include in featureChanges, but only recommend an article update if the fix changes behavior that was previously documented as working correctly. Pure UI display bugs, dropdown glitches, or back-end data bugs typically do not need documentation changes. Only flag a bug fix if it changes a user-facing workflow described in the Help Center.
7. USE AVAILABILITY SCOPE — each feature may include "Available to:" (e.g., "System Admins only", "All carriers", "SSO-enabled organizations using the Public API"). Use this to narrow down affected article categories: admin-only features affect admin articles; API/SSO/developer features affect developer docs; all-carriers features affect general operator guides.
8. NEW UI SECTIONS — if a release note mentions a new menu path, tab, or settings section (e.g., "Admin Settings → Security", "a new section within the Organization tab") that sounds like it hasn't existed before, treat that as a CREATE NEW article recommendation. Do not assume an article exists just because it's in a familiar area. When in doubt, recommend creating a new article for any newly-named section.
9. API FIELD ADDITIONS — if a release note for a Contact or Case field includes phrases like "set and retrieved via API", "supported via API", "fully supported via API", "available via API", or "returned in API responses", that is the explicit signal to flag API and webhook documentation. Generate search queries targeting the relevant resource and event (e.g., "contact updated", "contact API", "event ID contact" for a Contact field; "case API", "case updated" for a Case field). The correct payload field name for Contact Prefix is "contactPrefix" (not "prefix"). For other API changes (non-Contact/Case), flag all articles that document the affected API action (create, update, get, list) and generate queries targeting the specific resource and action.
10. UI ELEMENT CHANGES — if a release note describes a change to a named UI element (e.g., "Personal Settings Dropdown", "profile avatar", "a new button", "sidebar panel", "modal dialog", "toggle"), set screenshotUpdateNeeded: true for ANY article recommendation that documents that area of the UI. A named UI element change is a strong signal that the article's screenshots are outdated.
${trainingContext}

SEARCH QUERY RULES — follow these exactly:
- Use 1–2 queries per major feature (Features and Feature Enhancements). Bug fixes only get a query if the fix changes a documented workflow.
- Scale total queries to the release size: up to 5 features → max 10 queries; 6–10 features → max 14 queries; 11+ features → max 18 queries.
- Each query must be 1-3 words ONLY — never a full phrase or sentence
- Each query must be specific to a SINGLE feature — one query per feature concept
- FORBIDDEN as standalone queries (too generic, match hundreds of articles): "notification", "settings", "update", "case", "message", "admin", "operator", "integration"
- ALLOWED: the actual feature name or UI element (e.g., "address case", "away status", "feature audit log", "contact prefix", "opt-in oui", "OAuth API")
- DO NOT generate queries that would search integration, API, or partner docs for a webapp UI change. EXCEPTION: if the release notes include phrases like "set and retrieved via API", "supported via API", "fully supported via API", "available via API", or "returned in API responses" for a Contact or Case field, ALSO generate "contact updated" and "contact API" queries — the explicit API language in the release notes is the signal. For all other webapp UI changes that do not contain this language, only include API/webhook queries if the release EXPLICITLY states those are changing.
- If in doubt, use FEWER queries. 5 precise queries are better than 10 broad ones.

Return ONLY a valid JSON object (no markdown, no code blocks). IMPORTANT: If any field contains quotes or JSON examples, escape them with backslashes (e.g., \"value\").

Return with exactly these fields:
{
  "featureChanges": ["Section Header: Feature Name", "Another Feature"],
  "recommendedArticles": [
    {
      "title": "Exact or likely article title",
      "url": "https://himarley.zendesk.com/hc/en-us/articles/... (include ONLY if you are certain of the URL from training examples — omit otherwise)",
      "action": "update_existing",
      "reason": "Specific explanation of what content needs to change and why",
      "sectionToUpdate": ["Section 1", "Section 2 if the feature spans multiple parts of the article — list all affected sections"],
      "relatedFeatures": ["Section Header: Feature Name"],
      "searchQueries": ["query 1", "query 2"],
      "screenshotUpdateNeeded": false
    },
    {
      "title": "Suggested title for new article",
      "action": "create_new",
      "reason": "Why a new article is needed and what it should cover",
      "suggestedPlacement": "Help Center category > section path",
      "relatedFeatures": ["Another Feature"],
      "searchQueries": ["query for new article"]
    }
  ],
  "searchQueries": ["address case", "away status", "feature audit log"]
}

IMPORTANT NOTES ON featureChanges and relatedFeatures:
- In "featureChanges", use the FULL release notes section title. If the feature appears under a parent section header (e.g., "Focus on What Needs to be Addressed"), include it: "Focus on What Needs to be Addressed: Address Case Now Generally Available (GA)". If there is no parent header, use the feature name as-is.
- In each recommendedArticle's "relatedFeatures", use the EXACT same strings you used in "featureChanges" — they must match character-for-character so the system can link them.
- In each recommendedArticle's "searchQueries", list the 1-3 word search queries used to find that specific article (a subset of the top-level "searchQueries" list).`;

    // imageContext is per-scan (varies when PDF has screenshots), so it goes in the user message
    // to keep the system prompt static and cacheable across repeated scans
    const userContent = imageContext
      ? `${imageContext.trimStart()}\n\nAnalyze this release and identify what Help Center articles need updating:\n\n${releaseNotes}`
      : `Analyze this release and identify what Help Center articles need updating:\n\n${releaseNotes}`;

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await openaiResponse.json();
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    if (cachedTokens > 0) {
      console.log(`   💾 Cache hit: ${cachedTokens} prompt tokens served from cache`);
    }
    let analysisText = data.choices[0].message.content.trim();

    // Remove markdown code block formatting if present
    analysisText = analysisText.replace(/^```json\n?/, "").replace(/\n?```$/, "");

    // Parse JSON response
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseErr) {
      console.error("Failed to parse OpenAI response:", analysisText);
      throw new Error("Failed to parse release impact analysis from OpenAI");
    }

    // Validate response structure
    // Support both field names for backwards compatibility
    if (analysis.featureChanges && !analysis.affectedFeatures) {
      analysis.affectedFeatures = analysis.featureChanges;
    }
    if (!analysis.affectedFeatures || !Array.isArray(analysis.affectedFeatures)) {
      throw new Error("Invalid response: affectedFeatures must be an array");
    }
    if (!analysis.recommendedArticles || !Array.isArray(analysis.recommendedArticles)) {
      throw new Error("Invalid response: recommendedArticles must be an array");
    }
    if (!analysis.searchQueries || !Array.isArray(analysis.searchQueries)) {
      throw new Error("Invalid response: searchQueries must be an array");
    }

    // Normalize recommendedArticles to ensure they have title and reason
    const normalizedArticles = analysis.recommendedArticles.map((article) => {
      if (typeof article === "string") {
        return { title: article, reason: "" };
      }
      return article;
    });

    // Store analysis in session
    req.session.releaseImpactAnalysis = {
      affectedFeatures: analysis.affectedFeatures,
      recommendedArticles: normalizedArticles,
      searchQueries: analysis.searchQueries,
      analyzedAt: new Date().toISOString(),
    };

    console.log(`✅ Release impact analyzed:`);
    console.log(`   Affected features: ${analysis.affectedFeatures.length}`);
    console.log(`   Recommended articles: ${normalizedArticles.length}`);
    console.log(`   Search queries: ${analysis.searchQueries.length}`);

    res.json({
      success: true,
      affectedFeatures: analysis.affectedFeatures,
      recommendedArticles: normalizedArticles,
      searchQueries: analysis.searchQueries,
      tokens: data.usage.total_tokens,
    });
  } catch (err) {
    console.error("Release impact analysis error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/release-notes/export-analysis-pdf
 * Generate a downloadable PDF of the Release Impact Analysis
 */
router.get("/export-analysis-pdf", requireAuth, (req, res) => {
  try {
    const analysis = req.session.releaseImpactAnalysis;
    const version = req.session.releaseVersion || "Unknown";
    const pdfImageData = req.session.pdfImageData || null;

    if (!analysis) {
      return res.status(400).json({
        success: false,
        error: "No analysis available. Please run an analysis first.",
      });
    }

    const doc = new PDFDocument({ margin: 50, size: "LETTER" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Release_Impact_Analysis_v${version.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf"`
    );

    doc.pipe(res);

    // ─── Title ───
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("Release Impact Analysis", { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(13)
      .font("Helvetica")
      .fillColor("#555555")
      .text(`Version ${version}  •  Generated ${new Date().toLocaleDateString()}`, {
        align: "center",
      });
    doc.moveDown(0.5);
    doc
      .strokeColor("#cccccc")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(562, doc.y)
      .stroke();
    doc.moveDown(1);
    doc.fillColor("#000000");

    // ─── Affected Features ───
    if (analysis.affectedFeatures && analysis.affectedFeatures.length > 0) {
      doc.fontSize(15).font("Helvetica-Bold").text("Feature Changes from This Release");
      doc.moveDown(0.4);
      for (const feature of analysis.affectedFeatures) {
        doc.fontSize(11).font("Helvetica").text(`•  ${feature}`, { indent: 15 });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.6);
    }

    // ─── Recommended Articles ───
    if (analysis.recommendedArticles && analysis.recommendedArticles.length > 0) {
      doc.fontSize(15).font("Helvetica-Bold").text("Recommended Articles to Review");
      doc.moveDown(0.5);

      for (let i = 0; i < analysis.recommendedArticles.length; i++) {
        const article = analysis.recommendedArticles[i];
        const title = typeof article === "string" ? article : article.title;
        const reason = typeof article === "string" ? "" : article.reason || "";
        const action = typeof article === "object" ? article.action : null;
        const sectionToUpdateRaw = typeof article === "object" ? article.sectionToUpdate : null;
        const sectionToUpdate = Array.isArray(sectionToUpdateRaw) ? sectionToUpdateRaw.join(' · ') : sectionToUpdateRaw;
        const suggestedPlacement = typeof article === "object" ? article.suggestedPlacement : null;
        const screenshotNeeded = typeof article === "object" ? article.screenshotUpdateNeeded : false;

        // Check if we need a new page (leave room for at least the article block)
        if (doc.y > 650) {
          doc.addPage();
        }

        // Action badge
        const actionLabel = action === "create_new" ? "CREATE NEW" : "UPDATE EXISTING";
        const actionColor = action === "create_new" ? "#2563eb" : "#059669";

        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor(actionColor)
          .text(actionLabel, { continued: false });

        // Title
        const articleUrl = typeof article === "object" ? (article.url || null) : null;
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .fillColor(articleUrl ? "#1a56db" : "#000000")
          .text(`${i + 1}. ${title}`, { link: articleUrl || null, underline: !!articleUrl });
        doc.fillColor("#000000");

        // URL on its own line if available
        if (articleUrl) {
          doc.moveDown(0.1);
          doc.fontSize(9).font("Helvetica").fillColor("#555555")
            .text(articleUrl, { link: articleUrl, underline: true, width: 462 });
          doc.fillColor("#000000");
        }

        // Reason
        if (reason) {
          doc.moveDown(0.2);
          doc.fontSize(10).font("Helvetica").fillColor("#333333").text(reason, { indent: 15 });
        }

        // Section to update
        if (sectionToUpdate) {
          doc.moveDown(0.15);
          doc
            .fontSize(10)
            .font("Helvetica-Oblique")
            .fillColor("#666666")
            .text(`Section: ${sectionToUpdate}`, { indent: 15 });
        }

        // Suggested placement (for new articles)
        if (suggestedPlacement) {
          doc.moveDown(0.15);
          doc
            .fontSize(10)
            .font("Helvetica-Oblique")
            .fillColor("#666666")
            .text(`Suggested placement: ${suggestedPlacement}`, { indent: 15 });
        }

        // Screenshot flag
        if (screenshotNeeded) {
          doc.moveDown(0.15);
          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .fillColor("#b45309")
            .text("[!] Screenshots may need updating", { indent: 15 });
        }

        doc.fillColor("#000000");
        doc.moveDown(0.6);

        // Light divider between articles
        if (i < analysis.recommendedArticles.length - 1) {
          doc
            .strokeColor("#e5e5e5")
            .lineWidth(0.5)
            .moveTo(65, doc.y)
            .lineTo(547, doc.y)
            .stroke();
          doc.moveDown(0.5);
        }
      }
    }

    // ─── Search Queries ───
    if (analysis.searchQueries && analysis.searchQueries.length > 0) {
      doc.moveDown(0.5);
      if (doc.y > 680) doc.addPage();
      doc.fontSize(15).font("Helvetica-Bold").text("Search Queries Used");
      doc.moveDown(0.4);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#555555")
        .text(analysis.searchQueries.join("  •  "));
      doc.fillColor("#000000");
    }

    // ─── Footer ───
    doc.moveDown(1.5);
    doc
      .strokeColor("#cccccc")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(562, doc.y)
      .stroke();
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#999999")
      .text("Generated by Auto Doc Pilot  •  AI-assisted analysis — review recommendations before acting", {
        align: "center",
      });

    doc.end();
  } catch (err) {
    console.error("Error generating analysis PDF:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

export default router;

/**
 * POST /api/release-notes/analyze-article-impact
 * Analyzes a specific article to determine which sections are affected by release notes
 * Body: { releaseNotes: string, articleTitle: string, articleContent: string }
 * Returns: { affectedSections: string, specificImpact: string }
 */
router.post("/analyze-article-impact", requireAuth, async (req, res) => {
  try {
    const { releaseNotes, articleTitle, articleContent, articleSectionName, articleCategoryName, articleImages, articleLastUpdated } = req.body;

    if (!releaseNotes || !articleTitle || !articleContent) {
      return res.status(400).json({
        success: false,
        error: "releaseNotes, articleTitle, and articleContent are required",
      });
    }

    // Load product context rules
    let productContext = "";
    try {
      const productContextData = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "config", "product-context.json"), "utf-8")
      );
      const rules = productContextData.releaseToDocRules || [];
      if (rules.length > 0) {
        productContext = "\n\nHI MARLEY PRODUCT KNOWLEDGE — use these rules to decide relevance:\n";
        for (const rule of rules) {
          productContext += `- ${rule}\n`;
        }
      }
    } catch (e) {
      // product-context.json not yet created — continue without it
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }

    const rawArticleText = htmlToText(articleContent);
    const articleText = rawArticleText.length > 8000
      ? rawArticleText.substring(0, 8000) + "\n[... content truncated ...]"
      : rawArticleText;

    console.log(`🔍 Analyzing article: "${articleTitle}"${rawArticleText.length > 8000 ? ' (truncated to 8000 chars)' : ''}`);

    // Build image inventory block for user message (article-specific, so kept out of system prompt)
    let imageInventoryBlock = "";
    if (Array.isArray(articleImages) && articleImages.length > 0) {
      imageInventoryBlock = "ARTICLE IMAGE INVENTORY — screenshots currently in this article:\n";
      articleImages.forEach((img, idx) => {
        const fn = img.filename ? `"${img.filename}"` : "(no filename)";
        imageInventoryBlock += `  ${idx + 1}. Section: "${img.section}"  |  Filename: ${fn}\n`;
      });
      imageInventoryBlock += `When you identify screenshots that need updating, reference the filename and section from this list. If a screenshot's filename is generic (e.g. "Screenshot 2024-10-24 at 11.32.03 AM.png"), still include it — the section context is useful even without a descriptive name.\n`;
      console.log(`   📸 Passing ${articleImages.length} image(s) to AI for analysis`);
    }

    // System prompt is fully static (no per-article variables) so OpenAI can cache it across all
    // article calls within a scan. Per-article context (category, section, images) goes in the user message.
    const systemPrompt = `You are a Help Center content writer for Hi Marley, an insurance communication platform. Given release notes and a Help Center article, determine whether this specific article needs updating — and if so, write the EXACT replacement copy a writer could paste directly.

The article's category, section, and image inventory are provided in the user message. Use that context throughout your analysis.
${productContext}
━━━ STEP 1: CATEGORY GATE (do this first) ━━━
This release may contain multiple types of changes (e.g., UI changes AND API changes). You must evaluate this article ONLY against the features that match its category — not the entire release.

Using the Article Location provided in the user message, apply these domain rules:
  • INTEGRATIONS / API / WEBHOOKS / PARTNER articles → only relevant to features that EXPLICITLY change API endpoints, webhook payloads, OAuth flows, SSO behavior, or the setup steps of a named third-party integration (ClaimCenter, Guidewire, Salesforce, Mitchell, etc.). Web app UI changes (inbox, badges, notifications, filters, away status) are NEVER relevant to these articles. EXCEPTION: if a release adds a NEW DATA FIELD to the Contact or Case record (e.g., Contact Prefix, postal code), webhook articles documenting Contact or Case events (e.g., "Contact Updated", "Case Created") ARE relevant — new Contact/Case fields appear in the webhook payload even when the release frames the change as a UI feature. In that case, check whether the article's payload example is missing the new field and propose adding it. The correct field name for Contact Prefix is "contactPrefix" (not "prefix").
  • OPERATOR/ADJUSTER UI articles (Inbox, Cases, Messaging, Personal Settings, Auto Replies, Managing Personal Settings) → relevant to web app UI changes only. Not relevant to API or webhook changes. NOTE: "Managing Your Personal Settings" is OPERATOR/ADJUSTER UI — NOT admin settings — even though the title contains "settings". It documents operator personal preferences: away status, profile dropdown, notification prefs. Always flag it for operator-facing UI changes involving the personal settings dropdown or away/available status.
  • ADMIN/SETTINGS articles → relevant to admin configuration features only. CRITICAL SUBSECTION RULE: Admin Settings is divided into distinct subsections (Notifications, Security, Branding, Integrations, etc.). An article covering the "Notifications" subsection is ONLY relevant to notification configuration features — never to Security, OAuth, or authentication changes. An article covering "Security" is ONLY relevant to authentication, OAuth, SSO, or security features — never to notification settings. A feature in one Admin subsection NEVER affects an article from a different Admin subsection. Check whether the article's title or section name matches the feature's specific subsection before proceeding.
  • POLICYHOLDER / MOBILE articles → relevant to policyholder-facing or mobile features only.
- If NO release features match this article's domain, return alreadyCovered: true immediately. Do not proceed.

━━━ STEP 2: CONTENT GATE (do this second) ━━━
For each release feature you identified as potentially relevant in Step 1:
- Find the SPECIFIC sentence, paragraph, or section in the article content that documents the functionality this feature changes.
- If you CANNOT point to specific existing text that would need to change, this article does not need updating. Return alreadyCovered: true.
- A vague topic overlap is NOT enough. The article must ACTUALLY DOCUMENT the specific thing the release changes.
- ARTICLE AGE SIGNAL: The user message includes "Article Last Updated" when available. An article not updated in 12+ months is more likely to contain stale or incomplete descriptions of a feature — apply a slightly lower threshold when deciding if content is outdated. An article updated 2+ years ago that documents a feature area being changed should generally be flagged unless the specific text is clearly still accurate.

━━━ STEP 3: WRITE THE UPDATE (only if both gates pass) ━━━
Only reach this step if you found: (a) a matching feature domain AND (b) specific article text that needs changing.

HI MARLEY WRITING STYLE:
- Friendly, conversational, warm — like a helpful teammate, not a manual
- Short punchy sentences for impact; explanatory sentences for context
- "you" for operators/adjusters; "they/their" for policyholders
- Em dashes (—) for parenthetical pauses; "Pro tip:" for bonus guidance
- Match the article's exact formatting (bullets, numbered steps, bold labels, etc.)
- Use **double asterisks** in proposedText for bold text, matching the article's existing bold patterns. Examples: **Q:** / **A:** for FAQ entries; **Term:** for defined terms; **Label** for bold callout labels. This renders as <strong> in Zendesk.
- Maximum 3 proposedCopy entries — focus on what matters most

TABLE DETECTION — IMPORTANT:
- If the section being updated is an HTML table (e.g. a Request Field Breakdown, Response Fields table, API parameter table, or any tabular data), set "changeType": "table_update" instead of "update_text".
- For table_update entries: set "proposedText" to a clear pipe-delimited representation of ONLY the new row(s) to add, like: "prefix | The prefix or title for the Contact | string | false | \\"prefix\\": \\"Mr.\\""
- Set "instruction" to: "⚠ TABLE UPDATE — add the following row(s) to the [table name] table. Do not use the text below as prose — it represents a table row."
- Never try to reproduce a full HTML table as plain text. Only provide the new values.

SCREENSHOT GUIDANCE:
- The user message includes an ARTICLE IMAGE INVENTORY if this article has screenshots.
- If this article has images in any section you are recommending to update, you MUST populate "screenshotsToUpdate" with those images. Do not skip even if uncertain — flag it so the writer can verify.
- Always include the filename exactly as it appears in the inventory (even generic names like "Screenshot 2024-10-24 at 11.32.03 AM.png"). The section context alone is useful to the writer.
- Write a specific, one-sentence reason explaining what visual element in that section is likely outdated given the release change (e.g. "Shows the old 'Unanswered Case' tag label which has been renamed to 'Needs First Touch'").
- If the article has NO images in the affected sections, leave screenshotsToUpdate empty.
- If this is an API-only / webhook / integration setup article with no UI screenshots, leave screenshotsToUpdate empty.
- Do NOT invent filenames — only reference filenames from the inventory in the user message.

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "alreadyCovered": false,
  "affectedSections": "Specific section titles that need updating",
  "specificImpact": "1-2 sentences: what specific text in the article needs to change and exactly why",
  "proposedCopy": [
    {
      "section": "The section heading or area where this change belongs",
      "changeType": "update_text | add_to_list | new_section | add_paragraph",
      "instruction": "One sentence: exactly what to do",
      "proposedText": "Exact replacement or addition text in Hi Marley's style. Use \\n for line breaks. Use **double asterisks** for bold text (e.g., **Q:** and **A:** for FAQ entries, **Term:** for defined terms, or any bold label matching the article's existing formatting)."
    }
  ],
  "screenshotsToUpdate": [
    {
      "section": "The section heading where this screenshot appears",
      "filename": "original-filename-from-inventory.png",
      "type": "image | gif | video",
      "reason": "One sentence: what changed in the UI that makes this screenshot outdated"
    }
  ]
}

If alreadyCovered is true, return: { "alreadyCovered": true, "affectedSections": "", "specificImpact": "", "proposedCopy": [], "screenshotsToUpdate": [] }`;

    // Per-article context goes in the user message to keep the system prompt static and cacheable
    const locationContext = (articleCategoryName || articleSectionName)
      ? `Article Location: ${articleCategoryName || "Unknown"} > ${articleSectionName || "Unknown"}\nNote: Only update this article for release features that match its domain (e.g., an Integrations article is not affected by web app UI changes unless the release explicitly mentions API changes).\n`
      : "";
    let ageContext = "";
    if (articleLastUpdated) {
      const ageMonths = Math.floor((Date.now() - new Date(articleLastUpdated)) / (1000 * 60 * 60 * 24 * 30.44));
      const dateStr = new Date(articleLastUpdated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      ageContext = `Article Last Updated: ${dateStr} (${ageMonths} month${ageMonths !== 1 ? 's' : ''} ago)\n`;
    }
    const contextBlock = locationContext || ageContext ? `${locationContext}${ageContext}\n` : "";
    const imagesSection = imageInventoryBlock ? `${imageInventoryBlock}\n` : "";

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `${contextBlock}${imagesSection}Release Notes:\n${releaseNotes}\n\n---\n\nArticle: "${articleTitle}"\n\nContent:\n${articleText}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 2500,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await openaiResponse.json();
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    if (cachedTokens > 0) {
      console.log(`   💾 Cache hit for "${articleTitle}": ${cachedTokens} prompt tokens served from cache`);
    }
    const finishReason = data.choices[0].finish_reason;
    const truncated = finishReason === 'length';
    let analysisText = data.choices[0].message.content.trim();

    if (truncated) {
      console.warn(`⚠️  Token limit hit for "${articleTitle}" — response was truncated (finish_reason: length). Increase max_tokens if this persists.`);
    }

    // Remove markdown code block formatting if present
    analysisText = analysisText.replace(/^```json\n?/, "").replace(/\n?```$/, "");

    // Parse JSON response
    let analysis;
    let parseError = null;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseErr) {
      parseError = parseErr.message;
      console.error(`Failed to parse OpenAI response for "${articleTitle}":`, analysisText.slice(0, 200));
      // Default to excluded on parse failure — safer than including unverified articles
      analysis = {
        alreadyCovered: true,
        affectedSections: "",
        specificImpact: "",
        proposedCopy: [],
        screenshotsToUpdate: [],
      };
    }

    const screenshotsToUpdate = Array.isArray(analysis.screenshotsToUpdate)
      ? analysis.screenshotsToUpdate
      : [];

    if (screenshotsToUpdate.length > 0) {
      console.log(`   📸 AI flagged ${screenshotsToUpdate.length} screenshot(s) in "${articleTitle}" for updating`);
    }

    res.json({
      success: true,
      alreadyCovered: analysis.alreadyCovered ?? true,
      affectedSections: analysis.affectedSections || "",
      specificImpact: analysis.specificImpact || "",
      proposedCopy: analysis.proposedCopy || [],
      screenshotsToUpdate,
      truncated,
      parseError,
    });
  } catch (err) {
    console.error("Error analyzing article impact:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/release-notes/manual-prompt
 * Export the analyze-impact prompt for manual use in ChatGPT.
 * Returns the full formatted prompt (system + user message) as copyable text.
 */
router.get("/manual-prompt", requireAuth, async (req, res) => {
  try {
    const releaseNotes = req.session?.releaseNotes;
    if (!releaseNotes) {
      return res.status(400).json({
        success: false,
        error: "No release notes found in session. Please save your release notes first.",
      });
    }

    const { systemPrompt, userContent } = await buildAnalyzeImpactMessages(
      releaseNotes,
      req.session.pdfImageData
    );

    const divider = "─".repeat(60);
    const combined = `[SYSTEM INSTRUCTIONS — paste into ChatGPT's custom instructions or as the first message]\n\n${systemPrompt}\n\n${divider}\n\n[YOUR MESSAGE — paste this as your message to ChatGPT]\n\n${userContent}`;

    res.json({ success: true, combined, systemPrompt, userMessage: userContent });
  } catch (err) {
    console.error("Error building manual prompt:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/release-notes/manual-import
 * Accept the JSON response pasted from ChatGPT and store it in session
 * exactly as /analyze-impact would. Allows the rest of the flow to continue normally.
 * Body: { responseText: string }
 */
router.post("/manual-import", requireAuth, async (req, res) => {
  try {
    const { responseText } = req.body;
    if (!responseText || typeof responseText !== "string") {
      return res.status(400).json({ success: false, error: "responseText is required" });
    }

    // Parse the ChatGPT response using the shared sanitizer, which handles:
    //   • Markdown code fences  (```json ... ```)
    //   • Unicode "smart" quotes  (" " ' ')
    //   • Unescaped interior double-quotes  e.g. "field name "contactPrefix"."
    let analysis;
    try {
      analysis = sanitizeAndParseJson(responseText);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: `Could not parse the response as JSON. Make sure you copied the full JSON output from ChatGPT. (Parse error: ${parseErr.message})`,
      });
    }

    // Support both field name variants (featureChanges / affectedFeatures)
    if (analysis.featureChanges && !analysis.affectedFeatures) {
      analysis.affectedFeatures = analysis.featureChanges;
    }

    if (!Array.isArray(analysis.affectedFeatures)) {
      return res.status(400).json({ success: false, error: "Missing affectedFeatures array in response" });
    }
    if (!Array.isArray(analysis.recommendedArticles)) {
      return res.status(400).json({ success: false, error: "Missing recommendedArticles array in response" });
    }
    if (!Array.isArray(analysis.searchQueries)) {
      return res.status(400).json({ success: false, error: "Missing searchQueries array in response" });
    }

    // Normalize articles: convert bare strings and strip any markdown link format
    // from url fields  e.g.  "[https://…](https://…)"  →  "https://…"
    const normalizedArticles = analysis.recommendedArticles.map((a) => {
      if (typeof a === "string") return { title: a, reason: "" };
      if (a.url && typeof a.url === "string") {
        const mdLink = a.url.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
        if (mdLink) a = { ...a, url: mdLink[1] };
      }
      return a;
    });

    // Store in session — identical shape to what /analyze-impact stores
    req.session.releaseImpactAnalysis = {
      affectedFeatures: analysis.affectedFeatures,
      recommendedArticles: normalizedArticles,
      searchQueries: analysis.searchQueries,
      analyzedAt: new Date().toISOString(),
    };

    console.log(`✅ Manual import: ${analysis.affectedFeatures.length} features, ${normalizedArticles.length} articles, ${analysis.searchQueries.length} queries`);

    res.json({
      success: true,
      affectedFeatures: analysis.affectedFeatures,
      recommendedArticles: normalizedArticles,
      searchQueries: analysis.searchQueries,
    });
  } catch (err) {
    console.error("Manual import error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
