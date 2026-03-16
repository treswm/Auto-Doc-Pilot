#!/usr/bin/env node

/**
 * Inspect the Zendesk OAuth access token configured in .env.
 */

import 'dotenv/config';
const token = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
const scopes = process.env.ZENDESK_OAUTH_SCOPES || 'read,write';

console.log('🔍 Inspecting OAuth token...\n');

try {
  if (!token) {
    console.error('❌ ZENDESK_OAUTH_ACCESS_TOKEN is not set in .env');
    process.exit(1);
  }

  console.log('📋 Token Details:');
  console.log('  Access Token:', `${token.substring(0, 20)}...`);
  console.log('  Scopes from .env:', scopes);
} catch (err) {
  console.error('❌ Error inspecting token:', err.message);
  process.exit(1);
}
