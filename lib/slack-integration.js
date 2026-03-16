/**
 * Slack Integration (Framework)
 * Handles all Slack bot interactions for Phase 1
 *
 * READY TO INTEGRATE: Once Slack app is approved and credentials are added to .env,
 * uncomment the @slack/bolt import and implement the actual Slack client initialization.
 */

// import { App } from "@slack/bolt";
// See SETUP_CHECKLIST.md for credentials needed

const { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID } = process.env;

let slackApp = null;
let slackReady = false;

/**
 * Initialize Slack bot
 * Call this once Slack credentials are in .env
 */
async function initializeSlackBot() {
  if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
    console.warn(
      "⚠️  Slack credentials not configured. Slack features disabled."
    );
    console.warn("   → See SETUP_CHECKLIST.md for credential setup");
    return false;
  }

  try {
    // Uncomment when ready to integrate:
    // const { App } = await import("@slack/bolt");
    // slackApp = new App({
    //   token: SLACK_BOT_TOKEN,
    //   signingSecret: SLACK_SIGNING_SECRET,
    // });
    // await slackApp.start();

    slackReady = true;
    console.log("✅ Slack bot initialized and ready");
    return true;
  } catch (err) {
    console.error("❌ Failed to initialize Slack bot:", err.message);
    return false;
  }
}

/**
 * Post approval message to Slack channel
 * Shows articles and asks for approval with interactive buttons
 */
async function postApprovalMessage(articles, approversList) {
  if (!slackReady) {
    console.warn("⚠️  Slack not ready - skipping approval message");
    return {
      status: "skipped_no_slack",
      note: "Slack not initialized",
    };
  }

  const articlesList = articles
    .map((a) => `• ${a.title} (ID: ${a.id})`)
    .join("\n");

  const approverNames = approversList.map((a) => a.name).join(", ");

  // This is the message structure that will be sent to Slack
  const messagePayload = {
    channel: SLACK_CHANNEL_ID,
    text: `📝 Weekly Translation Review - ${articles.length} articles`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📝 Weekly Translation Review",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${articles.length} articles* were edited in the past 7 days and are ready for French Canadian translation:`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: articlesList,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Awaiting approval from:* ${approverNames}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve",
              emoji: true,
            },
            value: "approve",
            action_id: "translation_approve",
            style: "primary",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Deny",
              emoji: true,
            },
            value: "deny",
            action_id: "translation_deny",
            style: "danger",
          },
        ],
      },
    ],
  };

  // When Slack is integrated, post the message:
  // const result = await slackApp.client.chat.postMessage(messagePayload);

  return {
    status: "ready_to_post",
    channel: SLACK_CHANNEL_ID,
    articleCount: articles.length,
    messageStructure: messagePayload,
    note: "Slack integration will post this message when credentials are configured",
  };
}

/**
 * Handle approval button click
 * Records the approver's decision and checks if all required approvals are received
 */
async function handleApprovalClick(userId, userName, approved, runId) {
  if (!slackReady) {
    console.warn("⚠️  Slack not ready - cannot record approval");
    return { status: "error", message: "Slack not initialized" };
  }

  console.log(
    `✅ Approval from ${userName}: ${approved ? "APPROVED" : "DENIED"}`
  );

  // Import approval manager when integrating
  // const { recordApproval } = await import("./approval-manager.js");
  // const newState = recordApproval(runId, userId, userName, approved);

  return {
    status: "recorded",
    approver: userName,
    approved,
    runId,
    note: "Will be recorded when Slack is fully integrated",
  };
}

/**
 * Send status update to Slack
 * Posts message showing current approval status
 */
async function sendStatusUpdate(runId, status) {
  if (!slackReady) {
    return { status: "skipped_no_slack" };
  }

  const message = `⏳ Translation approval status: ${status.percentComplete} complete\n${status.approvalsSoFar
    .map((a) => `  ✅ ${a.approver_name}`)
    .join("\n")}`;

  // When integrated: await slackApp.client.chat.postMessage({
  //   channel: SLACK_CHANNEL_ID,
  //   text: message,
  // });

  return {
    status: "message_ready",
    message,
  };
}

/**
 * Send completion notification
 * Posts final result message showing translated articles
 */
async function sendCompletionNotification(results) {
  if (!slackReady) {
    return { status: "skipped_no_slack" };
  }

  const emoji = results.status === "success" ? "✅" : "⚠️";
  const message =
    `${emoji} Translation workflow completed\n` +
    `Articles translated: ${results.articles_processed}\n` +
    `Cost: $${results.cost_usd?.toFixed(2) || "0.00"}`;

  // When integrated: await slackApp.client.chat.postMessage({
  //   channel: SLACK_CHANNEL_ID,
  //   text: message,
  // });

  return {
    status: "message_ready",
    message,
  };
}

/**
 * Register event handlers
 * Sets up listeners for button clicks and other interactions
 * Called by the main scheduler when Slack is ready
 */
async function registerEventHandlers(handlers) {
  if (!slackApp) {
    console.warn("⚠️  Slack app not initialized - event handlers not registered");
    return;
  }

  // When integrated, register handlers:
  // slackApp.action("translation_approve", async ({ body, ack, say }) => {
  //   await ack();
  //   const { user, payload } = body;
  //   handlers.onApprove(user.id, user.name, payload);
  // });

  // slackApp.action("translation_deny", async ({ body, ack, say }) => {
  //   await ack();
  //   const { user, payload } = body;
  //   handlers.onDeny(user.id, user.name, payload);
  // });

  console.log(
    "⚠️  Event handlers framework ready. Will activate when Slack is configured."
  );
}

export {
  initializeSlackBot,
  postApprovalMessage,
  handleApprovalClick,
  sendStatusUpdate,
  sendCompletionNotification,
  registerEventHandlers,
};
