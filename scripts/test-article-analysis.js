/**
 * Test: per-article analysis produces unique, accurate results
 * Run: node scripts/test-article-analysis.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);

const SUBDOMAIN = env.ZENDESK_SUBDOMAIN || 'himarley';
const TOKEN = env.ZENDESK_OAUTH_ACCESS_TOKEN;
const OPENAI_KEY = env.OPENAI_API_KEY;

// Minimal Address Case release notes (from 2.85)
const RELEASE_NOTES = `Address Case Now Generally Available (GA)
Hi Marley's Address Case feature is now generally available. Inbox badges now indicate 
cases needing a reply instead of unread messages. New notification options: Snooze, 
Dismiss for Myself, and No Response Needed.`;

// Test articles: one should be RELEVANT, one should be FILTERED OUT
const TEST_ARTICLES = [
  { id: '34179779310611', expected: 'alreadyCovered: true', desc: 'Query Contacts (API doc — should be filtered)' },
  { id: '45620049371923', expected: 'alreadyCovered: true', desc: 'Help Contacts Find Your Texts on iPhone (mobile guide — should be filtered)' },
];

async function analyzeArticle(articleId, title, content) {
  const { htmlToText } = await import('../lib/article-processor.js');
  const articleText = htmlToText(content).slice(0, 8000);

  const systemPrompt = `You are a Help Center content writer for Hi Marley.

HI MARLEY ARTICLE CATEGORY RULES:
- If the release feature is an OPERATOR/ADJUSTER UI change (inbox, cases, messaging, notifications, filters) and the article is about a DIFFERENT category (API docs, webhooks, integrations like ClaimCenter/Mitchell/Salesforce, developer guides), return alreadyCovered: true.
- If the release feature is an INTEGRATION change and this article is NOT about that specific integration, return alreadyCovered: true.
- Only mark alreadyCovered: false when the release directly changes something this specific article documents.

Return ONLY valid JSON: { "alreadyCovered": true/false, "specificImpact": "...", "affectedSections": "..." }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Release Notes:\n${RELEASE_NOTES}\n\n---\n\nArticle: "${title}"\n\nContent:\n${articleText}` }
      ],
      temperature: 0.3,
      max_tokens: 300
    })
  });
  const data = await response.json();
  let text = data.choices?.[0]?.message?.content?.trim() || '{}';
  text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

console.log('🔬 Testing per-article analysis...\n');

for (const test of TEST_ARTICLES) {
  console.log(`Testing: ${test.desc}`);
  try {
    const artResp = await fetch(
      `https://${SUBDOMAIN}.zendesk.com/api/v2/help_center/articles/${test.id}.json`,
      { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } }
    );
    const artData = await artResp.json();
    const article = artData.article;
    if (!article) { console.log('  ❌ Could not fetch article\n'); continue; }

    const result = await analyzeArticle(article.id, article.title, article.body || '');
    const passed = result.alreadyCovered === true;
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Got:      alreadyCovered: ${result.alreadyCovered}`);
    console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) console.log(`  specificImpact: ${result.specificImpact}`);
    console.log();
  } catch (err) {
    console.log(`  ❌ ERROR: ${err.message}\n`);
  }
}

console.log('Also testing section→category pre-filter:');
const secResp = await fetch(
  `https://${SUBDOMAIN}.zendesk.com/api/v2/help_center/sections.json?per_page=100`,
  { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } }
);
const secData = await secResp.json();
const sectionMap = new Map((secData.sections || []).map(s => [s.id, s.category_id]));

const INTEGRATION_CATEGORY_IDS = new Set([1500000150122, 22402349691923]);
for (const test of TEST_ARTICLES) {
  const artResp = await fetch(
    `https://${SUBDOMAIN}.zendesk.com/api/v2/help_center/articles/${test.id}.json`,
    { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } }
  );
  const artData = await artResp.json();
  const art = artData.article;
  if (!art) continue;
  const catId = sectionMap.get(art.section_id);
  const wouldFilter = INTEGRATION_CATEGORY_IDS.has(catId);
  console.log(`  "${art.title}"`);
  console.log(`    section_id: ${art.section_id}, category_id: ${catId}`);
  console.log(`    Pre-filtered by section: ${wouldFilter ? '✅ YES (correct)' : '❌ NO'}`);
}
