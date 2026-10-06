/**
 * Identifies Help Center articles that ARE release notes (Web App Releases,
 * Mobile App Releases, New and Notable).
 *
 * Release notes are historical records — they never need documentation updates —
 * but every release mentions many features, so they match a large share of the
 * keyword searches and each one would otherwise cost a full AI analysis call.
 */

// Production "What's New?" sections.
const RELEASE_NOTES_SECTION_IDS = new Set([
  51479412083347, // What's New? > Web App Releases
  51479412166419, // What's New? > Mobile App Releases
  51479471150739, // What's New? > New and Notable (pins the current release)
]);

/**
 * @param {{ section_id?: number|string }} article  Zendesk article (search result)
 * @param {Map<number, {sectionName?: string, categoryName?: string}>} sectionContextMap
 *        From buildSectionContextMap(); may be empty if that lookup failed.
 * @returns {boolean}
 */
export function isReleaseNotesArticle(article, sectionContextMap = new Map()) {
  const sectionId = Number(article?.section_id);
  if (RELEASE_NOTES_SECTION_IDS.has(sectionId)) return true;

  // Name-based fallback so a recreated section, or the staging brand (different
  // IDs, same names), is still caught.
  const ctx = sectionContextMap.get(article?.section_id) || sectionContextMap.get(sectionId);
  if (!ctx) return false;
  return /\breleases?\b/i.test(ctx.sectionName || "") || /what.?s new/i.test(ctx.categoryName || "");
}
