# Zendesk OAuth Token Setup

## Current State ✅
Your OAuth token is already configured and working:
- `ZENDESK_OAUTH_ACCESS_TOKEN` is set in `.env`
- All API calls use this token for authentication
- The legacy API token (`ZENDESK_API_TOKEN`) has been removed for security

## If You Need to Regenerate the OAuth Token

If your OAuth token expires or becomes invalid, follow these steps:

### Step 1: Create a New Zendesk API Token
1. Go to Zendesk Admin → **Apps and integrations** → **Zendesk API**
2. Click **Add API token**
3. Enter description: "Help Center Translation Dashboard - OAuth Token Generator"
4. Copy the token (you'll only see it once!)
5. Save it temporarily in a secure location

### Step 2: Generate New OAuth Token
1. Create/update a temporary `.env.temp` file with:
   ```
   ZENDESK_SUBDOMAIN=himarley-staging
   ZENDESK_EMAIL=tres.moore@himarley.com
   ZENDESK_API_TOKEN=[paste the API token from Step 1]
   ZENDESK_OAUTH_CLIENT_ID=49924314625811
   ```

2. Run the OAuth token generator:
   ```bash
   node scripts/create-oauth-token.js
   ```

3. The script will output:
   ```
   ZENDESK_OAUTH_ACCESS_TOKEN=dfcd69e3c214bdf850c1bc5f025dc0cdd8d9e6208df0950c8b7d4cd21bc2e683
   ```

### Step 3: Update Your .env
1. Copy the new `ZENDESK_OAUTH_ACCESS_TOKEN` value
2. Update `.env` with the new token
3. Delete the temporary `.env.temp` file
4. Test the connection: `node scripts/test-zendesk-api.js`

### Step 4: Revoke Old API Token (Security)
1. Go back to Zendesk Admin → **Apps and integrations** → **Zendesk API**
2. Find and revoke the old API token from Step 1
3. Keep your `.env` file (do NOT commit it to git)

## Important Security Notes

⚠️ **NEVER commit the following to git:**
- `ZENDESK_OAUTH_ACCESS_TOKEN`
- `ZENDESK_API_TOKEN` (if created temporarily)
- Any other credentials in `.env`

✅ **Verify `.gitignore` includes:**
```
.env
.env.local
```

## Troubleshooting

**"OAuth token invalid" error:**
- Regenerate using steps above

**"Missing ZENDESK_OAUTH_ACCESS_TOKEN":**
- Ensure the token is in your `.env` file
- Check that you haven't accidentally deleted it

**"401 Unauthorized":**
- Verify the OAuth token has `read,write` scopes
- Check that the token hasn't expired (regenerate if needed)
