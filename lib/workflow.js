/**
 * Phase 1 Workflow Orchestration
 * Coordinates the full translation pipeline:
 * 1. Scan for recently edited articles
 * 2. Post approval message to Slack
 * 3. Wait for approvals
 * 4. Process approved articles through translation
 * 5. Upload translations to Help Center
 * 6. Generate CSV audit log
 */

import fs from "fs";
import path from "path";
import { exec, execFile } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Config and state management
import { getCurrentBrand } from "../config/zendesk.js";
import { createNewApprovalRound, getApprovalStatus } from "./approval-manager.js";

// Constants
const DAYS_BACK = 7;
const MAX_ARTICLES_PER_RUN = 5;
const OUTPUT_DIR = "output";
const TIMEOUT_HOURS = 24;
const STATUS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, ".focus-desk");

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function ensureStatusDir() {
  if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR, { recursive: true });
  }
}

/**
 * Get the status file path for a translation run
 */
function getTranslationStatusFile(runId) {
  return path.join(STATUS_DIR, `translation-status-${runId}.json`);
}

/**
 * Write translation status to file
 */
function writeTranslationStatus(runId, status, data = {}) {
  try {
    ensureStatusDir();
    const statusFile = getTranslationStatusFile(runId);
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
    console.log(`📝 Status updated: ${status} (${statusFile})`);
  } catch (err) {
    console.error(`Failed to write status file: ${err.message}`);
  }
}

/**
 * Read translation status from file
 */
function readTranslationStatus(runId) {
  try {
    const statusFile = getTranslationStatusFile(runId);
    if (!fs.existsSync(statusFile)) {
      return null;
    }
    const content = fs.readFileSync(statusFile, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read status file: ${err.message}`);
    return null;
  }
}

/**
 * Phase 1 Step 1: Scan for recently edited articles
 * Fetches articles edited in the past N days, then checks if they need translation
 * by comparing English vs French version timestamps
 */
async function scanRecentlyEditedArticles(zendesk, daysBack = DAYS_BACK) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  console.log(
    `\n🔍 Scanning for articles edited since: ${cutoffDate.toDateString()}`
  );

  try {
    // Import Zendesk functions
    const { fetchRecentlyEditedArticles, fetchArticle } = await import('./zendesk-api.js');

    // Step 1: Get recently edited articles (English version)
    const recentArticles = await fetchRecentlyEditedArticles(daysBack, 'en-us', 50);
    console.log(`   Found ${recentArticles.length} recently edited articles`);

    if (recentArticles.length === 0) {
      return {
        count: 0,
        articles: [],
        cutoffDate: cutoffISO,
      };
    }

    // Step 2: Filter articles that need translation
    // (English version is newer than French version)
    const articlesNeedingTranslation = [];

    for (const enArticle of recentArticles) {
      try {
        // Fetch French version to compare timestamps
        const frArticle = await fetchArticle(enArticle.id, 'fr-ca');

        const enUpdated = new Date(enArticle.updated_at);
        const frUpdated = new Date(frArticle.updated_at);

        // Include article if English is newer than French
        if (enUpdated > frUpdated) {
          articlesNeedingTranslation.push({
            id: enArticle.id,
            title: enArticle.title,
            locale: 'en-us',
            updated_at: enArticle.updated_at,
            frenchUpdated_at: frArticle.updated_at,
            daysSinceTranslation: Math.floor(
              (enUpdated - frUpdated) / (1000 * 60 * 60 * 24)
            ),
            helpCenterUrl: `https://himarley.zendesk.com/hc/en-us/articles/${enArticle.id}`,
            helpCenterUrlFr: `https://himarley.zendesk.com/hc/fr-ca/articles/${enArticle.id}`,
          });

          console.log(
            `   ✓ Article #${enArticle.id}: "${enArticle.title}" (${Math.floor((enUpdated - frUpdated) / (1000 * 60 * 60 * 24))} days out of sync)`
          );
        } else {
          console.log(
            `   ✗ Article #${enArticle.id}: "${enArticle.title}" (French up-to-date)`
          );
        }
      } catch (err) {
        console.warn(
          `   ⚠️  Article #${enArticle.id}: Could not fetch French version - ${err.message}`
        );
        // If we can't fetch French version, assume it needs translation
        articlesNeedingTranslation.push({
          id: enArticle.id,
          title: enArticle.title,
          locale: 'en-us',
          updated_at: enArticle.updated_at,
          frenchUpdated_at: null,
          daysSinceTranslation: null,
          helpCenterUrl: `https://himarley.zendesk.com/hc/en-us/articles/${enArticle.id}`,
          helpCenterUrlFr: `https://himarley.zendesk.com/hc/fr-ca/articles/${enArticle.id}`,
        });
      }
    }

    console.log(
      `   📋 ${articlesNeedingTranslation.length} article(s) need translation`
    );

    return {
      count: articlesNeedingTranslation.length,
      articles: articlesNeedingTranslation,
      cutoffDate: cutoffISO,
    };
  } catch (err) {
    console.error(`   ❌ Scan error: ${err.message}`);
    throw err;
  }
}

