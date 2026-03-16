#!/usr/bin/env node

/**
 * Lists Zendesk OAuth clients so you can map:
 * - client.id -> ZENDESK_OAUTH_CLIENT_ID for admin-created access tokens
 * - client.identifier -> ZENDESK_CLIENT_ID for browser-based OAuth redirects
 */

import 'dotenv/config';

const {
  ZENDESK_SUBDOMAIN = 'himarley',
  ZENDESK_EMAIL,
  ZENDESK_API_TOKEN,
} = process.env;

const API_BASE = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

/**
 * Create Basic Auth header from email + API token
 */
function createBasicAuthHeader() {
  const credentials = `${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

async function main() {
  console.log('📋 Fetching OAuth clients from Zendesk...\n');

  if (!ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    console.error('❌ Missing ZENDESK_EMAIL or ZENDESK_API_TOKEN in .env');
    process.exit(1);
  }

  try {
    const res = await fetch(`${API_BASE}/oauth/clients.json`, {
      method: 'GET',
      headers: {
        'Authorization': createBasicAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const clients = data.clients || [];

    if (clients.length === 0) {
      console.log('No OAuth clients found.');
      process.exit(0);
    }

    console.log(`Found ${clients.length} OAuth client(s):\n`);
    clients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name}`);
      console.log(`   ID: ${client.id}`);
      console.log(`   Identifier: ${client.identifier || 'N/A'}`);
      console.log(`   Type: ${client.client_type || 'N/A'}`);
      console.log();
    });

    console.log('Use these env vars:');
    console.log('  ZENDESK_OAUTH_CLIENT_ID=<numeric ID>');
    console.log('  ZENDESK_CLIENT_ID=<identifier>');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
