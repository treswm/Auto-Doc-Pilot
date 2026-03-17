import "dotenv/config";
import fs from "fs";
import path from "path";

const {
  // Zendesk
  ZENDESK_SUBDOMAIN,
  ZENDESK_OAUTH_ACCESS_TOKEN,
  SOURCE_LOCALE = "en-us",
  TARGET_LOCALE = "fr-ca",

  // OpenAI
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",

  // Controls
  THROTTLE_MS = "1500",
  OPENAI_INPUT_PER_M = "",
  OPENAI_OUTPUT_PER_M = "",
} = process.env;

// Load glossary for consistent terminology
if (!fs.existsSync("glossary.json")) {
  console.error("❌ glossary.json not found. This file is required for translation.");
  process.exit(1);
}
const glossaryRaw = fs.readFileSync("glossary.json", "utf-8");
const glossaryData = JSON.parse(glossaryRaw);
const glossaryTerms = glossaryData.glossary || [];


if (!ZENDESK_SUBDOMAIN || !ZENDESK_OAUTH_ACCESS_TOKEN) {
  console.error("❌ Missing Zendesk OAuth env vars. Check .env");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const zendeskBaseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
const MAX_ARTICLE_BODY_LENGTH = 25000;
const MANUAL_REVIEW_PATH = path.join("output", "manual_review_needed.csv");
const MANUAL_REVIEW_MASTER_PATH = path.join("output", "manual_review_master_list.csv");

// Status tracking directories
const STATUS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, ".focus-desk");

// Parse runId from command line arguments
let runId = null;
const runIdArg = process.argv.find(arg => arg.startsWith("--runId="));
if (runIdArg) {
  runId = runIdArg.split("=")[1];
  console.log(`📋 Translation run ID: ${runId}`);
}

// Debug logging to file
let debugLogFile = null;
function debugLog(message) {
  const msg = `[${new Date().toISOString()}] ${message}\n`;
  console.log(message);
  if (runId && !debugLogFile) {
    debugLogFile = path.join(process.env.HOME || process.env.USERPROFILE, ".focus-desk", `translation-run-${runId}.log`);
    ensureStatusDir();
  }
  if (debugLogFile) {
    try {
      fs.appendFileSync(debugLogFile, msg);
    } catch (e) {
      // Silently fail if we can't write to the log
    }
  }
}

/**
 * Ensure status directory exists
 */
function ensureStatusDir() {
  if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR, { recursive: true });
  }
}

/**
 * Write translation status to file
 */
