/**
 * Slack Approvers Manager
 * Fetches approvers from Slack User Group (@helpcenter-edit-approvers)
 * Falls back to approvers.json if Slack is unavailable
 */

import fs from "fs";

const USERGROUP_NAME = "helpcenter-edit-approvers";
const FALLBACK_APPROVERS_PATH = "config/approvers.json";

/**
 * Load approvers from Slack User Group
 * Returns array of approver objects with Slack user details
 */
async function loadApproversFromSlackUserGroup(slackApp) {
  if (!slackApp) {
    console.warn("⚠️  Slack app not initialized - using fallback approvers");
    return loadApproversFromFile();
  }

  try {
    // List all user groups to find our target group
    const groupsResult = await slackApp.client.usergroups.list();
    const targetGroup = groupsResult.usergroups?.find(
      (g) => g.handle === USERGROUP_NAME
    );

    if (!targetGroup) {
      console.warn(
        `⚠️  User group @${USERGROUP_NAME} not found in Slack`
      );
      console.warn(
        "   → Create the group in Slack and add members, then try again"
      );
      console.warn("   → Falling back to local approvers.json");
      return loadApproversFromFile();
    }

    console.log(`✅ Found Slack user group: @${USERGROUP_NAME}`);

    // Get members of the user group
    const membersResult = await slackApp.client.usergroups.users.list({
      usergroup: targetGroup.id,
    });

    const userIds = membersResult.users || [];
    console.log(`   Members: ${userIds.length} users`);

    if (userIds.length === 0) {
      console.warn(
        `⚠️  User group @${USERGROUP_NAME} has no members`
      );
      return loadApproversFromFile();
    }

    // Fetch user details for all members
    const approvers = [];
    for (const userId of userIds) {
      try {
        const userInfo = await slackApp.client.users.info({ user: userId });
        const user = userInfo.user;

        approvers.push({
          name: user.real_name || user.name || "Unknown",
          slack_user_id: userId,
          email: user.profile?.email || "unknown@himarley.com",
          role: "admin", // All members of the user group are approvers
          source: "slack_usergroup",
        });
      } catch (err) {
        console.warn(`   Could not fetch details for user ${userId}: ${err.message}`);
      }
    }

    console.log(`✅ Loaded ${approvers.length} approvers from Slack user group`);
    return approvers;
  } catch (err) {
    console.warn(
      `⚠️  Failed to load approvers from Slack: ${err.message}`
    );
    console.warn("   → Falling back to local approvers.json");
    return loadApproversFromFile();
  }
}

/**
 * Load approvers from local JSON file (fallback)
 */
function loadApproversFromFile() {
  try {
    const data = JSON.parse(
      fs.readFileSync(FALLBACK_APPROVERS_PATH, "utf-8")
    );
    const approvers = data.approvers || [];
    console.log(`✅ Loaded ${approvers.length} approvers from ${FALLBACK_APPROVERS_PATH}`);
    return approvers;
  } catch (err) {
    console.error(
      `❌ Failed to load approvers from ${FALLBACK_APPROVERS_PATH}: ${err.message}`
    );
    return [];
  }
}

/**
 * Get approvers (tries Slack first, falls back to file)
 */
async function getApprovers(slackApp) {
  const hasSendingSlackCredentials =
    process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET;

  if (!hasSendingSlackCredentials) {
    console.log("ℹ️  Slack not configured - using local approvers");
    return loadApproversFromFile();
  }

  return loadApproversFromSlackUserGroup(slackApp);
}

export { getApprovers, loadApproversFromSlackUserGroup, loadApproversFromFile };
