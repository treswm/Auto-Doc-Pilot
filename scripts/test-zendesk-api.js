#!/usr/bin/env node

/**
 * Test Zendesk API connectivity with the direct OAuth token in .env
 */

import 'dotenv/config';

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || 'himarley';
const ZENDESK_OAUTH_ACCESS_TOKEN = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
const SOURCE_LOCALE = process.env.SOURCE_LOCALE || 'en-us';
const API_BASE = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

async function testAPI() {
  console.log('🧪 Testing Zendesk API access...\n');

  try {
    if (!ZENDESK_OAUTH_ACCESS_TOKEN) {
      console.error('❌ ZENDESK_OAUTH_ACCESS_TOKEN is missing from .env');
      process.exit(1);
    }

    console.log('Test 1: Check API health');
    const healthRes = await fetch(`${API_BASE}/help_center/${SOURCE_LOCALE}/sections.json?page[size]=1`, {
      headers: { 'Authorization': `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}` },
    });
    console.log(`  Status: ${healthRes.status}`);
    if (healthRes.ok) {
      const data = await healthRes.json();
      console.log(`  ✓ Sections endpoint accessible, sections returned: ${data.sections?.length || 0}`);
    } else {
      console.log(`  ✗ Error: ${await healthRes.text()}`);
    }

    console.log(`\nTest 2: List sections for locale ${SOURCE_LOCALE}`);
    const sectionsRes = await fetch(`${API_BASE}/help_center/${SOURCE_LOCALE}/sections.json?page[size]=5`, {
      headers: { 'Authorization': `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}` },
    });
    console.log(`  Status: ${sectionsRes.status}`);
    if (sectionsRes.ok) {
      const data = await sectionsRes.json();
      console.log(`  ✓ Found ${data.sections?.length || 0} section(s)`);
      data.sections?.forEach(section => {
        console.log(`    - ${section.name} (ID: ${section.id})`);
      });
    } else {
      console.log(`  ✗ Error: ${await sectionsRes.text()}`);
    }

    console.log('\nTest 3: Fetch one section by ID from the list response');
    const firstSectionRes = await fetch(
      `${API_BASE}/help_center/${SOURCE_LOCALE}/sections.json?page[size]=1`,
      { headers: { 'Authorization': `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}` } },
    );
    console.log(`  Status: ${firstSectionRes.status}`);
    if (firstSectionRes.ok) {
      const data = await firstSectionRes.json();
      const firstSection = data.sections?.[0];
      console.log(`  ✓ First section: ${firstSection?.name || 'N/A'} (${firstSection?.id || 'N/A'})`);
    } else {
      const errorText = await firstSectionRes.text();
      console.log(`  ✗ Error: ${errorText.substring(0, 200)}`);
    }

    console.log('\n💡 Troubleshooting tips:');
    console.log('  1. Verify ZENDESK_OAUTH_ACCESS_TOKEN was generated with read,write scopes');
    console.log('  2. Confirm ZENDESK_SUBDOMAIN points at the intended Zendesk instance');
    console.log('  3. Ensure the Help Center is enabled for the target locale');
    console.log('  4. Re-run node scripts/create-oauth-token.js if the token was revoked');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

testAPI();
