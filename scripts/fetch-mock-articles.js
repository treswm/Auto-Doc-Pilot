#!/usr/bin/env node

/**
 * Fetch articles from Zendesk and populate mock approval_state.json
 * Usage: node scripts/fetch-mock-articles.js 49416433003923
 */

import 'dotenv/config';
import fs from 'fs';
import { fetchArticles } from '../lib/zendesk-api.js';

const articleIds = process.argv.slice(2);

if (articleIds.length === 0) {
  console.error('Usage: node scripts/fetch-mock-articles.js <articleId> [<articleId2> ...]');
  console.error('Example: node scripts/fetch-mock-articles.js 49416433003923');
  process.exit(1);
}

async function main() {
  console.log(`📡 Fetching ${articleIds.length} article(s) from Zendesk...`);

  try {
    const articles = await fetchArticles(articleIds);

    if (articles.length === 0) {
      console.error('❌ No articles fetched. Check your ZENDESK_OAUTH_ACCESS_TOKEN and article IDs.');
      process.exit(1);
    }

    console.log(`✅ Fetched ${articles.length} article(s)\n`);

    // Build mock approval state with fetched articles
    const mockApprovalState = {
      timestamp: new Date().toISOString(),
      runId: `run_${Date.now()}`,
      status: 'pending_approval',
      pending_approval: {
        articles: articles.map(article => ({
          id: article.id,
          title: article.title,
          body: article.body,
          updated_at: article.updated_at,
          created_at: article.created_at,
          draft: article.draft,
          locale: article.locale || 'en-us',
        })),
      },
      approvalsReceived: [],
      history: [],
    };

    const approvalStatePath = 'config/approval_state.json';
    fs.writeFileSync(approvalStatePath, JSON.stringify(mockApprovalState, null, 2));

    console.log(`💾 Saved ${articles.length} article(s) to ${approvalStatePath}`);
    console.log(`\n📋 Article details:`);
    articles.forEach(article => {
      const allMedia = article.body ? (article.body.match(/<img[^>]+>/gi) || []).concat(article.body.match(/<iframe[^>]+>/gi) || []) : [];
      const imageCount = (article.body?.match(/<img[^>]+src="[^"]*(?<!\.gif)"[^"]*>/gi) || []).length;
      const gifCount = (article.body?.match(/<img[^>]+src="[^"]*\.gif"[^"]*>/gi) || []).length;
      const videoCount = (article.body?.match(/<iframe[^>]*(youtube|vimeo|wistia)[^>]*>/gi) || []).length;
      console.log(`  • "${article.title}" (ID: ${article.id})`);
      console.log(`    Images: ${imageCount}`);
      console.log(`    GIFs: ${gifCount}`);
      console.log(`    Videos: ${videoCount}`);
      console.log(`    Updated: ${article.updated_at}`);
    });

    console.log(`\n✨ Done! Go to http://localhost:3000 → Translation tab → Screenshots to see the images.`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
