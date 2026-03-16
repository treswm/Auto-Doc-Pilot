import "dotenv/config";

const {
  ZENDESK_SUBDOMAIN,
  ZENDESK_EMAIL,
  ZENDESK_API_TOKEN,
  ZENDESK_OAUTH_CLIENT_ID,
  ZENDESK_OAUTH_SCOPES = "read,write",
} = process.env;

const OAUTH_CLIENT_NUMERIC_ID = Number(ZENDESK_OAUTH_CLIENT_ID);
const REQUESTED_SCOPES = ZENDESK_OAUTH_SCOPES
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
const base = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

function authHeader() {
  const token = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json"
  };
}

async function main() {
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN || !OAUTH_CLIENT_NUMERIC_ID) {
    console.error("❌ Missing Zendesk admin auth env vars. Check .env");
    console.error("Required: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN, ZENDESK_OAUTH_CLIENT_ID");
    process.exit(1);
  }
  if (REQUESTED_SCOPES.length === 0) {
    console.error("❌ No OAuth scopes requested. Set ZENDESK_OAUTH_SCOPES in .env");
    process.exit(1);
  }

  console.log("🔐 Creating Zendesk OAuth access token via admin API...\n");
  console.log("Subdomain:", ZENDESK_SUBDOMAIN);
  console.log("Email:", ZENDESK_EMAIL);
  console.log("OAuth client numeric ID:", OAUTH_CLIENT_NUMERIC_ID);
  console.log("Requested scopes:", REQUESTED_SCOPES.join(", "));

  const payload = {
    token: {
      client_id: OAUTH_CLIENT_NUMERIC_ID,
      scopes: REQUESTED_SCOPES,
    }
  };

  const res = await fetch(`${base}/oauth/tokens.json`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("❌ Failed:", res.status, res.statusText);
    console.error(text);
    process.exit(1);
  }

  const data = JSON.parse(text);
  const accessToken = data.token.full_token || data.token.token;
  
  console.log("\n✅ OAuth token created successfully!");
  console.log("Granted scopes:", (data.token.scopes || []).join(", "));
  console.log("\n📝 Add this to your .env:");
  console.log(`ZENDESK_OAUTH_ACCESS_TOKEN=${accessToken}`);
  console.log("\nNote: ZENDESK_OAUTH_CLIENT_ID is the numeric client ID, not the OAuth identifier or secret.");
}

main();