/**
 * Scan articles in a specific Help Center section for translation needs
 * Compares English vs French versions to identify articles needing translation
 * @param {string|number} sectionId - Help Center section ID (e.g., "49206877282195")
 * @param {string} locale - Source locale (default: 'en-us')
 * @returns {Promise<Object>} Object with count and articles needing translation
 */
async function scanSectionForTranslation(sectionId, locale = 'en-us') {
  console.log(`\n🔍 Scanning section ${sectionId} for articles needing translation...`);

  try {
    // Import Zendesk functions
    const { fetchArticlesBySection, fetchArticle } = await import('./zendesk-api.js');

    // Step 1: Get all articles in the section
    const sectionArticles = await fetchArticlesBySection(sectionId, locale, 100);
    console.log(`   Found ${sectionArticles.length} articles in section`);

    if (sectionArticles.length === 0) {
      return {
        count: 0,
        articles: [],
        sectionId,
      };
    }

    // Step 2: Filter articles that need translation
    // (English version is newer than French version)
    const articlesNeedingTranslation = [];

    for (const enArticle of sectionArticles) {
      try {
        // Fetch French version to compare timestamps
        const frArticle = await fetchArticle(enArticle.id, 'fr-ca');

        const enUpdated = new Date(enArticle.updated_at);
        const frUpdated = new Date(frArticle.updated_at);

        // Include article if English is newer than French
        if (enUpdated > frUpdated) {
          articlesNeedingTranslation.push({
            id: enArticle.id,
            title: enArticle.title,
            locale: 'en-us',
            updated_at: enArticle.updated_at,
            frenchUpdated_at: frArticle.updated_at,
            daysSinceTranslation: Math.floor(
              (enUpdated - frUpdated) / (1000 * 60 * 60 * 24)
            ),
            helpCenterUrl: `https://himarley.zendesk.com/hc/en-us/articles/${enArticle.id}`,
            helpCenterUrlFr: `https://himarley.zendesk.com/hc/fr-ca/articles/${enArticle.id}`,
          });

          console.log(
            `   ✓ Article #${enArticle.id}: "${enArticle.title}" (${Math.floor((enUpdated - frUpdated) / (1000 * 60 * 60 * 24))} days out of sync)`
          );
        } else {
          console.log(
            `   ✗ Article #${enArticle.id}: "${enArticle.title}" (French up-to-date)`
          );
        }
      } catch (err) {
        console.warn(
          `   ⚠️  Article #${enArticle.id}: Could not fetch French version - ${err.message}`
        );
        // If we can't fetch French version, assume it needs translation
        articlesNeedingTranslation.push({
          id: enArticle.id,
          title: enArticle.title,
          locale: 'en-us',
          updated_at: enArticle.updated_at,
          frenchUpdated_at: null,
          daysSinceTranslation: null,
          helpCenterUrl: `https://himarley.zendesk.com/hc/en-us/articles/${enArticle.id}`,
          helpCenterUrlFr: `https://himarley.zendesk.com/hc/fr-ca/articles/${enArticle.id}`,
        });
      }
    }

    console.log(
      `   📋 ${articlesNeedingTranslation.length} article(s) need translation`
    );

    return {
      count: articlesNeedingTranslation.length,
      articles: articlesNeedingTranslation,
      sectionId,
    };
  } catch (err) {
    console.error(`   ❌ Scan error: ${err.message}`);
    throw err;
  }
}

/**
 * Phase 1 Step 2: Prepare articles for approval
 * Filters and formats articles for the Slack approval message
 */
function prepareApprovalPayload(articles, maxCount = MAX_ARTICLES_PER_RUN) {
  const toApprove = articles.slice(0, maxCount);

  return {
    runId: `phase1_${Date.now()}`,
    articles: toApprove,
    articleCount: toApprove.length,
    message: {
      title: `📝 Weekly Translation Review - ${toApprove.length} articles`,
      description: `The following articles were edited in the past 7 days and are ready for French Canadian translation:`,
    },
  };
}

/**
 * Phase 1 Step 3: Post approval message to Slack
 * Posts interactive approval message with approve/deny buttons
 * (Slack integration will handle the actual posting)
 */
