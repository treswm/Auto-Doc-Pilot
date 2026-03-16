#!/usr/bin/env node

/**
 * Phase 1 Scheduler
 * Main entry point that orchestrates the weekly translation workflow
 *
 * Usage:
 *   node scheduler.js              # Start in configured schedule mode
 *   node scheduler.js --test       # Run once immediately in test mode
 *   node scheduler.js --now        # Run once immediately
 */

import "dotenv/config";
import schedule from "node-schedule";
import fs from "fs";
import path from "path";

// Phase 1 components
import { getPhase1Schedule, switchScheduleMode } from "./config/scheduler.js";
import { getApprovers } from "./lib/slack-approvers.js";
import { executePhase1Workflow } from "./lib/workflow.js";
import { initializeSlackBot } from "./lib/slack-integration.js";

const args = process.argv.slice(2);
const testMode = args.includes("--test");
const runNow = args.includes("--now");

// Extract optional section ID (e.g., --section=49206877282195)
// Default to Best Practices section (49206877282195) for demo purposes
let sectionId = "49206877282195"; // Best Practices section - demo default
const sectionArg = args.find(arg => arg.startsWith("--section="));
if (sectionArg) {
  sectionId = sectionArg.split("=")[1];
}

// Extract optional runId (e.g., --runId=phase1_1234567890)
// Used to track translation progress across backend and frontend
let runId = null;
const runIdArg = args.find(arg => arg.startsWith("--runId="));
if (runIdArg) {
  runId = runIdArg.split("=")[1];
}

// Placeholder for actual Zendesk and Slack clients
// These will be initialized when credentials are available
let zendeskClient = null;
let slackClient = null;

/**
 * Initialize required credentials and clients
 */
async function initializeClients() {
  console.log("🔧 Initializing clients...\n");

  const {
    ZENDESK_SUBDOMAIN,
    ZENDESK_OAUTH_ACCESS_TOKEN,
    OPENAI_API_KEY,
  } = process.env;

  // Validate Zendesk
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_OAUTH_ACCESS_TOKEN) {
    console.warn("⚠️  Zendesk credentials missing - Zendesk features disabled");
    console.warn("   → Fill .env with ZENDESK_SUBDOMAIN and ZENDESK_OAUTH_ACCESS_TOKEN");
  } else {
    console.log("✅ Zendesk configured");
  }

  // Validate OpenAI
  if (!OPENAI_API_KEY) {
    console.warn("⚠️  OpenAI API key missing - Translation disabled");
    console.warn("   → Fill .env with OPENAI_API_KEY");
  } else {
    console.log("✅ OpenAI configured");
  }

  // Initialize Slack (optional for now)
  const slackReady = await initializeSlackBot();
  if (slackReady) {
    console.log("✅ Slack bot initialized");
  }

  return {
    zendesk: zendeskClient,
    slack: slackClient,
    credentialsValid: ZENDESK_SUBDOMAIN && ZENDESK_OAUTH_ACCESS_TOKEN,
  };
}

/**
 * Execute Phase 1 workflow
 */
async function executeWorkflow(slackApp) {
  const { SLACK_CHANNEL_ID } = process.env;

  console.log("\n" + "=".repeat(70));
  console.log(`⏰ Phase 1 Workflow Triggered - ${new Date().toISOString()}`);
  if (sectionId) {
    console.log(`📋 Mode: Scanning specific section (ID: ${sectionId})`);
  } else {
    console.log(`📋 Mode: Scanning recently edited articles`);
  }
  console.log("=".repeat(70));

  try {
    // Load approvers from Slack user group (with fallback to file)
    const approvers = await getApprovers(slackApp);

    if (approvers.length === 0) {
      console.error("❌ No approvers configured. Cannot proceed.");
      return;
    }

    const result = await executePhase1Workflow({
      zendesk: zendeskClient,
      slack: slackClient,
      slackChannelId: SLACK_CHANNEL_ID || "#scaling-helpcenter-updates",
      approversList: approvers,
      daysBack: 7,
      sectionId: sectionId, // Pass optional section ID
      runId: runId, // Pass optional run ID for progress tracking
    });

    console.log(`\n📊 Workflow result:`, result.status);
  } catch (err) {
    console.error(`\n❌ Workflow execution error:`, err.message);
  }
}

/**
 * Setup scheduled task
 */
function setupSchedule(slackApp) {
  const scheduleConfig = getPhase1Schedule();

  if (!scheduleConfig.cronExpression) {
    console.log("ℹ️  Schedule mode: MANUAL (no automatic runs)");
    console.log("   → Use 'node scheduler.js --now' to run manually");
    return;
  }

  console.log(`📅 Scheduling Phase 1 workflow`);
  console.log(`   Cron: ${scheduleConfig.cronExpression}`);
  console.log(`   Mode: ${scheduleConfig.mode}`);
  console.log(`   Timezone: ${scheduleConfig.timezone}`);

  const job = schedule.scheduleJob(
    scheduleConfig.cronExpression,
    () => executeWorkflow(slackApp)
  );

  if (!job) {
    console.error("❌ Failed to schedule job");
    process.exit(1);
  }

  console.log("✅ Workflow scheduled\n");

  // Show next run time
  const nextRun = job.nextInvocation();
  console.log(`⏭️  Next run: ${nextRun.toLocaleString()}\n`);
}

/**
 * Main entry point
 */
async function main() {
  console.log("\n🚀 Hi Marley Help Center Translation Automation");
  console.log("📌 Phase 1: Weekly Translation with Slack Approval\n");

  // Initialize clients
  const clients = await initializeClients();

  zendeskClient = clients.zendesk;
  slackClient = clients.slack;

  if (!clients.credentialsValid) {
    console.error("\n❌ Missing required credentials. Cannot start.");
    console.error("   → See .env.example for required variables");
    process.exit(1);
  }

  // Test mode: run immediately with frequent schedule
  if (testMode) {
    console.log("🧪 TEST MODE: Running once, then scheduling every 5 minutes");
    switchScheduleMode("TEST_FREQUENT");
    await executeWorkflow(slackClient);
    setupSchedule(slackClient);
  }
  // Run now mode: execute once and exit
  else if (runNow) {
    console.log("▶️  Running workflow once...");
    await executeWorkflow(slackClient);
    process.exit(0);
  }
  // Normal mode: setup schedule and wait
  else {
    setupSchedule(slackClient);
    console.log("📡 Scheduler running (press Ctrl+C to stop)");
  }
}

// Error handling
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});

main().catch((err) => {
  console.error("❌ Startup error:", err.message);
  process.exit(1);
});
