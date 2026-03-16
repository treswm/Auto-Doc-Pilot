import "dotenv/config";
import fs from "fs";

const { ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN, SOURCE_LOCALE = "en-us" } = process.env;

if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
  console.error("❌ Missing Zendesk env vars. Check .env");
  process.exit(1);
}

const baseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

function authHeader() {
  const token = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function zendeskGet(urlPathOrFullUrl) {
  const url = urlPathOrFullUrl.startsWith("http") ? urlPathOrFullUrl : `${baseUrl}${urlPathOrFullUrl}`;
  const res = await fetch(url, {
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET failed: ${res.status} ${res.statusText}\n${text}`);
  }

  return res.json();
}

async function main() {
  console.log("Fetching all sections...");

  // Locale-specific sections endpoint (keeps names aligned with your source locale)
  let nextPage = `/help_center/${SOURCE_LOCALE}/sections.json?page[size]=100`;
  const all = [];

  while (nextPage) {
    const data = await zendeskGet(nextPage);
    const sections = data.sections || [];

    for (const s of sections) {
      all.push({
        id: s.id,
        name: s.name,
        category_id: s.category_id,
        html_url: s.html_url,
      });
    }

    nextPage = data.next_page ? data.next_page.replace(baseUrl, "") : null;
  }

  // A simple "plan" file you can use directly
  const plan = {
    target_locale: process.env.TARGET_LOCALE || "fr-ca",
    source_locale: SOURCE_LOCALE,
    sections: all.map((s) => ({ id: s.id, name: s.name })),
  };

  fs.writeFileSync("sections_plan.json", JSON.stringify(plan, null, 2));
  fs.writeFileSync("sections_full.json", JSON.stringify({ sections: all }, null, 2));

  console.log(`✅ Wrote sections_plan.json (${plan.sections.length} sections)`);
  console.log(`✅ Wrote sections_full.json (includes category_id + html_url)`);
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});