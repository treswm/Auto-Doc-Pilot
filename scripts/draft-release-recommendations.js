#!/usr/bin/env node

/**
 * Turn a release scan's recommendations into Zendesk drafts.
 *
 * Usage:
 *   npm run draft:release                         # preview the latest scan plan
 *   npm run draft:release -- --apply              # create the Zendesk drafts
 *   npm run draft:release -- --plan path/to.json --apply
 *   npm run draft:release -- --apply --default-section=123456789
 *   npm run draft:release -- --writer-context path/to/profile.json
 *
 * Existing articles are never edited. Each recommended update becomes a new,
 * unpublished draft in the original article's section. New-article
 * recommendations require a sectionId in the plan, or --default-section.
 */

import dotenv from "dotenv";
dotenv.config({ override: process.env.NODE_ENV !== "production" });

import fs from "fs";
import path from "path";
import { fetchArticle, createArticle } from "../lib/zendesk-api.js";
import { chatCompletionWithRetry } from "../lib/openai-retry.js";

const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
};
const apply = args.includes("--apply");
const defaultSectionId = getArg("--default-section");
const planPath = path.resolve(getArg("--plan") || "output/release-draft-plan.json");
const writerContextPath = path.resolve(getArg("--writer-context") || "config/article-writer-context.json");
const model = process.env.RELEASE_DRAFT_MODEL || "gpt-4o";

if (args.includes("--help") || args.includes("-h")) {
  console.log(`\nCreate Zendesk drafts from a release scan plan.\n\n` +
    `  npm run draft:release\n` +
    `  npm run draft:release -- --apply\n` +
    `  npm run draft:release -- --plan scripts/release-draft-plan.example.json\n` +
    `  npm run draft:release -- --apply --default-section=123456789\n` +
    `  npm run draft:release -- --writer-context path/to/profile.json\n\n` +
    `Without --apply, the command previews work and makes no Zendesk or OpenAI requests.\n` +
    `With --apply, it creates unpublished Zendesk drafts only; it never publishes or schedules articles.\n`);
  process.exit(0);
}

