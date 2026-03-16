import "dotenv/config";
import fs from "fs";

const { ZENDESK_SUBDOMAIN, ZENDESK_OAUTH_ACCESS_TOKEN } = process.env;

if (!ZENDESK_SUBDOMAIN || !ZENDESK_OAUTH_ACCESS_TOKEN) {
  console.error("❌ Missing ZENDESK_SUBDOMAIN or ZENDESK_OAUTH_ACCESS_TOKEN in .env");
  process.exit(1);
}

const zendeskBaseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

async function safeFetch(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error(`\n❌ Network fetch failed during: ${label}`);
    console.error(`URL: ${url}`);
    console.error(`Message: ${err.message}`);
    throw err;
  }
}

function zendeskAuthHeader() {
  return {
    Authorization: `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}`,
  };
}

async function fetchAllSections() {
  const allSections = [];
  let nextPageUrl = `${zendeskBaseUrl}/help_center/en-us/sections.json?page[size]=100`;

  while (nextPageUrl) {
    console.log(`Fetching sections page...`);

    const res = await safeFetch(nextPageUrl, {
      headers: {
        ...zendeskAuthHeader(),
        "Content-Type": "application/json",
      },
    }, `Fetch sections`);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zendesk API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    allSections.push(...(data.sections || []));

    // Check for next page
    const links = data.links || {};
    nextPageUrl = links.next || null;
  }

  return allSections;
}

async function main() {
  console.log("🔄 Syncing sections from Zendesk Help Center...\n");

  // Load existing sections_plan.json to preserve locale settings
  const sectionsplanPath = "sections_plan.json";
  let existingPlan = {
    target_locale: "fr-ca",
    source_locale: "en-us",
    sections: [],
  };

  if (fs.existsSync(sectionsplanPath)) {
    try {
      existingPlan = JSON.parse(fs.readFileSync(sectionsplanPath, "utf-8"));
      console.log(`✅ Loaded existing sections_plan.json (${existingPlan.sections?.length || 0} sections)`);
    } catch (err) {
      console.error("⚠️  Could not parse existing sections_plan.json, will create new");
    }
  }

  // Fetch all sections from Zendesk
  const allSections = await fetchAllSections();
  console.log(`✅ Fetched ${allSections.length} sections from Zendesk\n`);

  // Transform to our format (just id and name)
  const syncedSections = allSections.map((section) => ({
    id: section.id,
    name: section.name,
  }));

  // Create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupPath = `sections_plan_backup_${timestamp}.json`;
  if (fs.existsSync(sectionsplanPath)) {
    fs.copyFileSync(sectionsplanPath, backupPath);
    console.log(`📦 Backup created: ${backupPath}`);
  }

  // Update and write
  const updatedPlan = {
    target_locale: existingPlan.target_locale,
    source_locale: existingPlan.source_locale,
    sections: syncedSections,
  };

  fs.writeFileSync(
    sectionsplanPath,
    JSON.stringify(updatedPlan, null, 2)
  );

  console.log(`✅ Updated ${sectionsplanPath} with ${syncedSections.length} sections`);
  console.log(`\n📊 Summary:`);
  console.log(`   - Total sections: ${syncedSections.length}`);
  console.log(`   - Locales: ${existingPlan.source_locale} → ${existingPlan.target_locale}`);
}

main().catch((err) => {
  console.error("❌ Sync failed:", err.message);
  process.exit(1);
});
