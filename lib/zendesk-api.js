/**
 * Zendesk Help Center API wrapper
 * Uses scoped OAuth tokens created via create-oauth-token.js
 */

import 'dotenv/config';

function getApiBase() {
  const subdomain = process.env.ZENDESK_SUBDOMAIN || 'himarley';
  return `https://${subdomain}.zendesk.com/api/v2`;
}

/**
 * Get OAuth access token
 */
function getAccessToken() {
  const token = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'Missing ZENDESK_OAUTH_ACCESS_TOKEN in .env\n\n' +
      'Create it first:\n' +
      '  node scripts/create-oauth-token.js'
    );
  }
  return token;
}

/**
 * Fetch a single article by ID from the Help Center
 * @param {string|number} articleId - The Help Center article ID
 * @param {string} locale - Language locale (default: 'en-us')
 * @returns {Promise<Object>} Article object with id, title, body, etc.
 */
export async function fetchArticle(articleId, locale = 'en-us') {
  const token = getAccessToken();
  const url = `${getApiBase()}/help_center/${locale}/articles/${articleId}.json`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Zendesk API error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data.article;
  } catch (err) {
    console.error(`Failed to fetch article ${articleId}:`, err.message);
    throw err;
  }
}

/**
 * Fetch articles by IDs (bulk)
 * @param {string[]|number[]} articleIds - Array of Help Center article IDs
 * @param {string} locale - Language locale (default: 'en-us')
 * @returns {Promise<Object[]>} Array of article objects
 */
export async function fetchArticles(articleIds, locale = 'en-us') {
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    return [];
  }

  const articles = [];
  for (const id of articleIds) {
    try {
      const article = await fetchArticle(id, locale);
      articles.push(article);
    } catch (err) {
      console.warn(`Skipping article ${id} due to error:`, err.message);
    }
  }
  return articles;
}

/**
 * Search Help Center articles by keyword
 * @param {string} query - Search query
 * @param {string} locale - Language locale (default: 'en-us')
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Object[]>} Array of matching article objects
 */
export async function searchArticles(query, locale = 'en-us', limit = 50) {
  const token = getAccessToken();
  const url = new URL(`${getApiBase()}/help_center/${locale}/articles/search.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('per_page', limit);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Zendesk API error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data.articles || [];
  } catch (err) {
    console.error(`Failed to search articles for "${query}":`, err.message);
    throw err;
  }
}

/**
 * Fetch recently edited articles from Help Center
 * @param {number} daysBack - How many days back to search (default: 7)
 * @param {string} locale - Language locale (default: 'en-us')
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Object[]>} Array of recently edited article objects
 */
export async function fetchRecentlyEditedArticles(daysBack = 7, locale = 'en-us', limit = 50) {
  const token = getAccessToken();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  // Use Zendesk search syntax to find recently updated articles
  const query = `updated_at:>=${cutoffISO}`;
  const url = new URL(`${getApiBase()}/help_center/${locale}/articles/search.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('per_page', limit);
  url.searchParams.append('sort_by', 'updated_at');
  url.searchParams.append('sort_order', 'desc');

  try {
    console.log(`🔍 Fetching articles updated since ${cutoffISO} (last ${daysBack} days)...`);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Zendesk API error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const articles = data.articles || [];
    console.log(`✅ Found ${articles.length} recently edited articles`);

    return articles;
  } catch (err) {
    console.error(`Failed to fetch recently edited articles:`, err.message);
    throw err;
  }
}
