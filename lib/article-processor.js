/**
 * Article Processor
 * Fetches a Zendesk Help Center article by URL, extracts plain text,
 * and detects sections that contain images — matching the output format
 * of pdf-processor.js so the rest of the analysis pipeline is unchanged.
 */

import { fetchArticle } from './zendesk-api.js';

/**
 * Extract the numeric article ID from a Zendesk Help Center URL.
 * Handles patterns like:
 *   https://himarley.zendesk.com/hc/en-us/articles/44959494040083-2-79-Release-Notes
 *   https://himarley.zendesk.com/hc/en-us/articles/44959494040083
 */
function extractArticleId(url) {
  const match = url.match(/\/articles\/(\d+)/);
  if (!match) {
    throw new Error(
      'Could not find an article ID in that URL. ' +
      'Expected a URL like https://himarley.zendesk.com/hc/en-us/articles/12345678'
    );
  }
  return match[1];
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...');
}

/**
 * Convert an HTML string to readable plain text.
 * Preserves paragraph and heading structure via newlines.
 */
export function htmlToText(html) {
  return decodeHtmlEntities(
    (html || "")
    // Remove non-visible blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Convert block-level closers to newlines before stripping tags
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
  )
    // Collapse runs of blank lines to at most two
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitHtmlByBoundaries(html, boundaryRegex) {
  const normalized = (html || "").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(boundaryRegex)
    .map((part) => part.trim())
    .filter(Boolean);
}

const CHUNK_BOUNDARY_LEVELS = [
  /(?<=<\/(?:h[1-6]|p|ul|ol|table|thead|tbody|tfoot|div|section|article|aside|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>)/gi,
  /(?<=<\/(?:li|tr|td|th)>)/gi,
  /(?<=<\/(?:span|strong|em|a|code)>|<br\s*\/?>)/gi,
];

function appendChunk(chunks, chunk, minChunkChars) {
  const trimmed = (chunk || "").trim();
  if (!trimmed) {
    return;
  }

  const previous = chunks[chunks.length - 1];
  if (previous && previous.length < minChunkChars) {
    chunks[chunks.length - 1] = `${previous}\n${trimmed}`.trim();
    return;
  }

  chunks.push(trimmed);
}

function chunkSegments(segments, level, maxChars, minChunkChars, chunks) {
  let current = "";

  for (const segment of segments) {
    if (segment.length > maxChars) {
      if (current.trim()) {
        appendChunk(chunks, current, minChunkChars);
        current = "";
      }

      const nextBoundary = CHUNK_BOUNDARY_LEVELS[level + 1];
      if (!nextBoundary) {
        chunks.push(segment);
        continue;
      }

      const finerSegments = splitHtmlByBoundaries(segment, nextBoundary);
      if (!finerSegments.length || finerSegments.length === 1) {
        chunks.push(segment);
        continue;
      }

      chunkSegments(finerSegments, level + 1, maxChars, minChunkChars, chunks);
      continue;
    }

    if (!current) {
      current = segment;
      continue;
    }

    const candidate = `${current}\n${segment}`;
    if (candidate.length <= maxChars || current.length < minChunkChars) {
      current = candidate;
    } else {
      appendChunk(chunks, current, minChunkChars);
      current = segment;
    }
  }

  if (current.trim()) {
    appendChunk(chunks, current, minChunkChars);
  }
}

/**
 * Chunk HTML using structural boundaries first, then size constraints.
 * This is optimized for retrieval/translation workflows where cutting across
 * headings, paragraphs, or table rows is worse than uneven chunk sizes.
 */
export function chunkHtml(html, options = {}) {
  const {
    maxChars = 12000,
    minChunkChars = 2000,
  } = options;

  const segments = splitHtmlByBoundaries(html, CHUNK_BOUNDARY_LEVELS[0]);
  if (!segments.length) {
    return [];
  }

  const chunks = [];
  chunkSegments(segments, 0, maxChars, minChunkChars, chunks);
  return chunks;
}

/**
 * Count all <img> tags in the HTML.
 */
function countImages(html) {
  const matches = html.match(/<img[^>]*>/gi);
  return matches ? matches.length : 0;
}

/**
 * Extract all images from article HTML with their section context and filename.
 * Zendesk stores the original uploaded filename in the alt attribute of each <img>.
 * The src URL ends in a numeric attachment ID — not human-readable — so alt is the
 * only reliable identifier.
 *
 * Walks the HTML in document order, tracking the current h2–h4 heading so each
 * image can be attributed to the section it appears in.
 *
 * @param {string} html - Raw Zendesk article HTML
 * @returns {Array<{ section: string, filename: string|null }>}
 *   section  — heading text immediately preceding the image ("Introduction" if none found)
 *   filename — value of the alt attribute (may be null if blank/missing)
 */
export function extractImagesWithSections(html) {
  const media = [];
  // Match h2–h4 headings, img tags, video tags, and iframe tags in document order
  const elementRegex = /<(h[2-4])[^>]*>([\s\S]*?)<\/h[2-4]>|<img([^>]*)>|<video([^>]*)>[\s\S]*?<\/video>|<iframe([^>]*)>/gi;
  let currentSection = 'Introduction';
  let m;

  while ((m = elementRegex.exec(html)) !== null) {
    if (m[1]) {
      // Heading — update the current section tracker
      const text = m[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      if (text) {
        currentSection = text;
      }
    } else if (m[3]) {
      // <img> tag — extract alt attribute as filename and detect .gif files
      const attrs = m[3] || '';
      const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
      const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
      const filename = altMatch ? (altMatch[1].trim() || null) : null;
      const src = srcMatch ? srcMatch[1] : '';
      const isGif = src.toLowerCase().endsWith('.gif');
      const mediaType = isGif ? 'gif' : 'image';
      
      media.push({ 
        section: currentSection, 
        filename, 
        type: mediaType,
        src: src || null
      });
    } else if (m[4]) {
      // <video> tag — extract title or data-name attribute
      const attrs = m[4] || '';
      const titleMatch = attrs.match(/title=["']([^"']*)["']/i);
      const dataNameMatch = attrs.match(/data-name=["']([^"']*)["']/i);
      const videoName = titleMatch ? titleMatch[1].trim() : (dataNameMatch ? dataNameMatch[1].trim() : 'Video (no name)');
      
      media.push({
        section: currentSection,
        filename: videoName,
        type: 'video',
        src: null
      });
    } else if (m[5]) {
      // <iframe> tag — likely YouTube/Vimeo, extract title
      const attrs = m[5] || '';
      const titleMatch = attrs.match(/title=["']([^"']*)["']/i);
      const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
      const src = srcMatch ? srcMatch[1] : '';
      const iframeName = titleMatch ? titleMatch[1].trim() : (src.includes('youtube') ? 'YouTube Video' : src.includes('vimeo') ? 'Vimeo Video' : 'Embedded Video');
      
      media.push({
        section: currentSection,
        filename: iframeName,
        type: 'video',
        src: src || null
      });
    }
  }

  return media;
}

/**
 * Find which named feature sections contain at least one <img> tag.
 *
 * Zendesk article HTML uses <h3> tags in two ways:
 *   1. Named feature headings: <h3 id="h_01...">Needs First Touch Terminology Change</h3>
 *   2. Empty anchor headings: <h3 id="h_01..."></h3>  (used for subsections like "Available to:")
 *
 * Strategy: collect only headings with visible text, then scan the HTML between
 * each consecutive pair of named headings for <img> tags. This correctly attributes
 * images (which appear after empty subsection anchors) to their parent feature section.
 */
function detectSectionsWithImages(html) {
  const sectionsWithImages = [];

  // Find all h2–h4 headings, record their text and end position
  const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
  const namedHeadings = [];
  let m;

  while ((m = headingRegex.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, '')   // strip nested tags like <a>, <strong>
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    if (text) {  // skip empty anchor headings
      namedHeadings.push({ text, contentStart: m.index + m[0].length });
    }
  }

  // For each named heading, check the HTML between it and the next named heading
  for (let i = 0; i < namedHeadings.length; i++) {
    const start = namedHeadings[i].contentStart;
    const end = i + 1 < namedHeadings.length
      ? namedHeadings[i + 1].contentStart
      : html.length;

    const sectionHtml = html.substring(start, end);

    if (/<img[^>]*>/i.test(sectionHtml)) {
      sectionsWithImages.push(namedHeadings[i].text);
    }
  }

  return sectionsWithImages;
}

/**
 * Fetch a Zendesk Help Center article by URL and process it for release
 * impact analysis. Returns the same shape as processReleasePDF() so the
 * downstream analysis pipeline requires no changes.
 *
 * @param {string} articleUrl - Full Zendesk article URL
 * @returns {Promise<{
 *   text: string,
 *   title: string,
 *   articleId: string,
 *   imageCount: number,
 *   sectionsWithImages: string[],
 *   source: 'article'
 * }>}
 */
export async function processArticleFromUrl(articleUrl) {
  const articleId = extractArticleId(articleUrl);

  console.log(`🔗 Fetching article ${articleId} from Zendesk...`);
  const article = await fetchArticle(articleId);

  if (!article || !article.body) {
    throw new Error(`Article ${articleId} was fetched but contained no body content.`);
  }

  const html = article.body;
  const text = htmlToText(html);
  const imageCount = countImages(html);
  const sectionsWithImages = detectSectionsWithImages(html);
  const imagesWithFilenames = extractImagesWithSections(html);

  console.log(`✅ Article fetched: "${article.title}"`);
  console.log(`   Text length: ${text.length} characters`);
  console.log(`   Images detected: ${imageCount}`);
  if (sectionsWithImages.length > 0) {
    console.log(`   Sections with images: ${sectionsWithImages.join(', ')}`);
  }

  return {
    text,
    title: article.title,
    articleId,
    imageCount,
    sectionsWithImages,
    imagesWithFilenames,
    source: 'article',
  };
}
