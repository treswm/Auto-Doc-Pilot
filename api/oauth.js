/**
 * Zendesk OAuth 2.0 Authorization Code Flow handler
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';

// ESM route modules load before server.js runs its dotenv setup. Load it here so
// the OAuth client configuration is available while this module initializes.
dotenv.config({ override: process.env.NODE_ENV !== 'production' });

const router = express.Router();
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || 'himarley';
const ZENDESK_CLIENT_ID = process.env.ZENDESK_CLIENT_ID;
const ZENDESK_CLIENT_SECRET = process.env.ZENDESK_CLIENT_SECRET;
// Zendesk public clients use PKCE and must not send a client secret. Set this
// to "confidential" only when the OAuth client is explicitly registered that way.
const ZENDESK_OAUTH_CLIENT_KIND = (process.env.ZENDESK_OAUTH_CLIENT_KIND || 'public').toLowerCase();
const REDIRECT_URI = process.env.ZENDESK_REDIRECT_URI || 'http://localhost:3001/api/oauth/callback';
const ZENDESK_OAUTH_SCOPES = process.env.ZENDESK_OAUTH_SCOPES || 'read,write';
const OAUTH_SCOPE_STRING = ZENDESK_OAUTH_SCOPES
  .split(',')
  .map((scope) => scope.trim())
  .filter(Boolean)
  .join(' ');

const AUTH_URL = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/oauth/authorizations/new`;
const TOKEN_URL = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/oauth/tokens`;

function readCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const prefix = `${name}=`;
  const cookie = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function saveAccessToken(accessToken) {
  const envPath = path.join(process.cwd(), '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const entry = `ZENDESK_OAUTH_ACCESS_TOKEN=${accessToken}`;
  const next = /^ZENDESK_OAUTH_ACCESS_TOKEN=.*$/m.test(existing)
    ? existing.replace(/^ZENDESK_OAUTH_ACCESS_TOKEN=.*$/m, entry)
    : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${entry}\n`;
  fs.writeFileSync(envPath, next, { mode: 0o600 });
  process.env.ZENDESK_OAUTH_ACCESS_TOKEN = accessToken;
}

/**
 * GET /api/oauth/authorize
 * Redirects user to Zendesk authorization page
 */
router.get('/authorize', (req, res) => {
  if (!ZENDESK_CLIENT_ID) {
    return res.status(500).json({ error: 'ZENDESK_CLIENT_ID not configured' });
  }
  if (!OAUTH_SCOPE_STRING) {
    return res.status(500).json({ error: 'ZENDESK_OAUTH_SCOPES not configured' });
  }
  if (!['public', 'confidential'].includes(ZENDESK_OAUTH_CLIENT_KIND)) {
    return res.status(500).json({ error: 'ZENDESK_OAUTH_CLIENT_KIND must be "public" or "confidential"' });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 10 * 60 * 1000,
    path: '/api/oauth',
  };
  res.cookie('zendesk_oauth_state', state, cookieOptions);
  res.cookie('zendesk_oauth_verifier', verifier, cookieOptions);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZENDESK_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPE_STRING,
    state,
  });
  if (ZENDESK_OAUTH_CLIENT_KIND === 'public') {
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  }

  const authUrl = `${AUTH_URL}?${params.toString()}`;
  console.log('🔐 Redirecting to Zendesk authorization...');
  res.redirect(authUrl);
});

/**
 * GET /api/oauth/callback
 * Handles OAuth callback from Zendesk
 */
router.get('/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('❌ OAuth error:', error);
    return res.status(400).json({ error: `Authorization failed: ${error}` });
  }

  if (!code) {
    return res.status(400).json({
      error: 'No authorization code received. Do not open the callback URL directly. Start at /api/oauth/authorize so Zendesk can create and return an authorization code.',
    });
  }

  const expectedState = readCookie(req, 'zendesk_oauth_state');
  const verifier = readCookie(req, 'zendesk_oauth_verifier');
  if (!expectedState || !state || expectedState.length !== String(state).length
    || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(String(state)))) {
    return res.status(400).json({ error: 'Authorization session expired or did not match. Start authorization again from the app.' });
  }
  if (!verifier) {
    return res.status(400).json({ error: 'Authorization session expired. Start authorization again from the app.' });
  }

  try {
    if (ZENDESK_OAUTH_CLIENT_KIND === 'confidential' && !ZENDESK_CLIENT_SECRET) {
      throw new Error('ZENDESK_CLIENT_SECRET not configured');
    }

    console.log('🔄 Exchanging authorization code for access token...');

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: ZENDESK_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: OAUTH_SCOPE_STRING,
    });
    if (ZENDESK_OAUTH_CLIENT_KIND === 'public') {
      tokenParams.set('code_verifier', verifier);
    } else {
      tokenParams.set('client_secret', ZENDESK_CLIENT_SECRET);
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      throw new Error(`Token exchange failed: ${errorBody}`);
    }

    const tokenData = await tokenRes.json();

    const tokenObj = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      obtained_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
    };

    saveAccessToken(tokenObj.access_token);
    res.clearCookie('zendesk_oauth_state', { path: '/api/oauth' });
    res.clearCookie('zendesk_oauth_verifier', { path: '/api/oauth' });
    console.log('✅ OAuth token obtained');

    res.json({ 
      success: true, 
      message: 'Authorization successful. The Zendesk access token was saved locally and is active now.',
      expires_at: tokenObj.expires_at,
    });
  } catch (err) {
    console.error('❌ Token exchange error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/oauth/token
 * Returns current valid token (refreshes if needed)
 */
router.get('/token', async (req, res) => {
  try {
    const token = await getValidToken();
    res.json({ access_token: token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * Get the configured access token from .env
 * @returns {Promise<string>} Valid access token
 */
export async function getValidToken() {
  if (process.env.ZENDESK_OAUTH_ACCESS_TOKEN) {
    console.log('✓ Using token from .env');
    return process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
  }

  throw new Error(
    'No Zendesk OAuth token configured. Set ZENDESK_OAUTH_ACCESS_TOKEN in .env or use /api/oauth/authorize to generate one.'
  );
}

export default router;
