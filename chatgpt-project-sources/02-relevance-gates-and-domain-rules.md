# Source 2: Relevance Gates & Domain Rules

For each article in the batch, run it through two gates before writing any proposed copy. An article must pass BOTH gates before you write any updates.

---

## Gate 1: Category Gate — Does This Article's Domain Match?

Each article includes an "Article Location" showing its category and section (e.g., `Hi Marley Web App > Inbox` or `Integrations > Contact API Actions`). Use this location to decide which release features are even relevant to this article.

### Domain rules by article type:

**INTEGRATIONS / API / WEBHOOKS / PARTNER articles**
Only relevant to features that EXPLICITLY change:
- API endpoints or request/response payloads
- Webhook event payloads
- OAuth or SSO flows
- Setup steps for a named third-party integration (ClaimCenter, Guidewire, Salesforce, Mitchell, Snapsheet, etc.)

Web app UI changes (inbox, badges, notifications, filters, templates, away status, contact fields in the UI) are NEVER relevant to these articles — UNLESS the release notes explicitly state that the API payload or webhook event is also changing.

**OPERATOR / ADJUSTER UI articles** (Inbox, Cases, Messaging, Personal Settings, Auto Replies, Managing Personal Settings)
Relevant to web app UI changes only. Not relevant to API changes, webhook changes, or integration setup changes.

NOTE: "Managing Your Personal Settings" is an OPERATOR/ADJUSTER UI article — NOT an admin settings article — even though the title contains the word "settings." It documents personal preferences for individual operators: away status controls, notification preferences, profile display settings, and the personal settings dropdown accessible from the profile avatar. Any release that changes the personal settings dropdown, away status workflow, or operator-level notification preferences MUST check and potentially flag this article.

**ADMIN / SETTINGS articles**
Relevant to admin configuration features only.

CRITICAL SUBSECTION RULE: Admin Settings is divided into distinct subsections (Notifications, Security, Branding, Integrations, etc.). An article covering the "Notifications" subsection is ONLY relevant to notification configuration features — never to Security, OAuth, or authentication changes. An article covering "Security" is ONLY relevant to authentication, OAuth, SSO, or security features — never to notification settings. A feature in one Admin subsection NEVER affects an article from a different Admin subsection.

CRITICAL SCOPE RULE: Hi Marley configuration is nested across scopes — organization → brand → line of business → case type, plus the individual user/operator level. A release that changes configuration at ONE scope only affects articles documenting THAT scope. An organization-level change NEVER affects a brand-level or line-of-business-level article, and a brand/LOB-level change NEVER affects an organization-level article — UNLESS the release notes explicitly state the setting is configurable at more than one scope.

Read the Article Location breadcrumb to determine scope:
- `Admin > Organization > ...` → organization scope
- `Admin > Operational > Brands > [Brand] > [Line of Business] > ...` → brand / line-of-business scope

Two different articles can legitimately document the SAME feature at DIFFERENT scopes. Matching on the feature name alone is never sufficient — the scope must match too. This applies to screenshots as well: only flag a screenshot when the UI in that screenshot is the UI that actually changed, not merely a different scope's page showing the same named feature.

**POLICYHOLDER / MOBILE articles**
Relevant to policyholder-facing or mobile features only.

### If no release features match this article's domain:
Set `alreadyCovered: true`. Do not write proposed copy.

---

## Gate 2: Content Gate — Does the Article Actually Document What Changed?

For each release feature you identified as potentially relevant in Gate 1:

1. Find the **specific sentence, paragraph, or section** in the article content that documents the functionality this feature changes.
2. If you CANNOT point to specific existing text that would need to change, set `alreadyCovered: true`.
3. A vague topic overlap is NOT enough. The article must ACTUALLY DOCUMENT the specific thing the release changes.

Examples of what does NOT pass the content gate:
- The article is about "admin settings" and the release changes "admin settings" — but the article covers a completely different subsection
- The article mentions notifications generally, but the release changes a specific notification option not mentioned in the article
- The article is about a third-party integration, and the release changes the inbox UI (not that integration)

---

## Gate 3: Write the Update (articles that pass both gates)

Only articles that pass both Gate 1 and Gate 2 get proposed copy written for them.

See Source 3 (Writing & Media Guidelines) for how to write the proposed copy.

---

## What NOT to Flag — Common Mistakes

Do NOT match articles just because they share generic terms like "admin," "settings," or "configuration." The article's specific topic must directly relate to the release feature.

