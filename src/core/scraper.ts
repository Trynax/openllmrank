import { load } from "cheerio";

export type ScrapedPage = {
  url: string;
  status: number;
  title: string;
  content: string;
  ok: boolean;
  reason?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 8_000;
// Many sites 403 unbranded crawlers. Use a realistic Chrome UA so public marketing
// pages return content. We also send Accept and Accept-Language headers that real
// browsers include; missing these is a common bot-detection signal.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "iframe",
  "svg",
  "[aria-hidden='true']",
  ".cookie-banner",
  "#cookie-banner",
];

const MAIN_SELECTORS = ["main", "article", "[role='main']", ".content", "#content", ".post", "body"];

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n").trim();
}

function looksLikelyJsRendered(html: string, extractedChars: number): boolean {
  if (extractedChars >= 200) return false;
  const lower = html.toLowerCase();
  const hints = ["__next_data__", "ng-version", '"react"', "data-reactroot", "id=\"root\"", "id=\"app\""];
  return hints.some((h) => lower.includes(h));
}

export async function scrape(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ScrapedPage> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return {
        url,
        status: res.status,
        title: "",
        content: "",
        ok: false,
        reason: `HTTP ${res.status}`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return {
        url,
        status: res.status,
        title: "",
        content: "",
        ok: false,
        reason: `non-HTML content-type: ${ct}`,
      };
    }
    const html = await res.text();
    const parsed = extract(html);
    if (parsed.content.length < 200 && looksLikelyJsRendered(html, parsed.content.length)) {
      return {
        url,
        status: res.status,
        title: parsed.title,
        content: parsed.content,
        ok: false,
        reason: "likely JS-rendered (extracted < 200 chars; SPA markers present)",
      };
    }
    return {
      url,
      status: res.status,
      title: parsed.title,
      content: parsed.content,
      ok: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      status: 0,
      title: "",
      content: "",
      ok: false,
      reason: ctrl.signal.aborted ? `timeout after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extract(html: string): { title: string; content: string } {
  const $ = load(html);
  for (const sel of STRIP_SELECTORS) $(sel).remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").trim();

  let bestText = "";
  for (const sel of MAIN_SELECTORS) {
    const node = $(sel).first();
    if (node.length === 0) continue;
    const text = collapseWhitespace(node.text());
    if (text.length > bestText.length) bestText = text;
    if (bestText.length > 1500) break;
  }

  if (bestText.length === 0) bestText = collapseWhitespace($("body").text());

  if (bestText.length > MAX_CONTENT_CHARS) {
    bestText = bestText.slice(0, MAX_CONTENT_CHARS) + "\n\n[...truncated]";
  }
  return { title, content: bestText };
}
