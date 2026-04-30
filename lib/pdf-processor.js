/**
 * PDF Processing Utilities
 * Extract text and detect images from release notes PDFs
 */

import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Process a release notes PDF
 * Extracts text and detects which sections contain images
 * @param {string} filePath - Path to the uploaded PDF file
 * @returns {Object} - { text, totalPages, imageCount, sectionsWithImages[] }
 */
export async function processReleasePDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(dataBuffer);

  const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  const totalPages = doc.numPages;

  let fullText = "";
  let totalImageCount = 0;
  const pagesWithImages = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);

    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";

    const opList = await page.getOperatorList();
    let pageImageCount = 0;
    for (let j = 0; j < opList.fnArray.length; j++) {
      if (opList.fnArray[j] === 85 || opList.fnArray[j] === 82) {
        pageImageCount++;
      }
    }

    if (pageImageCount > 0) {
      pagesWithImages.push({ page: i, imageCount: pageImageCount });
      totalImageCount += pageImageCount;
    }
  }

  console.log(`📄 PDF processed: ${totalPages} pages, ${totalImageCount} images detected`);
  if (pagesWithImages.length > 0) {
    console.log(`   Pages with images: ${pagesWithImages.map((p) => `p${p.page}(${p.imageCount})`).join(", ")}`);
  }

  const sectionsWithImages = detectSectionsWithImages(fullText, pagesWithImages, totalImageCount);

  return {
    text: fullText.trim(),
    totalPages,
    imageCount: totalImageCount,
    sectionsWithImages,
  };
}

/**
 * Detect which feature sections likely contain images/UI changes
 */
function detectSectionsWithImages(text, pagesWithImages, imageCount) {
  if (imageCount === 0) return [];

  const sections = [];
  const availablePattern = /Available\s+[Tt]o:/g;
  let match;

  while ((match = availablePattern.exec(text)) !== null) {
    const beforeText = text.substring(Math.max(0, match.index - 200), match.index);
    const segments = beforeText.split(/\s{2,}/).filter((s) => s.trim().length > 3);

    if (segments.length > 0) {
      let title = segments[segments.length - 1].trim();
      // Fix PDF ligature artifacts
      title = title
        .replace(/con fi g/gi, "config")
        .replace(/fi g/gi, "fig")
        .replace(/fi c/gi, "fic")
        .replace(/fi n/gi, "fin")
        .replace(/fi l/gi, "fil")
        .replace(/fi r/gi, "fir")
        .replace(/fi t/gi, "fit")
        .replace(/fi x/gi, "fix")
        .replace(/fl ow/gi, "flow")
        .replace(/[:\s]+$/, "")
        .trim();

      if (title.length > 5 && title.length < 150) {
        sections.push({ title, position: match.index });
      }
    }
  }

  console.log(`   Found ${sections.length} feature sections: ${sections.map((s) => s.title).join(", ")}`);

  const uiKeywords = [
    "page", "screen", "button", "toggle", "tab", "panel", "dashboard",
    "interface", "display", "view", "layout", "design", "icon", "badge",
    "configuration", "settings", "redesign", "navigation", "inbox",
    "restriction", "media", "feature", "config",
  ];

  const sectionsWithImages = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const nextSection = sections[i + 1];
    const endPos = nextSection ? nextSection.position : text.length;
    const sectionText = text.substring(section.position, endPos).toLowerCase();

    const hasUIKeywords = uiKeywords.some((kw) => sectionText.includes(kw));
    const hasHowItWorks = sectionText.includes("how it works");

    if (hasUIKeywords || hasHowItWorks) {
      sectionsWithImages.push(section.title);
    }
  }

  if (imageCount > 0 && sectionsWithImages.length === 0 && sections.length > 0) {
    console.log(`⚠️  Found ${imageCount} images but couldn't map — flagging all sections`);
    return sections.map((s) => s.title);
  }

  return sectionsWithImages;
}

/**
 * Clean up uploaded file
 */
export function cleanupUpload(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Warning: Could not clean up file ${filePath}:`, err.message);
  }
}