async function postApprovalMessage(slack, slackChannelId, payload, approvers) {
  console.log(`\n📢 Preparing approval message for Slack...`);
  console.log(`   Articles to approve: ${payload.articleCount}`);
  console.log(`   Approvers: ${approvers.map((a) => a.name).join(", ")}`);

  // Create approval tracking state
  createNewApprovalRound(payload.runId, payload.articles, approvers);

  // Format message for Slack (actual posting happens in slack-integration.js)
  return {
    channel: slackChannelId,
    runId: payload.runId,
    articles: payload.articles,
    payload: payload,
    status: "ready_to_post",
    note: "Slack module will post this to channel and handle interactions",
  };
}

/**
 * Phase 1 Step 4: Wait for approvals with timeout
 * Polls approval status until all admins approve or timeout
 */
async function waitForApprovals(runId, timeoutHours = TIMEOUT_HOURS) {
  const startTime = Date.now();
  const timeoutMs = timeoutHours * 60 * 60 * 1000;
  const pollIntervalMs = 30 * 1000; // Check every 30 seconds

  console.log(`\n⏳ Waiting for approvals (timeout: ${timeoutHours} hours)...`);

  while (Date.now() - startTime < timeoutMs) {
    const status = getApprovalStatus(runId);

    if (!status) {
      throw new Error(`No active approval found for run: ${runId}`);
    }

    if (status.allApproved) {
      console.log(`✅ All approvals received!`);
      console.log(`   Approvers: ${status.approvalsSoFar.map((a) => a.approver_name).join(", ")}`);
      return status;
    }

    console.log(`   Waiting... ${status.percentComplete} complete`);
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Approval timeout after ${timeoutHours} hours`);
}

/**
 * Phase 1 Step 5: Translate approved articles
 * Spawns run_next_5_sections.js as a background process to translate articles
 * Returns immediately while translation happens in background
 */
async function translateApprovedArticles(approvalStatus, runId = null) {
  console.log(`\n🌐 Starting translation for ${approvalStatus.articles.length} articles...`);

  // Generate runId if not provided
  const translationRunId = runId || `phase1_${Date.now()}`;

  // Write initial status
  writeTranslationStatus(translationRunId, "running", {
    totalArticles: approvalStatus.articles.length,
    articlesTranslated: 0,
    articlesFailed: 0,
  });

  const translationScript = path.resolve("run_next_5_sections.js");

  if (!fs.existsSync(translationScript)) {
    console.warn("⚠️  Translation script not found, skipping translation");
    writeTranslationStatus(translationRunId, "failed", {
      errors: ["Translation script not found"],
    });
    return {
      articles_translated: 0,
      tokens_used: 0,
      cost_usd: 0,
      status: "translation_script_not_found",
      runId: translationRunId,
    };
  }

  // Spawn translation script as background process with runId argument
  const child = execFile(
    process.execPath,
    [translationScript, `--runId=${translationRunId}`],
    { detached: true, stdio: "ignore" },
    (err) => {
      if (err) {
        console.error("Translation process error:", err.message);
        writeTranslationStatus(translationRunId, "failed", {
          errors: [err.message],
        });
      }
    }
  );

  child.unref(); // Let it run independently

  console.log(`✅ Translation started in background (PID: ${child.pid}, RunID: ${translationRunId})`);

  // Return with estimated values based on approved articles
  // Note: Actual tokens/cost will be in CSV generated by run_next_5_sections.js
  return {
    articles_translated: approvalStatus.articles.length,
    tokens_used: 0, // Will be calculated by translation script
    cost_usd: 0, // Will be calculated by translation script
    status: "translation_started_in_background",
    message: "Translations are being processed. CSV audit log will be generated.",
    runId: translationRunId,
  };
}

/**
 * Phase 1 Step 6: Generate audit log
 * Creates CSV with full run details for tracking and compliance
 */
function generateAuditLog(runId, scanResults, approvalStatus, translationResults) {
  ensureOutputDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const csvPath = path.join(OUTPUT_DIR, `phase1_audit_${timestamp}.csv`);

  const rows = [
    ["Phase 1 Audit Log", timestamp].join(","),
    ["Run ID", runId].join(","),
    "",
    ["SCAN RESULTS"].join(","),
    ["Cutoff Date", scanResults.cutoffDate].join(","),
    ["Articles Found", scanResults.count].join(","),
    "",
    ["APPROVAL RESULTS"].join(","),
    [
      "Approvers Needed",
      approvalStatus.approvalsNeeded.length,
    ].join(","),
    ["Approvals Received", approvalStatus.approvalsSoFar.length].join(
      ","
    ),
    [
      "Approvers",
      approvalStatus.approvalsSoFar.map((a) => `${a.approver_name}`).join("; "),
    ].join(","),
    "",
    ["TRANSLATION RESULTS"].join(","),
    [
      "Articles Translated",
      translationResults.articles_translated,
    ].join(","),
    ["Tokens Used", translationResults.tokens_used].join(","),
    ["Cost (USD)", `$${translationResults.cost_usd.toFixed(2)}`].join(","),
  ];

  const csv = rows.map((r) => (Array.isArray(r) ? r : r)).join("\n");
  fs.writeFileSync(csvPath, csv);

  console.log(`\n📊 Audit log saved: ${csvPath}`);
  return { path: csvPath, filename: path.basename(csvPath) };
}

/**
 * Generate audit log for direct workflow (no approval step)
 * Simplified version that doesn't require approval status
 */
function generateAuditLogDirect(runId, scanResults, translationResults) {
  ensureOutputDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const csvPath = path.join(OUTPUT_DIR, `phase1_audit_${timestamp}.csv`);

  const rows = [
    ["Phase 1 Audit Log", timestamp].join(","),
    ["Run ID", runId].join(","),
    "",
    ["SCAN RESULTS"].join(","),
    ["Articles Found", scanResults.count].join(","),
    ["Articles Scanned", scanResults.articles.map((a) => `${a.id} (${a.title})`).join("; ")].join(","),
    "",
    ["TRANSLATION RESULTS"].join(","),
    [
      "Articles Translated",
      translationResults.articles_translated,
    ].join(","),
    ["Tokens Used", translationResults.tokens_used].join(","),
    ["Cost (USD)", `$${translationResults.cost_usd.toFixed(2)}`].join(","),
    ["Status", translationResults.status].join(","),
  ];

  const csv = rows.map((r) => (Array.isArray(r) ? r : r)).join("\n");
  fs.writeFileSync(csvPath, csv);

  console.log(`\n📊 Audit log saved: ${csvPath}`);
  return { path: csvPath, filename: path.basename(csvPath) };
}

/**
 * Execute full Phase 1 workflow (simplified - direct translation without approval)
 * Steps:
 * 1. Scan for articles needing translation
 * 2. Translate articles directly
 * 3. Generate audit log
 */
async function executePhase1Workflow(options = {}) {
  const {
    zendesk = null,
    slack = null,
    slackChannelId = null,
    approversList = [],
    daysBack = DAYS_BACK,
    sectionId = null,
    runId = null,
  } = options;

  console.log("\n" + "=".repeat(60));
  console.log("🚀 PHASE 1: Weekly Translation Workflow");
  console.log("=".repeat(60));

  const brand = getCurrentBrand();
  console.log(`📍 Environment: ${brand.name} (ID: ${brand.id})`);

  try {
    // Step 1: Scan for articles needing translation
    // Use section-based scan if sectionId provided, otherwise scan recently edited articles
    let scanResults;
    if (sectionId) {
      console.log(`\n📋 Scanning specific section: ${sectionId}`);
      scanResults = await scanSectionForTranslation(sectionId);
    } else {
      console.log(`\n📋 Scanning recently edited articles (last ${daysBack} days)`);
      scanResults = await scanRecentlyEditedArticles(zendesk, daysBack);
    }
    console.log(`Found ${scanResults.count} articles to review`);

    if (scanResults.count === 0) {
      console.log("✅ No articles to translate this week");
      return {
        status: "success_no_changes",
        articles_processed: 0,
      };
    }

    // Step 2: Translate articles directly (no approval step)
    const finalRunId = runId || `phase1_${Date.now()}`;
    const translationResults = await translateApprovedArticles({
      articles: scanResults.articles,
    }, finalRunId);

    // Step 3: Generate audit log (simplified - no approval data)
    const auditLog = generateAuditLogDirect(
      finalRunId,
      scanResults,
      translationResults
    );

    console.log("\n✅ Phase 1 workflow completed successfully!");
    return {
      status: "success",
      runId: finalRunId,
      articles_processed: scanResults.count,
      audit_log: auditLog,
    };
  } catch (err) {
    console.error(`\n❌ Workflow error: ${err.message}`);
    return {
      status: "error",
      error: err.message,
    };
  }
}

export {
  scanRecentlyEditedArticles,
  scanSectionForTranslation,
  prepareApprovalPayload,
  postApprovalMessage,
  waitForApprovals,
  translateApprovedArticles,
  generateAuditLog,
  generateAuditLogDirect,
  executePhase1Workflow,
  getTranslationStatusFile,
  writeTranslationStatus,
  readTranslationStatus,
};
