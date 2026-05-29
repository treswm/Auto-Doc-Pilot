/**
 * Screenshot Extractor
 * Extracts embedded raster screenshots from a release-enablement PDF deck.
 *
 * Approach (pure Node, no poppler/Homebrew required):
 *   - pdfjs-dist parses each page's operator list to find image XObjects
 *     (op codes 85 = paintImageXObject, 83 = paintImageMaskXObject)
 *   - page.objs.get(name, cb) yields the decoded bitmap (RGBA/RGB/grayscale)
 *   - @napi-rs/canvas encodes the bitmap to a PNG buffer
 *   - We deliberately do NOT render full pages (pdfjs's canvas path clipping
 *     is incompatible with @napi-rs/canvas). Pulling image objects directly
 *     avoids that entirely.
 *
 * Small images (icons, logos, footer marks) are filtered out by a min-size gate.
 */

import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, ImageData } from "@napi-rs/canvas";

const IMAGE_OPS = new Set([85, 83]); // paintImageXObject, paintImageMaskXObject

/**
 * Clean PDF ligature artifacts from extracted text.
 * (Mirrors the cleanup in lib/pdf-processor.js so headings read correctly.)
 */
function cleanLigatures(str) {
  return (str || "")
    .replace(/con fi g/gi, "config")
    .replace(/fi g/gi, "fig")
    .replace(/fi c/gi, "fic")
    .replace(/fi n/gi, "fin")
    .replace(/fi l/gi, "fil")
    .replace(/fi r/gi, "fir")
    .replace(/fi t/gi, "fit")
    .replace(/fi x/gi, "fix")
    .replace(/fl ow/gi, "flow")
    // PDF decks hyphenate with surrounding spaces ("opt - in", "follow - up").
    // Collapse spaced hyphens between word characters back to a normal hyphen.
    .replace(/([A-Za-z0-9]) - ([A-Za-z0-9])/g, "$1-$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a human-readable heading from a slide's text.
 * Slides typically lead with a footer line like
 * "9 | © Hi Marley Data Classification: Internal" — we skip that and take the
 * first substantive phrase (the feature name).
 */
function derivePageHeading(rawText) {
  const text = cleanLigatures(rawText);
  if (!text) return "";

  // Strip the recurring footer prefix: "<n> | © Hi Marley Data Classification: Internal"
  const stripped = text
    .replace(/^\s*\d+\s*\|\s*©?\s*Hi Marley\s*Data Classification:\s*Internal\s*/i, "")
    .trim();

  const candidate = stripped || text;
  // Heading = up to the first sentence/section break, capped to a sane length.
  // Note: deck slides use a curly apostrophe in "What's New" — match both forms.
  const firstChunk = candidate.split(/(?:\.\s|•|–|—|:\s|\bWhat['’]?s New\b|\bHow It Works\b|\b(?:Key\s+)?Benefits\b)/i)[0];
  let heading = (firstChunk || candidate).trim();
  if (heading.length > 90) heading = heading.slice(0, 90).trim();
  return heading;
}

/**
 * Resolve a pdfjs image object by name. Objects are populated asynchronously as
 * the worker decodes them; getOperatorList() kicks that off. We resolve via the
 * callback form and guard with a timeout so a stuck object never hangs the run.
 */
function getImageObject(page, name, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      page.objs.get(name, (obj) => finish(obj));
    } catch (e) {
      finish(null);
      return;
    }
    setTimeout(() => {
      try {
        finish(page.objs.has?.(name) ? page.objs.get(name) : null);
      } catch (e) {
        finish(null);
      }
    }, timeoutMs);
  });
}

/**
 * Encode a pdfjs decoded image object to a PNG buffer.
 * Handles RGBA (w*h*4), RGB (w*h*3), and grayscale (w*h) data layouts.
 * Returns null for unrecognized layouts.
 */
function encodeImageToPng(img) {
  const { width, height, data } = img;
  if (!width || !height || !data) return null;
  const len = data.length;
  let rgba;

  if (len === width * height * 4) {
    rgba = new Uint8ClampedArray(data);
  } else if (len === width * height * 3) {
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let p = 0, q = 0; p < len; p += 3, q += 4) {
      rgba[q] = data[p];
      rgba[q + 1] = data[p + 1];
      rgba[q + 2] = data[p + 2];
      rgba[q + 3] = 255;
    }
  } else if (len === width * height) {
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let p = 0, q = 0; p < len; p++, q += 4) {
      rgba[q] = rgba[q + 1] = rgba[q + 2] = data[p];
      rgba[q + 3] = 255;
    }
  } else {
    return null;
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toBuffer("image/png");
}

/**
 * Extract embedded screenshots from a PDF.
 *
 * @param {string} pdfPath - Path to the PDF file on disk
 * @param {Object} [opts]
 * @param {number} [opts.minWidth=250]  - Skip images narrower than this (icons/logos)
 * @param {number} [opts.minHeight=150] - Skip images shorter than this
 * @param {string} [opts.outDir]        - If set, PNGs are written here and `path` is populated
 * @returns {Promise<Array<{page:number,index:number,width:number,height:number,buffer:Buffer,path:(string|null),pageHeading:string,pageText:string}>>}
 */
export async function extractScreenshots(pdfPath, opts = {}) {
  const { minWidth = 250, minHeight = 150, outDir = null } = opts;

  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const totalPages = doc.numPages;

  const screenshots = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);

    // Page text (for matching + heading)
    const textContent = await page.getTextContent();
    const pageText = cleanLigatures(textContent.items.map((it) => it.str).join(" "));
    const pageHeading = derivePageHeading(pageText);

    // Image XObject names from the operator list
    const opList = await page.getOperatorList();
    const names = [];
    for (let j = 0; j < opList.fnArray.length; j++) {
      if (IMAGE_OPS.has(opList.fnArray[j])) {
        const arg = opList.argsArray[j];
        const name = arg && arg[0];
        if (typeof name === "string") names.push(name);
      }
    }

    let idxOnPage = 0;
    for (const name of names) {
      const img = await getImageObject(page, name);
      if (!img || !img.width || !img.height) continue;
      if (img.width < minWidth || img.height < minHeight) continue;

      const buffer = encodeImageToPng(img);
      if (!buffer) continue;

      idxOnPage++;
      let filePath = null;
      if (outDir) {
        const fileName = `p${pageNum}_${idxOnPage}_${img.width}x${img.height}.png`;
        filePath = path.join(outDir, fileName);
        fs.writeFileSync(filePath, buffer);
      }

      screenshots.push({
        page: pageNum,
        index: idxOnPage,
        width: img.width,
        height: img.height,
        buffer,
        path: filePath,
        pageHeading,
        pageText,
      });
    }
  }

  console.log(
    `📸 Extracted ${screenshots.length} screenshot(s) from ${totalPages}-page PDF ` +
    `(min ${minWidth}x${minHeight})`
  );
  return screenshots;
}
