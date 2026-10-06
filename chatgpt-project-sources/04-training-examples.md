# Source 4: Past Decisions & Training Examples

These are real, human-reviewed examples of how release features should map to Help Center article decisions. Use them to calibrate your recommendations.

---

## Positive Examples — Correct Decisions

### Example 1: Phone Number Change Workflow (Release 2.84)
**Release feature:** When an operator updates a customer's phone number on a case, Hi Marley now captures and records the change across multiple touchpoints — system messages, Case Event Log, and a Contact Updated Webhook.

**Correct decision:** `update_existing` — "How Do I Change the Phone Number on a Claim?"

**Why:** This is the only article that documents the phone number change workflow. The release adds new behavior (logging, audit trail, webhook) to the exact process this article describes. The specific article text describing what happens when you change a phone number now needs to include the new audit and webhook behavior.

**Search queries that work:** "phone number," "change phone," "phone number on a claim"

---

### Example 2: Inbox Badge — Internal Messages Toggle (Release 2.84)
**Release feature:** Operators can now choose to exclude internal messages from their Unread badge count. The setting can be configured at the organization level and at the individual user profile level.

**Correct decision:** `update_existing` — "Managing Your Personal Settings"

**Why:** This article documents personal settings including inbox notification preferences. The new toggle for excluding internal messages from Unread count is configured in personal settings, which is exactly what this article covers. Both the text describing the Inbox Notifications section and the screenshot of that panel need updating.

**Key lesson:** "Managing Your Personal Settings" is an OPERATOR/ADJUSTER UI article, not an admin article. Any release that touches operator-level notification preferences in personal settings must flag this article.

**Search queries that work:** "personal settings," "inbox notifications," "unread badge," "internal messages"

---

### Example 3: New Media Restrictions Settings (Release 2.84)
**Release feature:** New inbound media restriction settings let organizations define which file types policyholders can send into Hi Marley conversations.

**Correct decision:** `create_new` — entirely new article titled "Media Restrictions Settings"

**Why:** No existing article covered inbound media restrictions. This is a brand new feature with its own settings page (Settings > Organization > Media Restrictions), so it needs a dedicated article rather than an update to an existing one.

**Important follow-up:** After this article was created, subsequent analyses should find it via search queries like "media restrictions settings" and recommend `update_existing`, not `create_new`.

---

### Example 4: Away Status in Personal Settings Dropdown (Release 2.85)
**Release feature:** Operators can now set themselves as Away directly from the Personal Settings Dropdown next to their profile avatar, without navigating to the full settings page.

**Correct decision:** `update_existing` — "Managing Your Personal Settings"

**Why:** This article documents where and how operators set their away status. The release changes the location of that control (now accessible from the profile avatar dropdown directly), which means the instructional text AND screenshots showing the old flow are outdated.

**Key lesson:** Away status changes always require checking "Managing Your Personal Settings." The UI change also means screenshots need updating — this is a `screenshotUpdateNeeded` situation.

**Search queries that work:** "personal settings," "away status," "available away," "profile avatar"

---

### Example 5: Out of Office / Auto Reply Changes (Release 2.85)
**Release feature:** Carrier admins can now set a default Out of Office message and default status for their organization. Operators are no longer required to provide an Out of Office message when setting status to Away.

**Correct decisions:** BOTH of these articles need updating:
1. `update_existing` — "Managing Your Personal Settings" — the away status workflow changed
2. `update_existing` — "Auto Replies" — the behavior of when/whether an auto-reply is sent has fundamentally changed

**Key lesson:** Away message / Out of Office changes ALWAYS affect both articles. Never flag one without checking the other.

---

### Example 6: New Opt-In Keyword "Oui" (Release 2.85)
**Release feature:** Hi Marley now supports "oui" as an accepted opt-in keyword for French-speaking policyholders.

**Correct decision:** `update_existing` — "Opt-in & Opt-Out Workflow for Texting"

