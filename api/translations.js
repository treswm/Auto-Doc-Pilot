/**
 * Translation API endpoints
 * Handles both auto mode (OpenAI) and manual mode (ChatGPT) translations
 */

import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { fetchArticlesBySection, fetchArticle } from '../lib/zendesk-api.js';
import {
  buildTranslationBatchPrompt,
  translateArticleViaOpenAI,
  validateTranslationResponse,
  mergeTranslationResults,
  loadGlossary,
} from '../lib/translation-helpers.js';
import { sanitizeAndParseJson } from '../lib/json-sanitizer.js';

const router = express.Router();

// All translation endpoints require authentication
router.use(requireAuth);

/**
 * GET /api/translations/sections
 * List all Help Center sections
 */
router.get('/sections', async (req, res) => {
  try {
    // For now, return a hardcoded list of common sections
    // In a real implementation, fetch this from Zendesk API
    const sections = [
      { id: '360001112753', name: 'Getting Started', articleCount: 5 },
      { id: '51479381812243', name: 'Messaging Basics', articleCount: 12 },
      { id: '51479382451603', name: 'Inbox', articleCount: 8 },
      { id: '51479399006867', name: 'Sign In and Access', articleCount: 6 },
      { id: '51479411788819', name: 'Web App Features', articleCount: 15 },
      { id: '51479425052435', name: 'Cases, Claims, and Policies', articleCount: 10 },
      { id: '51479444986003', name: 'Messaging and Media', articleCount: 8 },
      { id: '51479411495955', name: 'Insights', articleCount: 7 },
      { id: '51479398430227', name: 'Settings', articleCount: 11 },
      { id: '51479424723475', name: 'Mobile App', articleCount: 9 },
      { id: '51479410843539', name: 'Connect (Browser Extension)', articleCount: 6 },
      { id: '51479445610131', name: 'Webhooks', articleCount: 4 },
    ];

    res.json({ success: true, sections });
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/translations/auto-translate
 * Fetch articles from a section and translate them via OpenAI
 */
router.get('/auto-translate', async (req, res) => {
  try {
    const { sectionId } = req.query;

    if (!sectionId) {
      return res.status(400).json({ success: false, error: 'sectionId is required' });
    }

    // Fetch all articles in the section
    const articles = await fetchArticlesBySection(sectionId, 'en-us');

    if (articles.length === 0) {
      return res.json({
        success: true,
        translatedCount: 0,
        articles: [],
        quotaExceeded: false,
      });
    }

    // Translate each article via OpenAI
    const results = [];
    let quotaExceeded = false;

    for (const article of articles) {
      try {
        const translated = await translateArticleViaOpenAI(article);
        results.push({
          articleId: article.id,
          title: article.title,
          body: article.body,
          translatedTitle: translated.title,
          translatedBody: translated.body,
        });
      } catch (err) {
        if (err.quotaExceeded) {
          quotaExceeded = true;
          break;
        }
        console.warn(`Failed to translate article ${article.id}:`, err.message);
      }
    }

    // Store in session for later upload
    req.session.translationSectionId = sectionId;
    req.session.translationArticles = articles;
    req.session.translationResults = results;
    req.session.translationMode = 'auto';

    res.json({
      success: true,
      translatedCount: results.length,
      articles: results,
      quotaExceeded,
      quotaMessage: quotaExceeded ? 'OpenAI quota exceeded. Switch to Manual Mode to continue.' : null,
    });
  } catch (error) {
    console.error('Error in auto-translate:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      quotaExceeded: error.quotaExceeded || false,
    });
  }
});

/**
 * GET /api/translations/manual-prompt
 * Generate a ChatGPT prompt for translating all articles in a section
 */
router.get('/manual-prompt', async (req, res) => {
  try {
    const { sectionId } = req.query;

    if (!sectionId) {
      return res.status(400).json({ success: false, error: 'sectionId is required' });
    }

    // Fetch all articles in the section
    const articles = await fetchArticlesBySection(sectionId, 'en-us');

    if (articles.length === 0) {
      return res.status(404).json({ success: false, error: 'No articles found in this section' });
    }

    // Build the prompt
    const glossary = loadGlossary();
    const prompt = buildTranslationBatchPrompt(articles, glossary);

    // Store articles in session for later use
    req.session.translationSectionId = sectionId;
    req.session.translationArticles = articles;
    req.session.translationMode = 'manual';

    res.json({
      success: true,
      combined: prompt.combined,
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      articleCount: articles.length,
      articleTitles: articles.map((a) => a.title),
    });
  } catch (error) {
    console.error('Error generating manual prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/translations/manual-import
 * Parse ChatGPT's translation response and store results
 */
router.post('/manual-import', async (req, res) => {
  try {
    const { responseText } = req.body;

    if (!responseText) {
      return res.status(400).json({ success: false, error: 'responseText is required' });
    }

    if (!req.session.translationArticles) {
      return res.status(400).json({
        success: false,
        error: 'No cached articles found. Generate a prompt first.',
      });
    }

    // Parse the ChatGPT response
    const parsed = sanitizeAndParseJson(responseText);

    // Validate response format
    const validation = validateTranslationResponse(JSON.stringify(parsed));

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid translation response',
        details: validation.errors,
      });
    }

    // Verify all articleIds match cached articles
    const cachedIds = new Set(req.session.translationArticles.map((a) => String(a.id)));
    const returnedIds = new Set(validation.articles.map((a) => String(a.articleId)));

    // Check for hallucinated IDs (returned IDs not in cached articles)
    for (const id of returnedIds) {
      if (!cachedIds.has(id)) {
        return res.status(400).json({
          success: false,
          error: `Article ID ${id} was not in the original batch (hallucinated by ChatGPT)`,
        });
      }
    }

    // Merge translation results with original article data
    const merged = mergeTranslationResults(req.session.translationArticles, validation.articles);

    // Store results in session
    req.session.translationResults = merged;

    res.json({
      success: true,
      translatedCount: merged.length,
      articles: merged,
    });
  } catch (error) {
    console.error('Error importing manual translations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/translations/upload-results
 * Upload translated articles to Zendesk
 */
router.post('/upload-results', async (req, res) => {
  try {
    if (!req.session.translationResults || req.session.translationResults.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No translation results to upload',
      });
    }

    const results = req.session.translationResults;
    const accessToken = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
    const subdomain = process.env.ZENDESK_SUBDOMAIN || 'himarley';
    const apiBase = `https://${subdomain}.zendesk.com/api/v2`;

    const uploaded = [];
    const failures = [];

    for (const article of results) {
      try {
        // Create/update French-Canadian translation
        const payload = {
          translation: {
            locale: 'fr-ca',
            title: article.translatedTitle,
            body: article.translatedBody,
            draft: false,
          },
        };

        const res = await fetch(
          `${apiBase}/help_center/articles/${article.articleId}/translations.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        const text = await res.text();

        // Handle "translation exists" as success (409 or 422)
        if (res.status === 409 || res.status === 422) {
          // Try to update instead
          const updateRes = await fetch(
            `${apiBase}/help_center/articles/${article.articleId}/translations/fr-ca.json`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );

          if (!updateRes.ok) {
            const updateText = await updateRes.text();
            throw new Error(`Failed to update translation: ${updateRes.status} ${updateRes.statusText}\n${updateText}`);
          }

          uploaded.push(article.articleId);
        } else if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}\n${text}`);
        } else {
          uploaded.push(article.articleId);
        }
      } catch (err) {
        failures.push({
          articleId: article.articleId,
          title: article.title,
          error: err.message,
        });
      }
    }

    // Clear session after upload
    delete req.session.translationResults;
    delete req.session.translationArticles;

    res.json({
      success: true,
      uploaded: uploaded.length,
      failed: failures.length,
      uploadedIds: uploaded,
      failures,
      message: `Uploaded ${uploaded.length} translations${failures.length > 0 ? ` (${failures.length} failed)` : ''}`,
    });
  } catch (error) {
    console.error('Error uploading translations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
