/**
 * Shared JSON sanitizer for parsing ChatGPT/AI output.
 *
 * ChatGPT frequently produces JSON with:
 *   1. Markdown code fences  (```json ... ```)
 *   2. Unicode "smart" quotes  (" " ' ')
 *   3. Unescaped double-quotes inside string values
 *      e.g.  "reason": "Use the correct field name "contactPrefix"."
 *
 * Both manual-import (Step 1, release-notes.js) and the article analysis
 * (Step 2, scanners.js) need the same sanitisation, so it lives here.
 */

/**
 * Sanitize raw ChatGPT text and return a parsed JS value.
 * Throws a SyntaxError (from JSON.parse) if the input cannot be salvaged.
 */
export function sanitizeAndParseJson(raw) {
  // Step 1: strip markdown fences
  let text = raw.trim()
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '');

  // Step 2: replace Unicode smart quotes with ASCII equivalents
  text = text
    .replace(/[\u201C\u201D]/g, '"')   // " " → "
    .replace(/[\u2018\u2019]/g, "'");  // ' ' → '

  // Step 3: try straight parse first — it might already be valid
  try {
    return JSON.parse(text);
  } catch (_) {
    // Step 4: walk char-by-char to escape unescaped quotes inside strings
    const fixed = fixUnescapedQuotes(text);
    return JSON.parse(fixed); // throws if still invalid — caller handles
  }
}

/**
 * Walk a JSON string char-by-char and escape any double-quote that
 * appears *inside* a VALUE string but is not already escaped.
 *
 * Key insight: tracks whether the current string is a JSON KEY or VALUE.
 * In a JSON KEY string, "word": looks like end-of-key + colon (close normally).
 * In a JSON VALUE string, "word": is ALWAYS embedded content (e.g., JSON code
 * examples like "first": "Test") — it can NEVER legitimately close a value string.
 * This correctly handles patterns like:
 *   - "prefix": "Mr."  inside a proposedText value  → escape both quotes
 *   - "word1", "word2" inside a value               → escape both quotes
 *   - "value", "key":  at object level              → close value, start next key
 */
export function fixUnescapedQuotes(str) {
  let result = '';
  let escaped = false;
  let inString = false;
  let stringIsKey = false;   // true = currently inside a JSON key string
  let afterColon = false;    // true = last structural token was ':'
  let innerBraceDepth = 0;   // depth of unmatched { or [ seen inside a VALUE string

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }

    // ── OUTSIDE a string ──────────────────────────────────────────────────────
    if (!inString) {
      if (ch === '{' || ch === '[') { afterColon = false; result += ch; continue; }
      if (ch === '}' || ch === ']') { afterColon = false; result += ch; continue; }
      if (ch === ':')               { afterColon = true;  result += ch; continue; }
      if (ch === ',')               { afterColon = false; result += ch; continue; }
      if (ch === '"') {
        // Opening quote — determine key vs value from context
        stringIsKey     = !afterColon;
        inString        = true;
        afterColon      = false;
        innerBraceDepth = 0;   // reset for every new string
        result += ch;
        continue;
      }
      result += ch;
      continue;
    }

    // ── INSIDE a string ───────────────────────────────────────────────────────
    if (ch !== '"') {
      // Track { } [ ] depth inside VALUE strings to detect embedded JSON objects.
      // When innerBraceDepth > 0 we know we're inside embedded JSON, so commas
      // and closing braces that follow a quote are interior content, not structural.
      if (!stringIsKey) {
        if (ch === '{' || ch === '[') innerBraceDepth++;
        else if ((ch === '}' || ch === ']') && innerBraceDepth > 0) innerBraceDepth--;
      }
      result += ch;
      continue;
    }

    // ch === '"' — decide: close string, or escape as interior content

    // KEY strings: close on any unescaped quote
    if (stringIsKey) {
      inString = false;
      result += ch;
      continue;
    }

    // VALUE strings: need careful lookahead
    // Helper: skip whitespace and JSON escape sequences, return next real char + index
    const peek = (from) => {
      let j = from;
      while (j < str.length) {
        // Skip real whitespace characters
        if (/[ \t\r\n]/.test(str[j])) { j++; continue; }
        // Skip JSON escape sequences (\n \t \r \\ \") inside string literals
        if (str[j] === '\\' && j + 1 < str.length && /[ntr\\/"]/.test(str[j + 1])) { j += 2; continue; }
        break;
      }
      return { ch: j < str.length ? str[j] : '', idx: j };
    };

    const n1 = peek(i + 1);

    // "}" or "]" next:
    //   innerBraceDepth > 0 → this " closes an embedded string value (escape it);
    //                          the } will decrement depth when we reach it.
    //   innerBraceDepth = 0 → real end of the outer value string.
    if (n1.ch === '}' || n1.ch === ']') {
      if (innerBraceDepth > 0) {
        result += '\\"';
      } else {
        inString = false;
        result += ch;
      }
      continue;
    }

    // ':' after a quote inside a VALUE string = embedded JSON key like "field":
    // A structural value string is NEVER legitimately followed by ':'.
    if (n1.ch === ':') {
      result += '\\"';
      continue;
    }

    // ',' — could be end-of-value or interior comma
    if (n1.ch === ',') {
      // Inside an embedded JSON object/array: ALL commas are interior
      if (innerBraceDepth > 0) {
        result += '\\"';
        continue;
      }

      const n2 = peek(n1.idx + 1);

      // If the char after the comma is not a valid JSON value/structure starter,
      // the comma is interior text (e.g. "No Response Needed", which clears...).
      // Valid JSON value starters: " { [ t(rue) f(alse) n(ull) - 0-9
      if (n2.ch !== '"' && !/^[{\[tfn\-0-9]$/.test(n2.ch)) {
        result += '\\"';
        continue;
      }

      if (n2.ch !== '"') {
        // After comma: number, boolean, null, array, or object → real end-of-value
        inString = false;
        result += ch;
        continue;
      }

      // After comma: another quoted string — look at what follows IT.
      // If "word": pattern → real end-of-value (next key). Otherwise interior quoted list.
      let scanEsc = false;
      let k = n2.idx + 1;
      while (k < str.length) {
        if (scanEsc)         { scanEsc = false; k++; continue; }
        if (str[k] === '\\') { scanEsc = true;  k++; continue; }
        if (str[k] === '"')  break;
        k++;
      }
      const n3 = peek(k + 1);
      if (n3.ch === ':') {
        // "value", "key": — real end-of-value followed by next key
        inString = false;
        result += ch;
      } else {
        // "word1", "word2"... — interior quoted list
        result += '\\"';
      }
      continue;
    }

    // All other characters after quote inside a value string → interior quote
    result += '\\"';
  }

  return result;
}