**Why:** This article enumerates the accepted opt-in keywords. When a new keyword is added, the list in this article must be updated. Specifically the sections "Step 3: Customer Confirmation" and "Option 5a: Inbound Text Message" needed updating to include "oui" alongside "yes," "yes!," and "si."

**Search queries that work:** "opt-in," "opt-out," "opt in keyword," "texting," "text messaging consent"

---

### Example 7: Contact Prefix Webhook Impact (Release 2.85)
**Release feature:** A new Contact Prefix field (e.g., Mr., Ms., Dr.) is now available during case creation. Release notes explicitly state: "Set and retrieved via API" and "fully supported via API."

**Correct decision:** `update_existing` — "Event ID 30: Contact Updated" (webhook article)

**Why:** The phrases "Set and retrieved via API" and "fully supported via API" in release notes are explicit signals that API and webhook documentation must be updated. The contact update webhook payload now includes the `contactPrefix` field. The correct payload field name is `contactPrefix` (not `prefix`).

**Key lesson:** When release notes say "set and retrieved via API," "supported via API," "fully supported via API," or similar — ALWAYS flag the relevant webhook event articles for payload updates. This is the exception to the rule that UI changes don't affect API docs: when a new field is added to the Contact or Case data model, it appears in both the UI AND the webhook payloads.

**Search queries that work:** "contact updated," "contact API," "event ID contact," "event ID 30," "contact prefix"

---

### Example 8: New Messaging Token $claimantprefix (Release 2.85)
**Release feature:** A new messaging token `$claimantprefix` allows operators to insert the Contact Prefix into message templates.

**Correct decision:** `update_existing` — "Message Template Tokens"

**Why:** The Message Template Tokens article is a reference list of every available $-prefixed token. Whenever a new token is introduced, this article must be updated to add the token, its description, and a usage example.

**Search queries that work:** "message template tokens," "message tokens," "template variables," "$claimantprefix"

---

### Example 9: identityProviderId Across Operator APIs (Release 2.85)
**Release feature:** The `identityProviderId` field is now fully supported across all operator-related API endpoints.

**Correct decision:** `update_existing` — "Update Operator API"

**Why:** When a release states that a new field is "supported across operator APIs" or "available in operator API calls," ALL operator API documentation articles (Update Operator, Create Operator, Get Operator) must be updated to add the new field to their parameters tables and payload examples.

**Key lesson:** "Supported across operator APIs" is a signal to search for and flag ALL operator API documentation articles.

**Search queries that work:** "operator API," "update operator," "create operator," "operator endpoint," "identityProviderId"

---

### Example 10: Inbox Quick Filters (Release 2.79)
**Release feature:** New quick filter buttons added to the inbox empty state — "Needs First Touch," "Needs Attention" (Coaching Carriers only), and "Has a Question."

**Correct decision:** `update_existing` — "Inbox"

**Why:** The Inbox article is the canonical documentation for the inbox UI. Quick Filters are a new UI element that appears directly in the inbox empty state, so this is the right article to document them. Screenshot of the inbox empty state also needs updating.

**Search queries that work:** "inbox," "quick filters," "needs first touch," "needs attention," "has a question," "inbox filters"

---

### Example 11: Terminology Change — Needs First Touch (Release 2.79)
**Release feature:** "Unanswered Case" and "Unanswered Opt-In" are being renamed to "Needs First Touch" across the app and Insights dashboards.

**Correct decision:** `update_existing` — "Inbox"

**Why:** The Inbox article uses the old terminology throughout. All references to "Unanswered Case" and "Unanswered Opt-In" must be updated to "Needs First Touch." Also affects the Message Type filter description and Insights references in the same article.

**Key lesson:** Terminology/rename changes affect EVERY article that uses the old term — do not miss references in filters, tags, and Insights descriptions.

---

## Negative Examples — Mistakes to Avoid

### Negative Example 1: Wrong article matched on generic term (Release 2.84)
**Release feature:** Inbound Media Restriction Configuration

**WRONG:** Flagging "Admin Responsibilities for Conversational FNOL" for updating

