/**
 * Translation API Endpoints
 * Handles AI-powered translations with glossary context
 */

import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// Default translation instructions if none provided
const DEFAULT_TRANSLATION_INPUT = `Translation Corrects:
• Idioms like "out of the box" should not be directly translated. Out of the box should instead be translated to: clé en main
• [Add more translation rules here]

Hi Marley Glossary:
[Paste the glossary content here - include all Hi Marley specific terms and their translations]

Additional Notes:
[Any other guidance for translators]`;

/**
 * GET /api/translations/input
 * Retrieve the current translation input (glossary + instructions)
 */
router.get("/input", requireAuth, (req, res) => {
  try {
    // In a real implementation, this would fetch from a database
    // For now, we'll just return the default or user-provided input
    const translationInput = req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    res.json({
      success: true,
      translationInput,
    });
  } catch (err) {
    console.error("Error retrieving translation input:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/input
 * Save the translation input (glossary + instructions)
 * Body: { translationInput: string }
 */
router.post("/input", requireAuth, (req, res) => {
  try {
    const { translationInput } = req.body;

    if (!translationInput || typeof translationInput !== "string") {
      return res.status(400).json({
        success: false,
        error: "translationInput must be a non-empty string",
      });
    }

    // Save to session (in production, save to database)
    req.session.translationInput = translationInput;

    console.log(
      `✅ Translation input saved (${translationInput.length} characters)`
    );

    res.json({
      success: true,
      message: "Translation input saved successfully",
      length: translationInput.length,
    });
  } catch (err) {
    console.error("Error saving translation input:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/translate
 * Translate content using OpenAI with glossary context
 * Body: { content: string, targetLocale: string, translationInput?: string }
 */
router.post("/translate", requireAuth, async (req, res) => {
  try {
    const { content, targetLocale = "fr-ca", translationInput } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "content is required",
      });
    }

    // Use provided translation input or fetch from session
    const glossary = translationInput || req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }

    console.log(`🌐 Translating to ${targetLocale} with glossary context...`);

    // Build the system prompt with glossary
    const systemPrompt = `You are an expert translator for Hi Marley, a healthcare technology company.

Your translation guidelines and glossary:
${glossary}

Translate the content below while adhering to these guidelines. Maintain the same HTML structure and formatting.`;

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Translate the following content to ${targetLocale}:\n\n${content}`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent translations
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${error.error.message}`);
    }

    const data = await openaiResponse.json();
    const translatedContent = data.choices[0].message.content;

    console.log(`✅ Translation completed (${translatedContent.length} characters)`);

    res.json({
      success: true,
      content: translatedContent,
      targetLocale,
      tokens: data.usage.total_tokens,
    });
  } catch (err) {
    console.error("Translation error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/batch
 * Translate multiple articles at once
 * Body: { articles: Array<{id, title, body}>, targetLocale: string, translationInput?: string }
 */
router.post("/batch", requireAuth, async (req, res) => {
  try {
    const { articles, targetLocale = "fr-ca", translationInput } = req.body;

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "articles must be a non-empty array",
      });
    }

    const glossary = translationInput || req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    console.log(`🌐 Batch translating ${articles.length} articles to ${targetLocale}...`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const systemPrompt = `You are an expert translator for Hi Marley, a healthcare technology company.

Your translation guidelines and glossary:
${glossary}

Translate the content below while adhering to these guidelines. Maintain the same HTML structure and formatting.`;

    const results = [];
    let totalTokens = 0;

    for (const article of articles) {
      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: `Translate the following Help Center article to ${targetLocale}:\n\nTitle: ${article.title}\n\nContent:\n${article.body}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 4000,
          }),
        });

        if (!openaiResponse.ok) {
          const error = await openaiResponse.json();
          results.push({
            articleId: article.id,
            success: false,
            error: error.error.message,
          });
          continue;
        }

        const data = await openaiResponse.json();
        totalTokens += data.usage.total_tokens;

        results.push({
          articleId: article.id,
          success: true,
          translatedBody: data.choices[0].message.content,
          tokens: data.usage.total_tokens,
        });
      } catch (err) {
        results.push({
          articleId: article.id,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `✅ Batch translation completed: ${successCount}/${articles.length} successful`
    );

    res.json({
      success: true,
      results,
      summary: {
        total: articles.length,
        successful: successCount,
        failed: articles.length - successCount,
        totalTokens,
      },
    });
  } catch (err) {
    console.error("Batch translation error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
