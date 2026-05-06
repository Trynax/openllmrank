# openllmrank

> Track how your brand appears in answers from ChatGPT, Claude, Gemini, and Perplexity.
> Open source. Self-hosted. Bring your own API keys.

**The problem.** When users ask AI tools for product recommendations, your brand either gets cited or it doesn't. Existing AI-search-visibility tools (Profound, Athena HQ, Brand Radar) cost $200–$1000/month. You can do it yourself for the cost of API calls.

**The pitch.** A 30-second install. Define your brand, your competitors, and a list of prompts users would actually search. `openllmrank run` queries the AI APIs with web search enabled, parses citations, and writes a gap-analysis report showing where competitors get cited and you don't.

## Status

**v0** — OpenAI only (Responses API with web_search). Anthropic, Gemini, Perplexity to follow in v0.1, v0.2, v0.3.

## Quick start

```bash
bun install -g openllmrank
mkdir my-brand && cd my-brand
openllmrank init
# edit openllmrank.config.json with your brand, competitors, prompts
export OPENAI_API_KEY=sk-...
openllmrank run
openllmrank report
```

## How it works

1. You define a brand, competitors, and prompts in `openllmrank.config.json`.
2. `openllmrank run` queries each prompt against each provider with web search enabled, N times for sample variance.
3. Results are stored in a local SQLite database with content-addressed prompt IDs (so editing a prompt creates a new tracking series rather than corrupting old data).
4. `openllmrank report` generates a markdown gap-analysis: prompts where competitors are cited but you are not.

## Choosing good prompts

The quality of your insight is determined almost entirely by your prompt list. Bad prompts produce vanity metrics. Five things to know:

**Prompts that work** — these surface real visibility signal:
- **Category prompts.** "best X tools" / "top Y for Z" — the AI has to choose what to mention.
- **Alternatives prompts.** "alternatives to [a competitor]" — exposes who shows up in the long tail.
- **Persona prompts.** "fitness app where I can race friends in steps" — captures intent-driven discovery.
- **Forced-choice prompts.** "top 3 enterprise X platforms for a 500-person company" — forces a ranking.

**Prompts that don't work** — drop these from your config:
- **Named comparisons.** "X vs Y vs Z" — every brand in the prompt gets 100% citation. That's an echo, not signal.
- **Pure how-to.** "how do I set up a step challenge" — long answers, zero brand citations. The AI explains the *task*, not the *products*.
- **Pure objection.** "problems with [category]" — same thing. AI describes problems generically without naming products.

**Test:** if removing every brand name from the prompt would still produce a meaningful answer, it's a good prompt. If removing the brand name kills the prompt, it's an echo.

## After your first run

The first run is your baseline — but it usually surfaces three things to fix in your config:

1. **Competitors you didn't list.** Read 2-3 raw responses. If a brand name appears repeatedly that you didn't track, add it to your `competitors` array. Your gap analysis is undercounting until you do.
2. **Prompts that produced no citations from anyone.** Drop them and replace with category/alternatives prompts.
3. **Prompts that produced 100% citations across the board.** They contain brand names — strip the names or replace with open-ended versions.

Iterate the config 1-2 times before you treat the data as a baseline to track over time.

## Architecture

- **Bun + TypeScript**, single binary via `bun build --compile`
- **SQLite** via `bun:sqlite` (zero external deps)
- **Provider contract** in `src/core/types.ts` — every provider implements the same interface
- **Normalized errors + central retry** in `src/core/runner.ts` — adapters translate provider errors to a common shape
- **Strict citation parsing** + 20+ fixture suite to prevent silent regressions

## License

MIT.
