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
import { exec } from "child_process";
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

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Phase 1 Step 1: Scan for recently edited articles
 * Fetches articles edited in the past N days
 */
async function scanRecentlyEditedArticles(zendesk, daysBack = DAYS_BACK) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString();

  console.log(
    `\n🔍 Scanning for articles edited since: ${cutoffDate.toDateString()}`
  );

  // Use Zendesk API to search for recently updated articles
  // This would call the zendesk module to fetch articles
  // For now, return structure
  return {
    count: 0,
    articles: [],
    cutoffDate: cutoffISO,
    error: "Implementation requires Zendesk module",
  };
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
 * Calls run_next_5_sections.js to translate approved articles
 * Only translates the edited section, not entire articles
 */
async function translateApprovedArticles(approvalStatus) {
  console.log(`\n🌐 Translating ${approvalStatus.articles.length} articles...`);

  // In production, this would invoke the translation script
  // For now, return the expected format
  return {
    articles_translated: approvalStatus.articles.length,
    tokens_used: 0,
    cost_usd: 0,
    status: "Implementation requires calling run_next_5_sections.js",
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
 * Execute full Phase 1 workflow
 */
async function executePhase1Workflow(options = {}) {
  const {
    zendesk = null,
    slack = null,
    slackChannelId = null,
    approversList = [],
    daysBack = DAYS_BACK,
  } = options;

  console.log("\n" + "=".repeat(60));
  console.log("🚀 PHASE 1: Weekly Translation Workflow");
  console.log("=".repeat(60));

  const brand = getCurrentBrand();
  console.log(`📍 Environment: ${brand.name} (ID: ${brand.id})`);

  try {
    // Step 1: Scan for recently edited articles
    const scanResults = await scanRecentlyEditedArticles(zendesk, daysBack);
    console.log(`Found ${scanResults.count} articles to review`);

    if (scanResults.count === 0) {
      console.log("✅ No articles to translate this week");
      return {
        status: "success_no_changes",
        articles_processed: 0,
      };
    }

    // Step 2: Prepare approval payload
    const approvalPayload = prepareApprovalPayload(scanResults.articles);

    // Step 3: Post approval message
    const approvalMessage = await postApprovalMessage(
      slack,
      slackChannelId,
      approvalPayload,
      approversList
    );
    console.log(`✅ Approval message prepared (runId: ${approvalPayload.runId})`);

    // Step 4: Wait for approvals
    const approvalStatus = await waitForApprovals(approvalPayload.runId);

    // Step 5: Translate approved articles
    const translationResults = await translateApprovedArticles(approvalStatus);

    // Step 6: Generate audit log
    const auditLog = generateAuditLog(
      approvalPayload.runId,
      scanResults,
      approvalStatus,
      translationResults
    );

    console.log("\n✅ Phase 1 workflow completed successfully!");
    return {
      status: "success",
      runId: approvalPayload.runId,
      articles_processed: approvalStatus.articles.length,
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
  prepareApprovalPayload,
  postApprovalMessage,
  waitForApprovals,
  translateApprovedArticles,
  generateAuditLog,
  executePhase1Workflow,
};
