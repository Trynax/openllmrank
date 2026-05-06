import OpenAI from "openai";
import type { Database } from "bun:sqlite";
import { findLatestFinishedRun, getCallsSince, getCitationsSince, getPrompts } from "./db";
import { computeGap, computeRates, type GapRow } from "./gap";
import { scrape, type ScrapedPage } from "./scraper";
import type { Brand, Config } from "./types";

export type Suggestion = {
  prompt_text: string;
  provider: string;
  brand_rate: number;
  competitor: { name: string; rate: number; url: string | null };
  brand_url: string | null;
  scraped_brand: ScrapedPage | null;
  scraped_competitor: ScrapedPage | null;
  recommendations: string;
  error?: string;
};

function pickUrlFromAliases(brand: Brand): string | null {
  for (const alias of [brand.name, ...brand.aliases]) {
    if (/\.[a-z]{2,}/i.test(alias) && !/\s/.test(alias)) {
      return alias.startsWith("http") ? alias : `https://${alias}`;
    }
  }
  return null;
}

function findTopCompetitorUrl(
  db: Database,
  run_id: string,
  prompt_id: string,
  competitor: Brand,
): string | null {
  const aliases = [competitor.name, ...competitor.aliases]
    .map((a) => a.toLowerCase())
    .filter((a) => /\.[a-z]{2,}/i.test(a) && !/\s/.test(a));

  const rows = db
    .query<{ matched_text: string }, [string, string, string]>(
      `SELECT matched_text FROM citations
       WHERE run_id = ? AND prompt_id = ? AND brand = ? AND kind IN ('grounded_source','url')`,
    )
    .all(run_id, prompt_id, competitor.name);

  if (rows.length > 0) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      let url = r.matched_text;
      if (!url.startsWith("http")) url = `https://${url}`;
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (aliases.length > 0) {
      const matching = sorted.find(([u]) => aliases.some((a) => u.toLowerCase().includes(a)));
      if (matching) return matching[0];
    }
    if (sorted[0]) return sorted[0][0];
  }

  if (aliases[0]) {
    const a = aliases[0];
    return a.startsWith("http") ? a : `https://${a}`;
  }
  return null;
}

function buildSuggestPrompt(
  brand_name: string,
  brand_url: string,
  brand_content: string,
  competitor_name: string,
  competitor_url: string,
  competitor_content: string,
  query: string,
): string {
  return `You are a content strategy advisor analyzing AI-search visibility.

CONTEXT
The user's brand is "${brand_name}" (${brand_url}).
A competitor "${competitor_name}" (${competitor_url}) was cited 100% of the time when an LLM was asked: "${query}".
The user's brand was cited 0% of the time for the same query.

COMPETITOR PAGE CONTENT (${competitor_url}):
---
${competitor_content || "(no content extracted)"}
---

USER'S PAGE CONTENT (${brand_url}):
---
${brand_content || "(no content extracted)"}
---

YOUR TASK
Be a sharp content strategist. Output a markdown analysis with these exact sections:

### Why "${competitor_name}" wins this query
2-3 sentences. Be specific. Quote phrases from the competitor page where relevant. No generic SEO advice.

### Concrete content gaps
List the 3-5 most important things the competitor has that the user doesn't. Each item must:
- Cite specific competitor content (a phrase, a section, a feature mentioned)
- Explain why it matters for the query "${query}"
- Be observable, not abstract

### Specific recommendations for ${brand_name}
3-5 actionable recommendations. Each must:
- Name a specific page, section, or content piece to add or change
- Explain what to write (not just "improve content")
- Be small enough to ship in a week

Keep total output under 600 words. No fluff. No "in conclusion."`;
}

