/**
 * Scheduling Configuration
 * Defines when Phase 1 (weekly translation scan) runs
 */

// SCHEDULE MODES
const SCHEDULE_MODES = {
  // Monday 9am (production)
  WEEKLY: "0 9 * * 1",

  // Every 5 minutes (testing/development)
  TEST_FREQUENT: "*/5 * * * *",

  // Every 30 minutes (staging validation)
  TEST_MODERATE: "*/30 * * * *",

  // Manual only (no automatic schedule)
  MANUAL: null,
};

// DEFAULT: Start in test mode for safety
const DEFAULT_MODE = process.env.SCHEDULE_MODE || "TEST_FREQUENT";

const SCHEDULE_CONFIG = {
  phase1_translation_scan: {
    name: "Weekly Translation Scan (Phase 1)",
    description: "Scan for articles edited in past 7 days, post approval message to Slack",
    cronExpression: SCHEDULE_MODES[DEFAULT_MODE],
    timezone: "America/Chicago", // Hi Marley company timezone
    mode: DEFAULT_MODE,
  },
  phase2_outdated_check: {
    name: "Bi-weekly Outdated Content Check (Phase 2)",
    description: "Flag potentially outdated articles based on criteria",
    cronExpression: process.env.SCHEDULE_MODE_OUTDATED || "0 9 * * 0", // Sunday 9am
    timezone: "America/Chicago",
    mode: process.env.SCHEDULE_MODE || "WEEKLY",
  },
  phase3_release_notes_check: {
    name: "Release Notes Check (Phase 3)",
    description: "Manually triggered - flag articles affected by product releases",
    cronExpression: null, // Manual only
    timezone: "America/Chicago",
    mode: "MANUAL",
  },
};

function getPhase1Schedule() {
  return SCHEDULE_CONFIG.phase1_translation_scan;
}

function switchScheduleMode(mode) {
  if (!SCHEDULE_MODES[mode]) {
    throw new Error(`Unknown schedule mode: ${mode}. Valid: ${Object.keys(SCHEDULE_MODES).join(", ")}`);
  }
  SCHEDULE_CONFIG.phase1_translation_scan.cronExpression = SCHEDULE_MODES[mode];
  SCHEDULE_CONFIG.phase1_translation_scan.mode = mode;
  console.log(`📅 Switched to ${mode} schedule: ${SCHEDULE_MODES[mode] || "MANUAL"}`);
}

function getScheduleModes() {
  return SCHEDULE_MODES;
}

export { getPhase1Schedule, switchScheduleMode, getScheduleModes, SCHEDULE_CONFIG };
