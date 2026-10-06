/**
 * OpenAI chat-completions call that survives rate limits.
 *
 * Why this exists: the release scan makes one gpt-4o call per candidate article,
 * back to back. On a 30k tokens-per-minute account only ~2 calls fit per minute, so
 * everything after that gets HTTP 429. This helper waits out the delay OpenAI asks
 * for and retries, so the scan slows down instead of failing. It adapts to whatever
 * limit the account has — when the OpenAI usage tier goes up, the waits just stop.
 *
 * Failures are classified so callers can react:
 *   fatal      — retrying any request will fail too (no quota left, bad API key)
 *   retryable  — transient; we already retried and ran out of attempts/time
 *   neither    — specific to this request (e.g. the prompt is too large)
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_SINGLE_WAIT_MS = 60_000;

export class OpenAIError extends Error {
  constructor(message, { status = 500, code = null, retryable = false, fatal = false } = {}) {
    super(message);
    this.name = "OpenAIError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.fatal = fatal;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// OpenAI tells us how long to wait: "Please try again in 7.98s" / "in 120ms" / "in 1m2.5s".
function parseRetryDelayMs(message, headers) {
  const retryAfter = Number(headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;

  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)(ms|s)\b/i.exec(message || "");
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const value = Number(m[2]);
  return minutes * 60_000 + (m[3].toLowerCase() === "ms" ? value : value * 1000);
}

function classify(status, apiError) {
  const code = apiError?.code || apiError?.type || null;
  const message = apiError?.message || "";

  if (code === "insufficient_quota") {
    return { fatal: true, retryable: false, code: "insufficient_quota" };
  }
  if (status === 401 || status === 403) {
    return { fatal: true, retryable: false, code: code || "auth_error" };
  }
  // A single request bigger than the whole per-minute budget can never succeed by waiting.
  if (status === 429 && /request too large/i.test(message)) {
    return { fatal: false, retryable: false, code: "request_too_large" };
  }
  if (status === 429) return { fatal: false, retryable: true, code: "rate_limit_exceeded" };
  if (status === 408 || status === 409 || status >= 500) {
    return { fatal: false, retryable: true, code: code || "upstream_error" };
  }
  return { fatal: false, retryable: false, code };
}

/**
 * @param {object} body  Chat-completions request body (model, messages, ...)
 * @param {object} [opts]
 * @param {string} [opts.label]          Used in log lines
 * @param {number} [opts.maxAttempts]    Total tries, including the first
 * @param {number} [opts.maxTotalWaitMs] Stop retrying once waits add up to this — keeps a
 *                                       single call under the ~5 min internal fetch timeout
 * @returns {Promise<object>} Parsed JSON response
 * @throws {OpenAIError}
 */
export async function chatCompletionWithRetry(
  body,
  { label = "OpenAI call", maxAttempts = 6, maxTotalWaitMs = 120_000 } = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIError("Missing OPENAI_API_KEY in environment variables", { status: 500, fatal: true, code: "missing_api_key" });
  }

  let waitedMs = 0;
  for (let attempt = 1; ; attempt++) {
    let failure;
    let delayMs = null;

    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) return await res.json();

      // Error bodies are usually JSON, but a proxy/CDN 502 can be HTML — don't let that mask the status.
      const text = await res.text().catch(() => "");
      let apiError = null;
      try { apiError = JSON.parse(text).error ?? null; } catch { /* not JSON */ }
      const message = apiError?.message || text.slice(0, 200).trim() || res.statusText || `HTTP ${res.status}`;
      failure = new OpenAIError(message, {
        status: res.status,
        ...classify(res.status, apiError),
      });
      delayMs = parseRetryDelayMs(message, res.headers);
    } catch (err) {
      if (err instanceof OpenAIError) throw err;
      // fetch() itself threw — DNS, connection reset, timeout.
      failure = new OpenAIError(`Could not reach OpenAI: ${err.message}`, { status: 502, retryable: true, code: "network_error" });
    }

    if (!failure.retryable) throw failure;

    // Server-suggested delay when we have one (+ small pad); otherwise exponential backoff with jitter.
    const backoff = Math.min(1000 * 2 ** (attempt - 1), 30_000) * (0.75 + Math.random() * 0.5);
    const waitMs = Math.min((delayMs != null ? delayMs + 250 : backoff), MAX_SINGLE_WAIT_MS);

    if (attempt >= maxAttempts || waitedMs + waitMs > maxTotalWaitMs) {
      failure.message = `${failure.message} (gave up after ${attempt} attempt${attempt === 1 ? "" : "s"})`;
      throw failure;
    }

    console.warn(`⏳ ${label}: ${failure.code} — waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt}/${maxAttempts - 1}`);
    waitedMs += waitMs;
    await sleep(waitMs);
  }
}