function writeTranslationStatus(status, data = {}) {
  if (!runId) return; // Skip if no runId provided

  try {
    ensureStatusDir();
    const statusFile = path.join(STATUS_DIR, `translation-status-${runId}.json`);
    const statusData = {
      runId,
      status,
      articlesTranslated: data.articlesTranslated || 0,
      articlesFailed: data.articlesFailed || 0,
      totalArticles: data.totalArticles || 0,
      lastUpdate: new Date().toISOString(),
      errors: data.errors || [],
      ...data,
    };
    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
  } catch (err) {
    console.error(`Failed to write status file: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeFetch(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error(`\n❌ Network fetch failed during: ${label}`);
    console.error(`URL: ${url}`);
    console.error(`Message: ${err.message}`);
    if (err.cause) {
      console.error("Cause:", err.cause);
    }
    throw err;
  }
}

function buildGlossaryReference() {
  // Format glossary into a reference list for OpenAI
  const lines = [];
  for (const term of glossaryTerms) {
    lines.push(`- "${term.english}" → "${term.french}"`);
  }
  return lines.join("\n");
}


function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function zendeskAuthHeader() {
  return {
    Authorization: `Bearer ${process.env.ZENDESK_OAUTH_ACCESS_TOKEN}`,
  };
}

async function zendeskGet(urlPathOrFullUrl) {
  const url = urlPathOrFullUrl.startsWith("http")
    ? urlPathOrFullUrl
    : `${zendeskBaseUrl}${urlPathOrFullUrl}`;

  const res = await safeFetch(url, {
    headers: {
      ...zendeskAuthHeader(),
      "Content-Type": "application/json",
    },
  }, "Zendesk GET");

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zendesk GET failed: ${res.status} ${res.statusText}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function zendeskPost(pathUrl, payload) {
  const res = await safeFetch(`${zendeskBaseUrl}${pathUrl}`, {
    method: "POST",
    headers: {
      ...zendeskAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, `Zendesk POST ${pathUrl}`);

  const text = await res.text();
  if (!res.ok) {
    // translation exists can come back as 409/422; treat as "skip"
    if (res.status === 409 || res.status === 422) {
      return { status: "exists", details: text };
    }
    throw new Error(`Zendesk POST failed: ${res.status} ${res.statusText}\n${text}`);
  }
  return { status: "created", raw: text ? JSON.parse(text) : {} };
}

async function helpCenterTranslationExists(sourceType, objectId, locale) {
  const url = `${zendeskBaseUrl}/help_center/${sourceType}s/${objectId}/translations/${locale}.json`;

  const res = await safeFetch(url, {
    headers: {
      ...zendeskAuthHeader(),
      "Content-Type": "application/json",
    },
  }, `Zendesk translation existence check for ${sourceType} ${objectId}`);

  if (res.status === 404) return false;
  if (res.ok) return true;

  const text = await res.text();
  throw new Error(`Zendesk translation check failed for ${sourceType} ${objectId}: ${res.status} ${res.statusText}\n${text}`);
}

// Check if fr-ca translation already exists BEFORE calling OpenAI (saves money + preserves POC translations)
async function translationExists(articleId, locale) {
  return helpCenterTranslationExists("article", articleId, locale);
}

async function fetchHelpCenterItem(sourceType, objectId, locale) {
  const data = await zendeskGet(`/help_center/${locale}/${sourceType}s/${objectId}.json`);
  const item = data[sourceType];
  if (!item) {
    throw new Error(`Zendesk ${sourceType} ${objectId} response did not include ${sourceType} data`);
  }
  return item;
}

async function createHelpCenterTranslation(sourceType, objectId, payload) {
  return zendeskPost(`/help_center/${sourceType}s/${objectId}/translations.json`, payload);
}

async function ensureHelpCenterTranslation({
  sourceType,
  objectId,
  sourceLocale,
  targetLocale,
  sourceLabel,
  usageTotals,
}) {
  const exists = await helpCenterTranslationExists(sourceType, objectId, targetLocale);
  if (exists) {
    console.log(`Skipping ${sourceType} ${objectId} (${sourceLabel}) - ${targetLocale} translation already exists`);
    return { status: "skipped_existing" };
  }

  const item = await fetchHelpCenterItem(sourceType, objectId, sourceLocale);
  const title = item.name || item.title || sourceLabel;
  const bodyHtml = item.description || item.body || "";

  console.log(`Translating ${sourceType} ${objectId}: ${title}`);
  const { translated, usage } = await openaiTranslate({ title, bodyHtml });

  usageTotals.input_tokens += usage.input_tokens || 0;
  usageTotals.output_tokens += usage.output_tokens || 0;
  usageTotals.total_tokens += usage.total_tokens || 0;

  console.log(`Uploading ${sourceType} translation for ${objectId}`);
  const payload = {
    translation: {
      locale: targetLocale,
      title: translated.title,
      body: translated.body,
    },
  };

  const result = await createHelpCenterTranslation(sourceType, objectId, payload);
  console.log(`${sourceType} ${objectId} translation result: ${result.status}`);
  return { status: result.status };
}

async function fetchAllArticlesInSection(sectionId) {
  // Locale-specific section articles list
  let nextPage = `/help_center/${SOURCE_LOCALE}/sections/${sectionId}/articles.json?page[size]=100`;
  const all = [];

  while (nextPage) {
    const data = await zendeskGet(nextPage);
    const articles = data.articles || [];
    for (const a of articles) {
      if (a.draft) {
        continue;
      }
      all.push({
        id: a.id,
        title: a.title,
        body: a.body,
        draft: a.draft,
        html_url: a.html_url, // will be SOURCE_LOCALE url
      });
    }
    nextPage = data.next_page ? data.next_page.replace(zendeskBaseUrl, "") : null;
  }

  return all;
}

async function openaiTranslate({ title, bodyHtml }) {
  const jsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      body: { type: "string" },
    },
    required: ["title", "body"],
  };

const glossaryRef = buildGlossaryReference();

const instructions = `
Translate a Zendesk Help Center article from English to French Canadian (fr-ca).

IMPORTANT GLOSSARY - Use these exact translations for Hi Marley platform terms:
${glossaryRef}

Rules:
- Use the glossary translations above for all Hi Marley platform terms.
- For terms NOT in the glossary, use professional insurance industry French (fr-ca).
- Preserve ALL HTML tags, attributes, ids, href URLs, image src URLs, and placeholders exactly.
- Do NOT add or remove HTML elements; translate only human-readable text nodes.
- Do NOT translate product names like Hi Marley, Hi Marley Connect, Zendesk, or Guidewire.
- Keep abbreviations like FNOL, TTFC, TLA, SSO, OOO with their French equivalents from the glossary.
- Return JSON: { "title": "...", "body": "..." }.
`.trim();


  const input = [
    { role: "system", content: instructions },
    { role: "user", content: `TITLE:\n${title}\n\nBODY_HTML:\n${bodyHtml}` },
  ];

  const res = await safeFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "zendesk_translation",
          strict: true,
          schema: jsonSchema,
        },
      },
    }),
  }, `OpenAI translation for article title "${title}"`);

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status} ${res.statusText}\n${text}`);
  }

  const data = text ? JSON.parse(text) : {};

  // Extract structured JSON from output_text
  const chunks = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
    }
  }
  const joined = chunks.join("").trim();

  let parsed;
  try {
    parsed = JSON.parse(joined);
  } catch {
    throw new Error(`Could not parse OpenAI output as JSON.\nRaw:\n${joined.slice(0, 2000)}`);
  }

  const usage = data.usage || {};
  return { translated: parsed, usage };
}

