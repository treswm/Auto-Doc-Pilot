/**
 * Zendesk OAuth 2.0 Authorization Code Flow handler
 */

import express from 'express';

const router = express.Router();
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || 'himarley';
const ZENDESK_CLIENT_ID = process.env.ZENDESK_CLIENT_ID;
const ZENDESK_CLIENT_SECRET = process.env.ZENDESK_CLIENT_SECRET;
const ZENDESK_OAUTH_ACCESS_TOKEN = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
const REDIRECT_URI = process.env.ZENDESK_REDIRECT_URI || 'http://localhost:3001/api/oauth/callback';
const ZENDESK_OAUTH_SCOPES = process.env.ZENDESK_OAUTH_SCOPES || 'read,write';
const OAUTH_SCOPE_STRING = ZENDESK_OAUTH_SCOPES
  .split(',')
  .map((scope) => scope.trim())
  .filter(Boolean)
  .join(' ');

const AUTH_URL = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/oauth/authorizations/new`;
const TOKEN_URL = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/oauth/tokens`;

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

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZENDESK_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPE_STRING,
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;
  console.log('🔐 Redirecting to Zendesk authorization...');
  res.redirect(authUrl);
});

/**
 * GET /api/oauth/callback
 * Handles OAuth callback from Zendesk
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('❌ OAuth error:', error);
    return res.status(400).json({ error: `Authorization failed: ${error}` });
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  try {
    if (!ZENDESK_CLIENT_SECRET) {
      throw new Error('ZENDESK_CLIENT_SECRET not configured');
    }

    console.log('🔄 Exchanging authorization code for access token...');

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: ZENDESK_CLIENT_ID,
        client_secret: ZENDESK_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        scope: OAUTH_SCOPE_STRING,
      }).toString(),
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

    console.log('✅ OAuth token obtained');

    res.json({ 
      success: true, 
      message: 'Authorization successful. Copy token.access_token into ZENDESK_OAUTH_ACCESS_TOKEN in .env.',
      token: tokenObj 
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
  if (ZENDESK_OAUTH_ACCESS_TOKEN) {
    console.log('✓ Using token from .env');
    return ZENDESK_OAUTH_ACCESS_TOKEN;
  }

  throw new Error(
    'No Zendesk OAuth token configured. Set ZENDESK_OAUTH_ACCESS_TOKEN in .env or use /api/oauth/authorize to generate one.'
  );
}

export default router;