**Why it was wrong:** The AI matched this article because both mention admin settings. But this article is specifically about Conversational FNOL (First Notice of Loss) — a completely separate product. There is no mention of media restrictions in this article. Generic terms like "admin" or "configuration" are not enough — the article's SPECIFIC TOPIC must relate to the release feature.

**Lesson:** Do NOT match articles about unrelated features just because they share generic terms. "Admin Responsibilities for Conversational FNOL" is about CFNOL onboarding, not media restrictions.

---

### Negative Example 2: Recommended create_new when article already existed (Release 2.84)
**Release feature:** Inbound Media Restriction Configuration

**WRONG:** Recommending `create_new` for a Media Restrictions article when "Media Restrictions Settings" already existed in the Help Center

**Why it was wrong:** The analysis ran AFTER the article was already created for this feature. A search query of "media restrictions settings" would have found it. When an existing article covers the same topic, the correct action is `update_existing`, not `create_new`.

**Lesson:** Always generate specific enough search queries to find an existing article if one was created for this topic. A `create_new` recommendation should only be made when search confirms NO existing article covers the topic.

---

### Negative Example 3: Flagged article for content already present (Release 2.84)
**Release feature:** Additional Feature Configurations Added to Feature Page (Auto-Resend Welcome Message, Failed Message Status Display, Manual Case Creation)

**WRONG:** Recommending updates to "Features Configurations (Settings)" when those features were already documented in the article's features table

**Why it was wrong:** The analysis assumed the article needed updating without checking whether the specific features from the release notes were already listed in the features table. They were already there.

**Lesson:** When recommending an update to a features list or reference table article, always check whether the specific items from the release notes are already present in the article content. If they are, mark the article as already covered — do NOT flag it as needing an update.

---

### Negative Example 4: Right feature, wrong configuration scope
**Release feature:** Separate Inbound and Outbound Welcome Messaging for Service Case Types

**WRONG:** Flagging "Brands & Lines of Business (Settings)" for updating — including flagging one of its screenshots for replacement

**Why it was wrong:** The inbound vs. outbound welcome message split is an ORGANIZATION-level change (`Admin > Organization > Case types > Service > Welcome Messages`). The flagged article documents welcome message configuration at the BRAND and LINE OF BUSINESS level, which did not change — it remains a single welcome message per case type in two variants ("Not opted in" / "Opted in"), plus a separate Assignment message and Auto Close Cases card. Both articles are Admin/Settings articles that discuss welcome messages per case type, which is why they got matched, but they document DIFFERENT SCOPES of the configuration hierarchy. Product confirmed a brand cannot configure its own inbound welcome message at all, because an organization has exactly one inbound vanity phone number — so a brand-specific inbound welcome can never be triggered.

**Lesson:** Matching on the feature name is not enough — the CONFIGURATION SCOPE must match too. Check the Article Location breadcrumb to establish scope before flagging: `Admin > Organization > ...` is organization scope, `Admin > Operational > Brands > ...` is brand/LOB scope. An organization-level change never affects a brand/LOB article and vice versa, unless the release notes explicitly say the setting is configurable at more than one scope. Screenshots follow the same rule — a different scope's page showing the same named feature is not outdated.

---

## Decision Patterns Summary

### Update Existing — signals:
- The release modifies an existing workflow or process
- The release adds options to an existing settings page
- The release changes how an existing feature behaves
- There is already an article that describes the affected area
- The release renames a UI label or terminology referenced in existing articles

### Create New — signals:
- The release introduces a brand new settings page
- The release adds a feature with no conceptual overlap with existing articles
- No existing article covers this topic even partially
- The feature is significant enough to warrant its own standalone article
- (Note: only use `create_new` when you've confirmed no existing article covers the topic)

### Already Covered — signals:
- The article's domain doesn't match the release feature
- You cannot find specific text in the article that would need changing
- The article's subsection covers a different area than what the release changed
- The article documents a different configuration scope than the one the release changed (e.g. brand/LOB level when the change is organization level)
- The specific items in the release notes are already documented in the article