function estimateCostUSD(usageTotals) {
  // Requires you to set per-1M prices in env
  const inRate = Number(OPENAI_INPUT_PER_M);
  const outRate = Number(OPENAI_OUTPUT_PER_M);
  if (!inRate || !outRate) return null;

  const inputTokens = usageTotals.input_tokens || 0;
  const outputTokens = usageTotals.output_tokens || 0;

  const cost =
    (inputTokens / 1_000_000) * inRate +
    (outputTokens / 1_000_000) * outRate;

  return cost;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function manualReviewKey(entry) {
  return `${entry.sectionId}::${entry.articleId || "section"}::${entry.action}`;
}

function writeManualReviewMasterList(masterEntries) {
  const header = "section_name,section_id,article_id,title_en,action,en_url,fr_url,failure_reason,timestamp";
  const lines = [header];

  for (const entry of masterEntries.values()) {
    lines.push([
      csvEscape(entry.sectionName),
      csvEscape(entry.sectionId),
      csvEscape(entry.articleId),
      csvEscape(entry.titleEn),
      csvEscape(entry.action),
      csvEscape(entry.enUrl),
      csvEscape(entry.frUrl),
      csvEscape(entry.failureReason),
      csvEscape(entry.timestamp),
    ].join(","));
  }

  fs.writeFileSync(MANUAL_REVIEW_MASTER_PATH, lines.join("\n"));
}

function loadManualReviewMasterList() {
  const entries = new Map();

  if (!fs.existsSync(MANUAL_REVIEW_PATH)) {
    return entries;
  }

  const lines = fs.readFileSync(MANUAL_REVIEW_PATH, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length <= 1) {
    return entries;
  }

  for (const line of lines.slice(1)) {
    const [
      sectionName = "",
      sectionId = "",
      articleId = "",
      titleEn = "",
      action = "",
      enUrl = "",
      frUrl = "",
      failureReason = "",
      timestamp = "",
    ] = parseCsvLine(line);

    const entry = {
      sectionName,
      sectionId,
      articleId,
      titleEn,
      action,
      enUrl,
      frUrl,
      failureReason,
      timestamp,
    };

    entries.set(manualReviewKey(entry), entry);
  }

  return entries;
}

function addManualReviewEntry(masterEntries, entry) {
  const normalized = {
    ...entry,
    sectionId: String(entry.sectionId ?? ""),
    articleId: String(entry.articleId ?? ""),
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  masterEntries.set(manualReviewKey(normalized), normalized);
  writeManualReviewMasterList(masterEntries);
}

function logManualReview({
  sectionName,
  sectionId,
  articleId,
  titleEn,
  action,
  enUrl,
  frUrl,
  failureReason,
  masterEntries,
}) {
  const reviewHeader = "section_name,section_id,article_id,title_en,action,en_url,fr_url,failure_reason,timestamp";
  const timestamp = new Date().toISOString();
  const reviewRow = [
    csvEscape(sectionName),
    csvEscape(sectionId),
    csvEscape(articleId),
    csvEscape(titleEn),
    csvEscape(action),
    csvEscape(enUrl),
    csvEscape(frUrl),
    csvEscape(failureReason),
    csvEscape(timestamp),
  ].join(",");

  if (!fs.existsSync(MANUAL_REVIEW_PATH)) {
    fs.writeFileSync(MANUAL_REVIEW_PATH, reviewHeader + "\n");
  }
  fs.appendFileSync(MANUAL_REVIEW_PATH, reviewRow + "\n");

  if (masterEntries) {
    addManualReviewEntry(masterEntries, {
      sectionName,
      sectionId,
      articleId,
      titleEn,
      action,
      enUrl,
      frUrl,
      failureReason,
      timestamp,
    });
  }

  console.error(`   Logged to ${MANUAL_REVIEW_PATH}`);
}

function classifyManualReviewAction(errorOrReason) {
  const failureReason = typeof errorOrReason === "string"
    ? errorOrReason
    : (errorOrReason?.message || String(errorOrReason));
  const causeCode = typeof errorOrReason === "object" && errorOrReason?.cause?.code
    ? String(errorOrReason.cause.code)
    : "";

  if (failureReason.startsWith("Could not parse OpenAI output as JSON")) {
    return "manual_review_parse_error";
  }
  if (failureReason.startsWith("Parent translation failed:")) {
    return "manual_review_parent_translation_failed";
  }
  if (
    causeCode.includes("TIMEOUT") ||
    failureReason.toLowerCase().includes("timeout")
  ) {
    return "manual_review_timeout";
  }
  return "manual_review_failed";
}

async function scanManualReviewCandidates({ sections, sectionMetaById, masterEntries }) {
  console.log("\n=== Manual Review Master Scan ===");

  for (const section of sections) {
    const sectionId = section.id;
    const sectionName = section.name;
    const sectionMeta = sectionMetaById.get(String(sectionId)) || {};

    let articles = [];
    try {
      articles = await fetchAllArticlesInSection(sectionId);
    } catch (err) {
      addManualReviewEntry(masterEntries, {
        sectionName,
        sectionId,
        articleId: "",
        titleEn: `[Section Scan] ${sectionName}`,
        action: "manual_review_scan_failed",
        enUrl: sectionMeta.html_url || `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${SOURCE_LOCALE}/sections/${sectionId}`,
        frUrl: (sectionMeta.html_url || `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${SOURCE_LOCALE}/sections/${sectionId}`)
          .replace(`/hc/${SOURCE_LOCALE}/`, `/hc/${TARGET_LOCALE}/`),
        failureReason: `Master scan failed: ${err.message || String(err)}`,
      });
      continue;
    }

    for (const article of articles) {
      if ((article.body || "").length <= MAX_ARTICLE_BODY_LENGTH) {
        continue;
      }

      const articleId = String(article.id);
      const enUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${SOURCE_LOCALE}/articles/${articleId}`;
      const frUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${TARGET_LOCALE}/articles/${articleId}`;

      let exists = false;
      try {
        exists = await translationExists(articleId, TARGET_LOCALE);
      } catch (err) {
        addManualReviewEntry(masterEntries, {
          sectionName,
          sectionId,
          articleId,
          titleEn: article.title,
          action: "manual_review_scan_failed",
          enUrl,
          frUrl,
          failureReason: `Master scan translation check failed: ${err.message || String(err)}`,
        });
        continue;
      }

      if (exists) {
        continue;
      }

      addManualReviewEntry(masterEntries, {
        sectionName,
        sectionId,
        articleId,
        titleEn: article.title,
        action: "manual_review_large_article",
        enUrl,
        frUrl,
        failureReason: `Article body length ${(article.body || "").length} exceeds max ${MAX_ARTICLE_BODY_LENGTH} characters`,
      });
    }
  }

  console.log(`Master manual review list written: ${MANUAL_REVIEW_MASTER_PATH}`);
}

async function main() {
  const runStartTime = new Date().toISOString();

  console.log(`\n🚀 Translation run started: ${runStartTime}`);
  debugLog(`🚀 Translation run started: ${runStartTime}`);
  debugLog(`runId: ${runId}`);
  debugLog(`Model: ${OPENAI_MODEL}`);
  debugLog(`Target locale: ${TARGET_LOCALE}`);
  debugLog(`Glossary terms loaded: ${glossaryTerms.length}`);

  console.log(`Model: ${OPENAI_MODEL}`);
  console.log(`Target locale: ${TARGET_LOCALE}`);
  console.log(`Throttle: ${THROTTLE_MS}ms between requests`);
  console.log(`Glossary terms loaded: ${glossaryTerms.length}\n`);

  // Write initial status if runId is provided
  if (runId) {
    writeTranslationStatus("running", { totalArticles: 0, articlesTranslated: 0 });
  }

  const plan = JSON.parse(fs.readFileSync("sections_plan.json", "utf-8"));
  const sections = plan.sections || [];
  const sectionsFullPath = "sections_full.json";
  const sectionsFull = fs.existsSync(sectionsFullPath)
    ? JSON.parse(fs.readFileSync(sectionsFullPath, "utf-8"))
    : { sections: [] };
  const sectionMetaById = new Map(
    (sectionsFull.sections || []).map((section) => [String(section.id), section])
  );
  if (!Array.isArray(sections) || sections.length === 0) {
    console.error("❌ sections_plan.json has no sections");
    process.exit(1);
  }

  ensureDir("config");
  ensureDir("output");

  const manualReviewMasterEntries = loadManualReviewMasterList();
  await scanManualReviewCandidates({
    sections,
    sectionMetaById,
    masterEntries: manualReviewMasterEntries,
  });

  const statePath = path.join("config", "sections_state.json");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf-8"))
    : { next_index: 0 };

  let idx = Number(state.next_index || 0);

  const processedSections = [];
  const csvRows = [];
  let translatedCount = 0;
  let skippedExistingCount = 0;
  let skippedEmptySections = 0;
  let skippedLargeArticleCount = 0;
  let skippedTimeoutCount = 0;
  let skippedParseErrorCount = 0;
  let categoryTranslationsCreatedCount = 0;
  let categoryTranslationsSkippedExistingCount = 0;
  let sectionTranslationsCreatedCount = 0;
  let sectionTranslationsSkippedExistingCount = 0;

  // Track error messages for status reporting
  const errors = [];

  // OpenAI usage totals
  const usageTotals = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  const maxSectionsPerRun = 1; // Demo: process 1 section at a time
  const throttle = Number(THROTTLE_MS) || 900;
  const translatedCategoryIds = new Set();
  const translatedSectionIds = new Set();
  const sectionBatch = [];

  while (sectionBatch.length < maxSectionsPerRun && idx < sections.length) {
    const section = sections[idx];
    idx += 1;
    const sectionId = section.id;
    const sectionName = section.name;
    const sectionMeta = sectionMetaById.get(String(sectionId)) || {};
    const categoryId = section.category_id || sectionMeta.category_id;
    const sectionEnUrl = sectionMeta.html_url || `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${SOURCE_LOCALE}/sections/${sectionId}`;
    const sectionFrUrl = sectionEnUrl.replace(`/hc/${SOURCE_LOCALE}/`, `/hc/${TARGET_LOCALE}/`);

    sectionBatch.push({
      section,
      sectionId,
      sectionName,
      sectionMeta,
      categoryId,
      sectionEnUrl,
      sectionFrUrl,
      parentsReady: false,
    });
  }

  for (const batchItem of sectionBatch) {
    const {
      sectionId,
      sectionName,
      categoryId,
      sectionEnUrl,
      sectionFrUrl,
    } = batchItem;

    console.log(`\n=== Parent Translations: ${sectionName} (${sectionId}) ===`);

    try {
      if (!categoryId) {
        throw new Error(`Parent translation failed: section ${sectionId} (${sectionName}) is missing category_id in sections_full.json`);
      }

      if (!translatedCategoryIds.has(String(categoryId))) {
        try {
          const categoryResult = await ensureHelpCenterTranslation({
            sourceType: "category",
            objectId: categoryId,
            sourceLocale: SOURCE_LOCALE,
            targetLocale: TARGET_LOCALE,
            sourceLabel: `Category for section ${sectionName}`,
            usageTotals,
          });
          if (categoryResult.status === "created") categoryTranslationsCreatedCount += 1;
          if (categoryResult.status === "skipped_existing") categoryTranslationsSkippedExistingCount += 1;
          translatedCategoryIds.add(String(categoryId));
        } catch (err) {
          throw new Error(`Parent translation failed: category ${categoryId} for section ${sectionId} (${sectionName}) - ${err.message}`);
        }
        await sleep(throttle);
      }

      if (!translatedSectionIds.has(String(sectionId))) {
        try {
          const sectionResult = await ensureHelpCenterTranslation({
            sourceType: "section",
            objectId: sectionId,
            sourceLocale: SOURCE_LOCALE,
            targetLocale: TARGET_LOCALE,
            sourceLabel: sectionName,
            usageTotals,
          });
          if (sectionResult.status === "created") sectionTranslationsCreatedCount += 1;
          if (sectionResult.status === "skipped_existing") sectionTranslationsSkippedExistingCount += 1;
          translatedSectionIds.add(String(sectionId));
        } catch (err) {
          throw new Error(`Parent translation failed: section ${sectionId} (${sectionName}) - ${err.message}`);
        }
        await sleep(throttle);
      }

      batchItem.parentsReady = true;
    } catch (sectionErr) {
      const failureReason = sectionErr.message || String(sectionErr);
      const action = classifyManualReviewAction(failureReason);

      console.error(`\n⚠️  Section ${sectionId} parent translation failed: ${failureReason}`);
      console.error(`   Action: ${action}`);

      // Track error for status reporting
      const errorMsg = `Section ${sectionId} (${sectionName}): ${failureReason} [${action}]`;
      errors.push(errorMsg);

      logManualReview({
        sectionName,
        sectionId,
        articleId: "",
        titleEn: `[Section] ${sectionName}`,
        action,
        enUrl: sectionEnUrl,
        frUrl: sectionFrUrl,
        failureReason,
        masterEntries: manualReviewMasterEntries,
      });
    }
  }

  for (const batchItem of sectionBatch) {
    const {
      sectionId,
      sectionName,
      parentsReady,
    } = batchItem;

    // Process articles regardless of parent translation status (parent translations are optional)
    // if (!parentsReady) {
    //   continue;
    // }

    console.log(`\n=== Section Articles: ${sectionName} (${sectionId}) ===`);

    const articles = await fetchAllArticlesInSection(sectionId);

    if (!articles.length) {
      console.log("⏭️  Skipping section (0 articles)");
      skippedEmptySections += 1;
      continue;
    }

    processedSections.push({ sectionId, sectionName, articleCount: articles.length });

    for (const a of articles) {
      const articleId = String(a.id);
      const en_url = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${SOURCE_LOCALE}/articles/${articleId}`;
      const fr_url = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/hc/${TARGET_LOCALE}/articles/${articleId}`;

      try {
        if ((a.body || "").length > MAX_ARTICLE_BODY_LENGTH) {
          const failureReason = `Article body length ${(a.body || "").length} exceeds max ${MAX_ARTICLE_BODY_LENGTH} characters`;
          const action = "manual_review_large_article";
          skippedLargeArticleCount += 1;

          console.error(`\n⚠️  Article ${articleId} skipped: ${failureReason}`);
          console.error(`   Action: ${action}`);

          // Track error for status reporting
          const errorMsg = `Article ${articleId} (${a.title}): ${failureReason} [${action}]`;
          errors.push(errorMsg);

          csvRows.push({
            sectionName,
            sectionId,
            articleId,
            title_en: a.title,
            title_fr: "",
            action,
            en_url,
            fr_url,
          });

          logManualReview({
            sectionName,
            sectionId,
            articleId,
            titleEn: a.title,
            action,
            enUrl: en_url,
            frUrl: fr_url,
            failureReason,
            masterEntries: manualReviewMasterEntries,
          });
          continue;
        }

        // Skip if already translated to fr-ca (this includes your earlier POC translations)
        const exists = await translationExists(articleId, TARGET_LOCALE);
        if (exists) {
          skippedExistingCount += 1;
          debugLog(`⏭️  SKIP Article ${articleId}: ${a.title} - translation already exists`);

          csvRows.push({
            sectionName,
            sectionId,
            articleId,
            title_en: a.title,
            title_fr: "",
            action: "skipped_exists",
            en_url,
            fr_url,
          });
          continue;
        }

        console.log(`Translating article ${articleId}: ${a.title}`);

        const { translated, usage } = await openaiTranslate({ title: a.title, bodyHtml: a.body });

        // Accumulate usage (fields vary a bit; cover common keys)
        usageTotals.input_tokens += usage.input_tokens || 0;
        usageTotals.output_tokens += usage.output_tokens || 0;
        usageTotals.total_tokens += usage.total_tokens || 0;

        // Upload translation
        const payload = {
          translation: {
            locale: TARGET_LOCALE,
            title: translated.title,
            body: translated.body,
            draft: false,
          },
        };

        console.log(`Uploading translation for article ${articleId}`);
        const result = await zendeskPost(`/help_center/articles/${articleId}/translations.json`, payload);

        const action = result.status === "created" ? "created" : "skipped_exists";
        if (action === "created") translatedCount += 1;
        else skippedExistingCount += 1;

        csvRows.push({
          sectionName,
          sectionId,
          articleId,
          title_en: a.title,
          title_fr: translated.title,
          action,
          en_url,
          fr_url,
        });

        // Update real-time progress after processing each article
        if (runId) {
          const totalProcessed = translatedCount + skippedExistingCount + skippedLargeArticleCount + skippedParseErrorCount + skippedTimeoutCount;
          writeTranslationStatus("running", {
            totalArticles: totalProcessed,
            articlesTranslated: translatedCount,
            articlesFailed: skippedParseErrorCount + skippedTimeoutCount,
            errors,
          });
        }
      } catch (articleErr) {
        const failureReason = articleErr.message || String(articleErr);
        const action = classifyManualReviewAction(articleErr);

        if (action === "manual_review_parse_error") skippedParseErrorCount += 1;
        if (action === "manual_review_timeout") skippedTimeoutCount += 1;

        console.error(`\n⚠️  Article ${articleId} failed: ${failureReason}`);
        console.error(`   Action: ${action}`);

        // Track error for status reporting
        const errorMsg = `Article ${articleId} (${a.title}): ${failureReason} [${action}]`;
        errors.push(errorMsg);

        csvRows.push({
          sectionName,
          sectionId,
          articleId,
          title_en: a.title,
          title_fr: "",
          action,
          en_url,
          fr_url,
        });

        logManualReview({
          sectionName,
          sectionId,
          articleId,
          titleEn: a.title,
          action,
          enUrl: en_url,
          frUrl: fr_url,
          failureReason,
          masterEntries: manualReviewMasterEntries,
        });
      }

      await sleep(throttle);
    }
  }

  // Update status with final article counts
  if (runId) {
    writeTranslationStatus("running", {
      totalArticles: translatedCount + skippedExistingCount + skippedLargeArticleCount + skippedParseErrorCount + skippedTimeoutCount,
      articlesTranslated: translatedCount,
      articlesFailed: skippedParseErrorCount + skippedTimeoutCount,
      errors,
    });
  }

  // Persist state
  fs.writeFileSync(statePath, JSON.stringify({ next_index: idx }, null, 2));

  // Write CSV for this run
  const runEndTime = new Date().toISOString();
  const ts = runEndTime.replace(/[:.]/g, "-");
  const csvPath = path.join("output", `run_${ts}_sections_${maxSectionsPerRun}.csv`);

  const header = [
    "section_name",
    "section_id",
    "article_id",
    "title_en",
    "title_fr",
    "action",
    "en_url",
    "fr_url",
  ];

  // Build metadata rows for audit trail
  const metadataRows = [
    ["=== RUN METADATA ==="],
    [`Start time: ${runStartTime}`],
    [`End time: ${runEndTime}`],
    [`Model: ${OPENAI_MODEL}`],
    [`Target locale: ${TARGET_LOCALE}`],
    [`Glossary terms: ${glossaryTerms.length}`],
    [""],
  ];

  const lines = [...metadataRows, header.join(",")];
  for (const r of csvRows) {
    lines.push(
      [
        csvEscape(r.sectionName),
        csvEscape(r.sectionId),
        csvEscape(r.articleId),
        csvEscape(r.title_en),
        csvEscape(r.title_fr),
        csvEscape(r.action),
        csvEscape(r.en_url),
        csvEscape(r.fr_url),
      ].join(",")
    );
  }
  fs.writeFileSync(csvPath, lines.join("\n"));

  // Cost estimate (if rates provided)
  const estimated = estimateCostUSD(usageTotals);

  console.log("\n=== Run Summary ===");
  console.log(`Processed sections: ${processedSections.length} (skipped empty: ${skippedEmptySections})`);
  console.log(`translated: ${translatedCount}`);
  console.log(`skipped_existing: ${skippedExistingCount}`);
  console.log(`skipped_large_article: ${skippedLargeArticleCount}`);
  console.log(`skipped_timeout: ${skippedTimeoutCount}`);
  console.log(`skipped_parse_error: ${skippedParseErrorCount}`);
  console.log(`category_translations_created: ${categoryTranslationsCreatedCount}`);
  console.log(`category_translations_skipped_existing: ${categoryTranslationsSkippedExistingCount}`);
  console.log(`section_translations_created: ${sectionTranslationsCreatedCount}`);
  console.log(`section_translations_skipped_existing: ${sectionTranslationsSkippedExistingCount}`);
  console.log(`CSV written: ${csvPath}`);
  console.log(
    `OpenAI usage (tokens): input=${usageTotals.input_tokens} output=${usageTotals.output_tokens} total=${usageTotals.total_tokens}`
  );
  if (estimated != null) {
    console.log(`Estimated OpenAI cost this run: $${estimated.toFixed(4)}`);
  } else {
    console.log(
      "Estimated cost: (set OPENAI_INPUT_PER_M and OPENAI_OUTPUT_PER_M in .env to calculate dollars automatically)"
    );
  }
  console.log(`Next section index: ${idx} / ${sections.length}`);

  // Final status update - mark as completed
  if (runId) {
    writeTranslationStatus("completed", {
      totalArticles: translatedCount + skippedExistingCount + skippedLargeArticleCount + skippedParseErrorCount + skippedTimeoutCount,
      articlesTranslated: translatedCount,
      articlesFailed: skippedParseErrorCount + skippedTimeoutCount,
      errors,
    });
    console.log(`✅ Status updated: workflow completed (runId: ${runId})`);
  }
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  console.error("Error name:", err.name);
  if (err.cause) {
    console.error("Cause:", err.cause);
  }
  if (err.stack) {
    console.error("Stack:", err.stack);
  }

  // Update status to failed
  if (runId) {
    writeTranslationStatus("failed", {
      errors: [err.message || String(err)],
    });
    console.log(`📝 Status updated: workflow failed (runId: ${runId})`);
  }

  process.exit(1);
});
