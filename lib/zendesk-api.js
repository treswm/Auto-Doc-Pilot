/**
 * Zendesk Help Center API wrapper
 * Uses scoped OAuth tokens created via create-oauth-token.js
 */

import 'dotenv/config';

function getApiBase() {
  const subdomain = process.env.ZENDESK_SUBDOMAIN || 'himarley';
  return `https://${subdomain}.zendesk.com/api/v2`;
}

// Production brand ID — ensures all searches return Hi Marley production articles,
// not staging articles (brand 49194539612563 = Hi Marley Staging).
const PRODUCTION_BRAND_ID = process.env.ZENDESK_PRODUCTION_BRAND_ID || '360001112753';

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
  const url = new URL(`${getApiBase()}/help_center/articles.json`);
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
  const url = new URL(`${getApiBase()}/help_center/articles.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('per_page', limit);
  url.searchParams.append('sort_by', 'updated_at');
  url.searchParams.append('sort_order', 'desc');
  url.searchParams.append('source_brand_id', PRODUCTION_BRAND_ID);

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
    console.log("url", url.toString());
    console.log("err", err);
    console.error(`Failed to fetch recently edited articles:`, err.message);
    throw err;
  }
}

/**
 * Fetch outdated articles from Help Center
 * @param {number} daysSinceUpdate - Articles not updated in N+ days (default: 90)
 * @param {string} locale - Language locale (default: 'en-us')
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Object[]>} Array of outdated article objects
 */
export async function fetchOutdatedArticles(daysSinceUpdate = 30, locale = 'en-us', limit = 50) {
  const token = getAccessToken();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceUpdate);
  const cutoffISO = cutoffDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  // Use Zendesk search syntax to find articles NOT updated since cutoff date
  const query = `updated_at:<${cutoffISO}`;
  const url = new URL(`${getApiBase()}/help_center/articles.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('per_page', limit);
  url.searchParams.append('sort_by', 'updated_at');
  url.searchParams.append('sort_order', 'asc');
  url.searchParams.append('source_brand_id', PRODUCTION_BRAND_ID);

  try {
    console.log(`🔍 Fetching articles not updated since ${cutoffISO} (${daysSinceUpdate}+ days)...`);

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
    console.log(`✅ Found ${articles.length} outdated articles`);

    return articles;
  } catch (err) {
    console.error(`Failed to fetch outdated articles:`, err.message);
    throw err;
  }
}

/**
 * Fetch articles related to product release keywords
 * @param {string[]} releaseKeywords - Array of keywords to search for (e.g., ['AI', 'Mobile'])
 * @param {string} locale - Language locale (default: 'en-us')
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Object[]>} Array of articles matching release keywords
 */
export async function fetchProductReleaseArticles(releaseKeywords = [], locale = 'en-us', limit = 50) {
  const token = getAccessToken();

  // If no keywords provided, return empty array
  if (!Array.isArray(releaseKeywords) || releaseKeywords.length === 0) {
    console.log('⚠️  No release keywords provided, returning empty results');
    return [];
  }

  // Join keywords with spaces for Zendesk search
  const query = releaseKeywords.join(' ');
  const url = new URL(`${getApiBase()}/help_center/articles/search.json`);
  url.searchParams.append('query', query);
  url.searchParams.append('per_page', limit);
  url.searchParams.append('source_brand_id', PRODUCTION_BRAND_ID);

  try {
    console.log(`🔍 Searching articles for release keywords: [${releaseKeywords.join(', ')}]...`);

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
    const articles = data.results || [];
    console.log(`✅ Found ${articles.length} articles related to product release`);

    return articles;
  } catch (err) {
    console.error(`Failed to fetch product release articles:`, err.message);
    throw err;
  }
}

/**
 * Fetch all articles from a specific Help Center section
 * @param {string|number} sectionId - The Help Center section ID
 * @param {string} locale - Language locale (default: 'en-us')
 * @param {number} limit - Max results per page (default: 100)
 * @returns {Promise<Object[]>} Array of all article objects in the section
 */
