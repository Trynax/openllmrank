import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  computePromptId,
  finishRun,
  insertCall,
  insertCitations,
  migrate,
  startRun,
  upsertPrompt,
} from "../src/core/db";
import { generateSuggestions, renderSuggestions } from "../src/core/suggest";
import type { Config } from "../src/core/types";

function memDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function fakeClient(reply: string) {
  return {
    chat: {
      completions: {
        async create() {
          return { choices: [{ message: { content: reply } }] };
        },
      },
    },
  } as never;
}

function baseConfig(): Config {
  return {
    brand: { name: "stepracers", aliases: ["stepracers.com"] },
    competitors: [
      { name: "Pacer", aliases: ["mypacer.com"] },
      { name: "MoveSpring", aliases: ["movespring.com"] },
    ],
    prompts: ["best step counting app"],
    providers: [{ id: "openai", model: "gpt-4o-mini" }],
    samples_per_prompt: 3,
    concurrency_per_provider: 4,
  };
}

describe("renderSuggestions", () => {
  test("empty list returns 'no losing prompts' message", () => {
    const md = renderSuggestions([], "stepracers");
    expect(md).toContain("No losing prompts");
  });

  test("includes prompt, competitor, and recommendations", () => {
    const md = renderSuggestions(
      [
        {
          prompt_text: "best step app",
          provider: "openai",
          brand_rate: 0,
          competitor: { name: "Pacer", rate: 1, url: "https://mypacer.com" },
          brand_url: "https://stepracers.com",
          scraped_brand: null,
          scraped_competitor: null,
          recommendations: "### Why Pacer wins\nThey have a competition feature.",
        },
      ],
      "stepracers",
    );
    expect(md).toContain("best step app");
    expect(md).toContain("Pacer");
    expect(md).toContain("100% citation rate");
    expect(md).toContain("They have a competition feature");
  });

  test("renders error suggestion with reason", () => {
    const md = renderSuggestions(
      [
        {
          prompt_text: "x",
          provider: "openai",
          brand_rate: 0,
          competitor: { name: "Pacer", rate: 1, url: null },
          brand_url: null,
          scraped_brand: null,
          scraped_competitor: null,
          recommendations: "",
          error: "no URL alias for brand",
        },
      ],
      "stepracers",
    );
    expect(md).toContain("Could not generate recommendations");
    expect(md).toContain("no URL alias for brand");
  });
});

describe("generateSuggestions error paths", () => {
  test("throws when no finished run exists", async () => {
    const db = memDb();
    let caught: unknown;
    try {
      await generateSuggestions({
        db,
        config: baseConfig(),
        client: fakeClient("ok") as never,
        model: "gpt-4o-mini",
        topN: 3,
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("No finished run");
  });

  test("returns empty when there are no losing gaps", async () => {
    const db = memDb();
    const cfg = baseConfig();
    const run_id = "r1";
    startRun(db, run_id, "h");
    const prompt_id = computePromptId("best step app", "gpt-4o-mini", "openai", {});
    upsertPrompt(db, prompt_id, "best step app", "gpt-4o-mini", "openai", "{}");
    insertCall(db, {
      run_id,
      prompt_id,
      sample_index: 0,
      response_text: "stepracers leads",
      search_results_json: "[]",
      latency_ms: 10,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0,
      error_code: null,
      error_message: null,
    });
    insertCitations(db, run_id, prompt_id, 0, [
      { brand: "stepracers", matched_text: "stepracers", kind: "name" },
    ]);
    finishRun(db, run_id);

    const out = await generateSuggestions({
      db,
      config: cfg,
      client: fakeClient("ok") as never,
      model: "gpt-4o-mini",
      topN: 3,
    });
    expect(out).toEqual([]);
  });

  test("reports error when brand has no URL alias", async () => {
    const db = memDb();
    const cfg = baseConfig();
    cfg.brand = { name: "stepracers", aliases: ["StepRacers"] };
    const run_id = "r1";
    startRun(db, run_id, "h");
    const prompt_id = computePromptId("best step app", "gpt-4o-mini", "openai", {});
    upsertPrompt(db, prompt_id, "best step app", "gpt-4o-mini", "openai", "{}");
    insertCall(db, {
      run_id,
      prompt_id,
      sample_index: 0,
      response_text: "Pacer wins",
      search_results_json: "[]",
      latency_ms: 10,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0,
      error_code: null,
      error_message: null,
    });
    insertCitations(db, run_id, prompt_id, 0, [
      { brand: "Pacer", matched_text: "Pacer", kind: "name" },
    ]);
    finishRun(db, run_id);

    const out = await generateSuggestions({
      db,
      config: cfg,
      client: fakeClient("ok") as never,
      model: "gpt-4o-mini",
      topN: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.error).toBeDefined();
    expect(out[0]?.error).toContain("no URL alias");
  });
});
