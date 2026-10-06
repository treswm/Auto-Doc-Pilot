/**
 * Translation helpers for Auto Doc Pilot
 * Builds prompts and translates articles to French Canadian
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load glossary from file
 * Falls back to zendesk-translation-by-section glossary if not found locally
 */
function loadGlossary() {
  try {
    const localPath = path.join(__dirname, '../config/glossary.json');
    if (fs.existsSync(localPath)) {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      return data.glossary || [];
    }

    // Fall back to zendesk-translation-by-section glossary
    const fallbackPath = path.join(__dirname, '../../zendesk-translation-by-section/glossary.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      return data.glossary || [];
    }

    console.warn('⚠️  No glossary.json found, using default empty glossary');
    return [];
  } catch (err) {
    console.warn('⚠️  Failed to load glossary:', err.message);
    return [];
  }
}

/**
 * Format glossary for inclusion in prompts
 */
export function formatGlossaryForPrompt(glossaryTerms) {
  if (!Array.isArray(glossaryTerms) || glossaryTerms.length === 0) {
    return '(No glossary terms loaded)';
  }

  return glossaryTerms
    .map((term) => `- "${term.english}" → "${term.french}"`)
    .join('\n');
}

/**
 * Truncate HTML content to approximate character limit while respecting structure
 * Simple approach: truncate at character boundary, don't try to fix broken tags
 */
function truncateHtml(html, maxChars = 8000) {
  if (!html || html.length <= maxChars) {
    return html;
  }
  return html.substring(0, maxChars) + '...';
}

/**
 * Build a batch translation prompt for ChatGPT
 * Contains all articles that need translation
 */
export function buildTranslationBatchPrompt(articles, glossaryTerms = null) {
  const glossary = glossaryTerms || loadGlossary();
  const glossaryRef = formatGlossaryForPrompt(glossary);

  const systemPrompt = `You are translating a batch of Zendesk Help Center articles from English to French Canadian (fr-ca).

IMPORTANT GLOSSARY - Use these exact translations for Hi Marley platform terms:
${glossaryRef}

Rules:
- Preserve ALL HTML tags, attributes, ids, href URLs, image src URLs, and placeholders exactly.
- Do NOT add or remove HTML elements; translate only human-readable text nodes.
- Use Quebec French conventions and vocabulary, not European French.
- Always address the reader using "vous" (formal), never "tu".
- Do NOT translate product names like Hi Marley, Hi Marley Connect, Zendesk, or Guidewire.
- Keep abbreviations like FNOL, TTFC, TLA, SSO, OOO with their French equivalents from the glossary.
- Watch for English idioms (e.g. "out of the box", "heads up", "circle back") — translate their meaning, not the literal words.
- Beware of false cognates: "actual" → "réel" (not "actuel"), "eventually" → "finalement" (not "éventuellement"), "demand" → "exigence" (not "demande" when meaning a requirement).
- Apply French Canadian capitalization: days, months, and languages are lowercase; headings capitalize only the first word.
- Prefer active voice over passive voice constructions.
- Numbers use a space as the thousands separator and a comma as the decimal (e.g. 1 000,00). Dates use the format "19 mars 2026". Currency places the dollar sign after the amount (e.g. 1 000 $).

Return ONLY a JSON array with NO markdown code fences or formatting:
[
  { "articleId": 12345, "title": "...", "body": "..." },
  { "articleId": 67890, "title": "...", "body": "..." }
]`;

  // Build article list
  const articleLines = articles.map((article, idx) => {
    const truncatedBody = truncateHtml(article.body || '', 8000);
    return `${idx + 1}. Article ${article.id} (${article.title})
${truncatedBody}`;
  }).join('\n\n');

  const userPrompt = `ARTICLES TO TRANSLATE (${articles.length} total):

${articleLines}

Translate all articles above and return a JSON array. Use the exact format shown.`;

  return {
    systemPrompt,
    userMessage: userPrompt,
    combined: `${systemPrompt}\n\nUser Message:\n${userPrompt}`,
  };
}