Do NOT flag the Inbox article for admin-only features (like Auto-Close, LOB message configuration, or template import/export) — those have their own dedicated settings articles.

Do NOT flag API documentation, webhook documentation, or developer/technical guides for operator-facing or admin UI changes (inbox, notifications, case management, settings pages).

Do NOT flag third-party integration articles (ClaimCenter, Mitchell, Salesforce, Guidewire, Snapsheet, etc.) for any release that does not explicitly change that integration's configuration, setup steps, or behavior.

Do NOT flag predeployment configuration guides or accelerator setup articles for Hi Marley product UI changes.

Do NOT classify "Managing Your Personal Settings" as an Admin article. It is an OPERATOR/ADJUSTER UI article. Any operator-facing change to the personal settings dropdown, away status, or notification preferences must check this article.

Do NOT miss the "Auto Replies" article when a release changes away message or Out of Office behavior. The Auto Replies article documents when and how auto-reply messages are sent, and any change to mandatory/optional status, defaults, or configuration requires updating it.

Do NOT recommend creating a new article if a beta or existing article on the same topic already exists. When a feature goes "GA" (generally available), update the existing beta article — remove the (Beta) label, remove beta disclaimers, update availability, add new options.

Do NOT flag a features table or reference list article as needing an update if the specific items from the release notes are already present in that table — check the content before recommending.

Do NOT flag a brand-level or line-of-business-level configuration article for a change that exists only at the organization level, or vice versa. Confirm the scope from the Article Location breadcrumb first — see the CRITICAL SCOPE RULE in Gate 1.

---

## Special Trigger Rules

**Away Status / Away Message / Out of Office:** Any release that changes away status, away message, Out of Office defaults, or the behavior/optionality of sending an auto-reply ALWAYS affects TWO specific articles:
1. "Managing Your Personal Settings" — the operator personal settings article
2. "Auto Replies" — the auto-reply/Out of Office article
Always search for and flag BOTH when this topic appears.

**New Contact or Case fields (e.g., zip code, prefix, custom fields):**
When a release adds a new field to the Contact or Case data model:
- Flag any article that contains a screenshot of the contact or case details pane
- Flag any article that lists or enumerates the available fields in the details pane
- Flag webhook event articles (especially "Contact Updated," "Case Created," "Case Updated") because the new field also appears in webhook payloads
- The correct API payload field name for Contact Prefix is `contactPrefix` (not `prefix`)

**New opt-in keywords (e.g., "oui," "si"):**
Always flag the "Opt-in & Opt-Out Workflow for Texting" article, which enumerates accepted opt-in keywords.

**New messaging tokens (e.g., $claimantprefix, $firstname):**
Always flag the "Message Template Tokens" article, which is a reference list of all available $-prefixed tokens.

**API field additions across operator endpoints:**
When a release explicitly says a field is "supported across operator APIs" or "available in operator API calls," search for and flag ALL operator API documentation articles (Update Operator, Create Operator, Get Operator, etc.).

**New UI elements named in the release notes (dropdowns, buttons, toggles, modals):**
When release notes name a specific UI element that changed, set `screenshotUpdateNeeded` context in mind — any article documenting that area of the UI likely has an outdated screenshot.

**Welcome messaging — inbound vs. outbound (Service case types):**
This distinction exists ONLY at the organization level (`Admin > Organization > Case types > Service > Welcome Messages`, which presents separate "Outbound initiated cases" and "Inbound initiated cases" cards). It does NOT exist at the brand or line-of-business level, because an organization has exactly one inbound vanity phone number — there is no way to trigger a brand-specific inbound welcome message.

Brand/LOB-level welcome message configuration (`Admin > Operational > Brands > [Brand] > [LOB] > Service`) remains a single welcome message per case type in two variants ("Not opted in" and "Opted in"), plus a separate Assignment message card and an Auto Close Cases card.

Do NOT flag "Brands & Lines of Business (Settings)" — or any other brand/LOB-scoped article — for inbound-vs-outbound welcome messaging changes, and do not flag its screenshots. Route those changes to the article documenting organization-level case type welcome message configuration.

**Address Case vs. Unread inbox modes:**
These are TWO MUTUALLY EXCLUSIVE inbox notification modes — organizations choose ONE. They do NOT run simultaneously. When updating any article referencing either mode, always note that organizations may use either Address Case or Unread. NEVER write that one "supplements" the other.