function loadWriterContext(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Writer context not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Could not parse writer context: ${err.message}`);
  }
}

function writerInstructions(context, mode) {
  const profile = JSON.stringify(context, null, 2);
  const assignment = mode === "update"
    ? "Preserve all correct source content, structure, links, and tables. Apply only the requested, release-supported edits."
    : "Write only claims supported by the supplied materials; do not invent product behavior, availability, UI labels, or configuration steps.";
  return `You are the Hi Marley Help Center article writer. Return only JSON: {"body":"complete HTML"}.\n\n${assignment}\n\nFollow this local writing profile, captured from the linked ChatGPT Help Center article writer project:\n${profile}`;
}

function loadPlan(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Draft plan not found: ${filePath}\n` +
      `Run a release scan first, or start from scripts/release-draft-plan.example.json.`
    );
  }
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Could not parse draft plan: ${err.message}`);
  }
  if (!Array.isArray(plan.updates) || !Array.isArray(plan.newArticles)) {
    throw new Error("Draft plan must contain updates and newArticles arrays.");
  }
  return plan;
}

function draftTitle(title, version) {
  const suffix = version ? ` — ${version} draft` : " — Draft";
  return `${title}${suffix}`.slice(0, 120);
}

function parseDraftBody(data, label) {
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`OpenAI returned no draft for ${label}.`);
  const text = content.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`OpenAI returned invalid draft JSON for ${label}: ${err.message}`);
  }
  if (!parsed.body || typeof parsed.body !== "string") {
    throw new Error(`OpenAI returned no HTML body for ${label}.`);
  }
  return parsed.body;
}

async function draftExistingArticle(item, plan, writerContext) {
  if (!item.articleId) throw new Error("An update recommendation is missing articleId.");
  const original = await fetchArticle(item.articleId);
  const data = await chatCompletionWithRetry({
    model,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 8000,
    messages: [
      {
        role: "system",
        content: writerInstructions(writerContext, "update"),
      },
      {
        role: "user",
        content: `Release: ${plan.release?.title || plan.release?.version || "Unknown"}\n\nRelease notes:\n${plan.release?.notes || "Not supplied"}\n\nArticle title: ${original.title}\n\nSpecific impact:\n${item.specificImpact || "Not supplied"}\n\nRequested edits:\n${JSON.stringify(item.proposedCopy || [], null, 2)}\n\nScreenshots to review (do not invent replacements):\n${JSON.stringify(item.screenshotsToUpdate || [], null, 2)}\n\nCurrent Zendesk HTML:\n${original.body || ""}`,
      },
    ],
  }, { label: `Drafting update for "${original.title}"`, maxTotalWaitMs: 240_000 });

  const body = parseDraftBody(data, original.title);
  return createArticle({
    sectionId: original.section_id,
    title: draftTitle(original.title, plan.release?.version),
    body,
    draft: true,
  });
}

async function draftNewArticle(item, plan, sectionId, writerContext) {
  if (!sectionId) {
    throw new Error(`New article "${item.title}" needs sectionId in the plan or --default-section=<id>.`);
  }
  const data = await chatCompletionWithRetry({
    model,
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 8000,
    messages: [
      {
        role: "system",
        content: writerInstructions(writerContext, "new"),
      },
      {
        role: "user",
        content: `Article title: ${item.title}\n\nWhy it is needed:\n${item.reason || "Not supplied"}\n\nSuggested placement:\n${item.suggestedPlacement || "Not supplied"}\n\nRelated features:\n${(item.relatedFeatures || []).join(", ") || "Not supplied"}\n\nRelease notes:\n${plan.release?.notes || "Not supplied"}`,
      },
    ],
  }, { label: `Drafting new article "${item.title}"`, maxTotalWaitMs: 240_000 });

  const body = parseDraftBody(data, item.title);
  return createArticle({ sectionId, title: item.title, body, draft: true });
}

const plan = loadPlan(planPath);
const writerContext = loadWriterContext(writerContextPath);
console.log(`\nRelease draft plan: ${planPath}`);
console.log(`Writer context: ${writerContextPath}`);
console.log(`Model: ${model}`);
console.log(`Existing article drafts: ${plan.updates.length}`);
console.log(`New article drafts: ${plan.newArticles.length}`);

if (!apply) {
  console.log("\nPreview only — no OpenAI or Zendesk requests were made.");
  for (const item of plan.updates) console.log(`  UPDATE COPY  #${item.articleId} ${item.title || ""}`);
  for (const item of plan.newArticles) {
    const destination = item.sectionId || defaultSectionId || "SECTION REQUIRED";
    console.log(`  NEW DRAFT    ${item.title || "Untitled"} → ${destination}`);
  }
  console.log("\nReview the plan, then add --apply to create unpublished Zendesk drafts.");
  console.log("Scheduling is not available through this script. It will never publish an article automatically.");
  process.exit(0);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sourcePlan: planPath,
  release: plan.release || {},
  created: [],
  failures: [],
};

for (const item of plan.updates) {
  try {
    const article = await draftExistingArticle(item, plan, writerContext);
    manifest.created.push({ type: "update-copy", sourceArticleId: item.articleId, id: article.id, title: article.title, url: article.html_url });
  } catch (err) {
    console.error(`❌ Could not draft update #${item.articleId}: ${err.message}`);
    manifest.failures.push({ type: "update-copy", sourceArticleId: item.articleId, error: err.message });
  }
}

for (const item of plan.newArticles) {
  try {
    const article = await draftNewArticle(item, plan, item.sectionId || defaultSectionId, writerContext);
    manifest.created.push({ type: "new-article", id: article.id, title: article.title, url: article.html_url });
  } catch (err) {
    console.error(`❌ Could not draft new article "${item.title}": ${err.message}`);
    manifest.failures.push({ type: "new-article", title: item.title, error: err.message });
  }
}

const outputDir = path.join(process.cwd(), "output");
fs.mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, `release-draft-manifest-${Date.now()}.json`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`\nCreated ${manifest.created.length} Zendesk draft(s). Manifest: ${manifestPath}`);
console.log("These are unpublished drafts. No articles were scheduled or published by this script.");
if (manifest.failures.length) {
  console.error(`${manifest.failures.length} item(s) failed; see the manifest for details.`);
  process.exitCode = 1;
}
