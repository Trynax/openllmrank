import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { defineCommand } from "citty";
import { ConfigSchema, type Config } from "../core/types";
import { getCallsSince, getCitationsSince, getPrompts, openDb } from "../core/db";
import { computeGap, computeRates, renderGapReport } from "../core/gap";

function loadConfig(path: string): Config {
  if (!existsSync(path)) {
    console.error(`! ${path} not found.`);
    process.exit(1);
  }
  const parsed = ConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return parsed;
}

function parseSince(spec: string): string {
  const match = /^(\d+)([hd])$/.exec(spec);
  if (match) {
    const n = Number.parseInt(match[1]!, 10);
    const unit = match[2];
    const ms = unit === "h" ? n * 60 * 60 * 1000 : n * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - ms).toISOString();
  }
  const d = new Date(spec);
  if (Number.isNaN(d.getTime())) {
    console.error(`! Invalid --since value '${spec}'. Try '7d', '24h', or an ISO timestamp.`);
    process.exit(1);
  }
  return d.toISOString();
}

export const reportCmd = defineCommand({
  meta: {
    name: "report",
    description: "Generate a markdown gap-analysis report from stored runs",
  },
  args: {
    config: { type: "string", default: "openllmrank.config.json" },
    db: { type: "string", default: "data/openllmrank.db" },
    since: { type: "string", default: "7d" },
    output: { type: "string", default: "gap-report.md" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config);
    const db = openDb(args.db);
    const since_iso = parseSince(args.since);
    const calls = getCallsSince(db, since_iso);
    const citations = getCitationsSince(db, since_iso);
    const prompt_ids = Array.from(new Set(calls.map((c) => c.prompt_id)));
    const prompts = getPrompts(db, prompt_ids);

    const brand_names = [cfg.brand.name, ...cfg.competitors.map((c) => c.name)];
    const rates = computeRates(calls, citations, prompts, brand_names);
    const gaps = computeGap(
      rates,
      cfg.brand.name,
      cfg.competitors.map((c) => c.name),
    );
    const md = renderGapReport(gaps, cfg.brand.name, since_iso);
    writeFileSync(args.output, md);
    console.log(`+ Wrote ${args.output}`);
    if (calls.length === 0) {
      console.log(`(No data in window since ${since_iso}. Run 'openllmrank run' first.)`);
    } else {
      console.log(`Window: ${calls.length} calls, ${citations.length} citation rows.`);
    }
  },
});