export async function fetchArticlesBySection(sectionId, locale = 'en-us', limit = 100) {
  const token = getAccessToken();

  if (!sectionId) {
    throw new Error('sectionId is required');
  }

  const allArticles = [];
  let page = 1;
  let hasMore = true;

  try {
    console.log(`🔍 Fetching all articles from section ${sectionId}...`);

    while (hasMore) {
      const url = new URL(`${getApiBase()}/help_center/${locale}/sections/${sectionId}/articles.json`);
      url.searchParams.append('page[size]', limit);
      url.searchParams.append('page[number]', page);

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

      if (articles.length === 0) {
        hasMore = false;
      } else {
        allArticles.push(...articles);
        // Check if there's a next page
        if (data.links && data.links.next) {
          page++;
        } else {
          hasMore = false;
        }
      }
    }

    console.log(`✅ Found ${allArticles.length} articles in section ${sectionId}`);
    return allArticles;
  } catch (err) {
    console.error(`Failed to fetch articles from section ${sectionId}:`, err.message);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// WRITE helpers — create draft articles + upload inline screenshots
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all Help Center sections (id + name + category_id).
 * Used to populate the target-section dropdown.
 * @param {string} locale
 * @returns {Promise<Array<{id:number,name:string,category_id:number}>>}
 */
export async function fetchSections(locale = 'en-us') {
  const token = getAccessToken();
  const sections = [];
  let url = `${getApiBase()}/help_center/${locale}/sections.json?per_page=100`;

  while (url) {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Zendesk API error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    for (const s of data.sections || []) {
      sections.push({ id: s.id, name: s.name, category_id: s.category_id });
    }
    url = data.next_page || null;
  }
  return sections;
}

/**
 * Resolve a Help Center permission group id. Article creation requires one.
 * Prefers ZENDESK_PERMISSION_GROUP_ID; otherwise uses the first available group.
 * @returns {Promise<number|null>}
 */
export async function getDefaultPermissionGroupId() {
  if (process.env.ZENDESK_PERMISSION_GROUP_ID) {
    return Number(process.env.ZENDESK_PERMISSION_GROUP_ID);
  }
  const token = getAccessToken();
  const url = `${getApiBase()}/guide/permission_groups.json`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.warn(`Could not fetch permission groups (${res.status}); article create may fail.`);
    return null;
  }
  const data = await res.json();
  const groups = data.permission_groups || [];
  // Prefer a group that can edit (most Guide setups have a "Managers"/"Agents" group)
  const editable = groups.find((g) => g.edit && g.edit.length) || groups[0];
  return editable ? editable.id : null;
}

/**
 * Create a Help Center article (draft by default) in a section.
 * @param {Object} args
 * @param {string|number} args.sectionId
 * @param {string} args.title
 * @param {string} [args.body=''] - HTML body
 * @param {string} [args.locale='en-us']
 * @param {boolean} [args.draft=true]
 * @param {number} [args.permissionGroupId] - resolved automatically if omitted
 * @returns {Promise<Object>} created article { id, html_url, ... }
 */
export async function createArticle({
  sectionId,
  title,
  body = '',
  locale = 'en-us',
  draft = true,
  permissionGroupId,
}) {
  const token = getAccessToken();
  if (!sectionId) throw new Error('sectionId is required to create an article');
  if (!title) throw new Error('title is required to create an article');

  const permId = permissionGroupId ?? (await getDefaultPermissionGroupId());

  const url = `${getApiBase()}/help_center/${locale}/sections/${sectionId}/articles.json`;
  const payload = {
    article: {
      title,
      body,
      locale,
      draft,
      ...(permId ? { permission_group_id: permId } : {}),
      user_segment_id: null, // visible to everyone (irrelevant while draft)
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create article (${res.status}): ${text}`);
  }
  const data = await res.json();
  console.log(`📝 Created draft article ${data.article?.id} — "${title}"`);
  return data.article;
}

/**
 * Upload an inline image attachment to an article and return its hosted URL.
 * The returned content_url is what you put in <img src="..."> in the body.
 * @param {string|number} articleId
 * @param {Buffer} buffer - PNG/JPEG bytes
 * @param {string} filename
 * @returns {Promise<{id:number, content_url:string}>}
 */
export async function uploadInlineArticleImage(articleId, buffer, filename) {
  const token = getAccessToken();
  const url = `${getApiBase()}/help_center/articles/${articleId}/attachments.json`;

  const form = new FormData();
  form.append('inline', 'true');
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }, // let fetch set multipart boundary
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to upload inline image (${res.status}): ${text}`);
  }
  const data = await res.json();
  const att = data.article_attachment;
  return { id: att.id, content_url: att.content_url };
}

/**
 * Update an article's translation body (HTML).
 * @param {string|number} articleId
 * @param {string} body - HTML body
 * @param {string} [locale='en-us']
 * @returns {Promise<Object>} updated translation
 */
export async function updateArticleBody(articleId, body, locale = 'en-us') {
  const token = getAccessToken();
  const url = `${getApiBase()}/help_center/articles/${articleId}/translations/${locale}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ translation: { body } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update article body (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.translation;
}