export async function generateSuggestions(opts: {
  db: Database;
  config: Config;
  client: OpenAI;
  model: string;
  topN: number;
  promptFilter?: string;
}): Promise<Suggestion[]> {
  const run_id = findLatestFinishedRun(opts.db);
  if (!run_id) {
    throw new Error("No finished run found. Run 'openllmrank run' first.");
  }

  const since = "1970-01-01T00:00:00Z";
  const calls = getCallsSince(opts.db, since).filter((c) => c.run_id === run_id);
  const citations = getCitationsSince(opts.db, since).filter((c) => c.run_id === run_id);
  const prompt_ids = Array.from(new Set(calls.map((c) => c.prompt_id)));
  const prompts = getPrompts(opts.db, prompt_ids);

  const brand_names = [opts.config.brand.name, ...opts.config.competitors.map((c) => c.name)];
  const rates = computeRates(calls, citations, prompts, brand_names);
  const allGaps = computeGap(
    rates,
    opts.config.brand.name,
    opts.config.competitors.map((c) => c.name),
  );

  let gaps: GapRow[] = allGaps.filter((g) => g.gap_score > 0);
  if (opts.promptFilter) {
    gaps = gaps.filter((g) =>
      g.prompt_text.toLowerCase().includes(opts.promptFilter!.toLowerCase()),
    );
  }
  gaps = gaps.slice(0, opts.topN);

  if (gaps.length === 0) {
    return [];
  }

  const brand_url = pickUrlFromAliases(opts.config.brand);
  const scraped_brand = brand_url ? await scrape(brand_url) : null;

  const out: Suggestion[] = [];
  for (const gap of gaps) {
    const competitorName = gap.competitors[0]?.name;
    const competitorObj = opts.config.competitors.find((c) => c.name === competitorName);
    if (!competitorName || !competitorObj) {
      out.push({
        prompt_text: gap.prompt_text,
        provider: gap.provider,
        brand_rate: gap.brand_rate,
        competitor: { name: competitorName ?? "(none)", rate: 0, url: null },
        brand_url,
        scraped_brand,
        scraped_competitor: null,
        recommendations: "",
        error: "No top competitor found in config",
      });
      continue;
    }
    const competitorRate = gap.competitors[0]?.rate ?? 0;
    const competitorUrl = findTopCompetitorUrl(opts.db, run_id, gap.prompt_id, competitorObj);

    const scraped_competitor = competitorUrl ? await scrape(competitorUrl) : null;

    if (!brand_url || !scraped_brand?.ok || !scraped_competitor?.ok) {
      const reasons: string[] = [];
      if (!brand_url) reasons.push("no URL alias for brand");
      if (brand_url && !scraped_brand?.ok) reasons.push(`brand fetch: ${scraped_brand?.reason ?? "?"}`);
      if (!competitorUrl) reasons.push("no cited URL for competitor");
      if (competitorUrl && !scraped_competitor?.ok)
        reasons.push(`competitor fetch: ${scraped_competitor?.reason ?? "?"}`);
      out.push({
        prompt_text: gap.prompt_text,
        provider: gap.provider,
        brand_rate: gap.brand_rate,
        competitor: { name: competitorName, rate: competitorRate, url: competitorUrl },
        brand_url,
        scraped_brand,
        scraped_competitor,
        recommendations: "",
        error: reasons.join("; "),
      });
      continue;
    }

    const llmPrompt = buildSuggestPrompt(
      opts.config.brand.name,
      brand_url,
      scraped_brand.content,
      competitorName,
      scraped_competitor.url,
      scraped_competitor.content,
      gap.prompt_text,
    );

    try {
      const response = await opts.client.chat.completions.create({
        model: opts.model,
        messages: [{ role: "user", content: llmPrompt }],
        temperature: 0.3,
      });
      const recommendations =
        response.choices[0]?.message?.content?.trim() ?? "(no recommendations returned)";
      out.push({
        prompt_text: gap.prompt_text,
        provider: gap.provider,
        brand_rate: gap.brand_rate,
        competitor: { name: competitorName, rate: competitorRate, url: competitorUrl },
        brand_url,
        scraped_brand,
        scraped_competitor,
        recommendations,
      });
    } catch (e) {
      out.push({
        prompt_text: gap.prompt_text,
        provider: gap.provider,
        brand_rate: gap.brand_rate,
        competitor: { name: competitorName, rate: competitorRate, url: competitorUrl },
        brand_url,
        scraped_brand,
        scraped_competitor,
        recommendations: "",
        error: `LLM call failed: ${(e as Error).message ?? e}`,
      });
    }
  }
  return out;
}

export function renderSuggestions(suggestions: Suggestion[], brand_name: string): string {
  const lines: string[] = [];
  lines.push(`# Content suggestions: ${brand_name}`);
  lines.push("");
  lines.push(`_Generated by openllmrank suggest. Based on the latest run._`);
  lines.push("");
  if (suggestions.length === 0) {
    lines.push("No losing prompts found in the latest run. Either you're winning everything (unlikely) or the data is empty.");
    return lines.join("\n");
  }
  for (const s of suggestions) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${s.prompt_text}`);
    lines.push("");
    lines.push(
      `**${s.competitor.name}** wins (${(s.competitor.rate * 100).toFixed(0)}% citation rate). You: ${(s.brand_rate * 100).toFixed(0)}%.`,
    );
    lines.push("");
    if (s.brand_url) lines.push(`- Your URL: ${s.brand_url}`);
    if (s.competitor.url) lines.push(`- Competitor URL analyzed: ${s.competitor.url}`);
    lines.push("");
    if (s.error) {
      lines.push(`> Could not generate recommendations: ${s.error}`);
      lines.push("");
      continue;
    }
    lines.push(s.recommendations);
    lines.push("");
  }
  return lines.join("\n");
}
