/**
 * Approval Manager
 * Tracks translation approvals from the approvers list
 * Persists state to allow approvals across sessions
 */

import fs from "fs";
import path from "path";

const STATE_FILE = "config/approval_state.json";

function initializeApprovalState() {
  return {
    current_run_id: null,
    run_timestamp: null,
    articles: [], // [ { id, title, status: "pending|approved|denied", votes: {...} }, ... ]
    approvals_received: [],
    approvals_needed: [],
    all_approved: false,
    denied_articles: [],
    created_at: new Date().toISOString(),
  };
}

function loadApprovalState() {
  if (!fs.existsSync(STATE_FILE)) {
    return initializeApprovalState();
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    console.warn("⚠️  Could not parse approval state, starting fresh");
    return initializeApprovalState();
  }
}

function saveApprovalState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function createNewApprovalRound(runId, articlesToApprove, approversList) {
  const state = initializeApprovalState();
  state.current_run_id = runId;
  state.run_timestamp = new Date().toISOString();

  // Initialize articles with pending status
  state.articles = articlesToApprove.map((article) => ({
    id: article.id,
    title: article.title,
    status: "pending",
    votes: {}, // { approver_user_id: { approved: true/false, timestamp, name } }
  }));

  // Track which approvers must approve
  state.approvals_needed = approversList
    .filter((a) => a.role === "admin")
    .map((a) => a.slack_user_id);

  saveApprovalState(state);
  return state;
}

function recordApproval(runId, approverId, approverName, approved) {
  const state = loadApprovalState();

  if (state.current_run_id !== runId) {
    throw new Error(
      `Approval for wrong run. Current: ${state.current_run_id}, received: ${runId}`
    );
  }

  // Record that this approver voted
  state.approvals_received.push({
    approver_id: approverId,
    approver_name: approverName,
    approved,
    timestamp: new Date().toISOString(),
  });

  // Check if all admin approvers have voted
  const allApproversVoted = state.approvals_needed.every((adminId) =>
    state.approvals_received.some((vote) => vote.approver_id === adminId)
  );

  // Check if any admin disapproved
  const anyDisapproved = state.approvals_received.some(
    (vote) => !vote.approved && state.approvals_needed.includes(vote.approver_id)
  );

  if (anyDisapproved) {
    state.all_approved = false;
  } else if (allApproversVoted) {
    state.all_approved = true;
  }

  saveApprovalState(state);
  return state;
}

function getApprovalStatus(runId) {
  const state = loadApprovalState();

  if (state.current_run_id !== runId) {
    return null; // No active approval for this run
  }

  return {
    runId: state.current_run_id,
    articles: state.articles,
    approvalsSoFar: state.approvals_received,
    approvalsNeeded: state.approvals_needed,
    allApproved: state.all_approved,
    percentComplete: `${Math.round(
      (state.approvals_received.length / state.approvals_needed.length) * 100
    )}%`,
  };
}

function markApprovalComplete(runId) {
  const state = loadApprovalState();
  if (state.current_run_id === runId) {
    state.current_run_id = null;
  }
  saveApprovalState(state);
}

export {
  loadApprovalState,
  saveApprovalState,
  createNewApprovalRound,
  recordApproval,
  getApprovalStatus,
  markApprovalComplete,
};