/**
 * Build a simple translation prompt for OpenAI API (auto mode)
 * Used for single article or small batch via API
 */
export function buildOpenAITranslationPrompt(article, glossaryTerms = null) {
  const glossary = glossaryTerms || loadGlossary();
  const glossaryRef = formatGlossaryForPrompt(glossary);

  const instructions = `Translate a Zendesk Help Center article from English to French Canadian (fr-ca).

IMPORTANT GLOSSARY - Use these exact translations for Hi Marley platform terms:
${glossaryRef}

Rules:
- Preserve ALL HTML tags, attributes, ids, href URLs, image src URLs, and placeholders exactly.
- Do NOT add or remove HTML elements; translate only human-readable text nodes.
- Use Quebec French conventions and vocabulary, not European French.
- Always address the reader using "vous" (formal), never "tu".
- Do NOT translate product names like Hi Marley, Hi Marley Connect, Zendesk, or Guidewire.
- Keep abbreviations like FNOL, TTFC, TLA, SSO, OOO with their French equivalents from the glossary.
- Watch for English idioms — translate their meaning, not the literal words.
- Beware of false cognates.
- Apply French Canadian capitalization and formatting rules.
- Return JSON: { "title": "...", "body": "..." }.`;

  return {
    system: instructions,
    user: `TITLE:\n${article.title}\n\nBODY_HTML:\n${article.body || ''}`,
  };
}

/**
 * Call OpenAI to translate an article
 */
export async function translateArticleViaOpenAI(article, glossaryTerms = null) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  const prompt = buildOpenAITranslationPrompt(article, glossaryTerms);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const jsonSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['title', 'body'],
  };

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'zendesk_translation',
        strict: true,
        schema: jsonSchema,
      },
    },
  };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      const error = new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
      error.quotaExceeded = data.error?.code === 'insufficient_quota';
      error.status = res.status;
      error.openaiError = data.error;
      throw error;
    }

    let parsed;
    try {
      const content = data.choices[0].message.content;
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Could not parse OpenAI response as JSON: ${data.choices[0].message.content.slice(0, 200)}`);
    }

    if (!parsed.title || !parsed.body) {
      throw new Error('OpenAI response missing title or body');
    }

    return {
      title: parsed.title,
      body: parsed.body,
      usage: data.usage || {},
    };
  } catch (err) {
    if (err.quotaExceeded) {
      err.quotaExceeded = true;
    }
    throw err;
  }
}

/**
 * Validate translation response from ChatGPT
 * Returns { valid, errors, articles }
 */
export function validateTranslationResponse(responseText) {
  const errors = [];

  // Try to parse as JSON
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    errors.push(`Invalid JSON: ${err.message}`);
    return { valid: false, errors, articles: [] };
  }

  // Must be an array
  if (!Array.isArray(parsed)) {
    errors.push('Response must be a JSON array');
    return { valid: false, errors, articles: [] };
  }

  // Validate each article
  const articles = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];

    if (!item.articleId) {
      errors.push(`Article ${i}: missing articleId`);
      continue;
    }

    if (!item.title) {
      errors.push(`Article ${item.articleId}: missing title`);
      continue;
    }

    if (!item.body) {
      errors.push(`Article ${item.articleId}: missing body`);
      continue;
    }

    articles.push({
      articleId: String(item.articleId),
      title: item.title,
      body: item.body,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    articles,
  };
}

/**
 * Merge translation results with original article metadata
 */
export function mergeTranslationResults(articles, translationResults) {
  const resultMap = new Map();
  for (const result of translationResults) {
    resultMap.set(String(result.articleId), result);
  }

  const merged = [];
  for (const article of articles) {
    const translated = resultMap.get(String(article.id));
    if (translated) {
      merged.push({
        articleId: article.id,
        title: article.title,
        body: article.body,
        translatedTitle: translated.title,
        translatedBody: translated.body,
        sectionName: article.sectionName,
        sectionId: article.sectionId,
      });
    }
  }

  return merged;
}

export { loadGlossary };
