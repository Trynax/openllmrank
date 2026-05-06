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

## Architecture

- **Bun + TypeScript**, single binary via `bun build --compile`
- **SQLite** via `bun:sqlite` (zero external deps)
- **Provider contract** in `src/core/types.ts` — every provider implements the same interface
- **Normalized errors + central retry** in `src/core/runner.ts` — adapters translate provider errors to a common shape
- **Strict citation parsing** + 20+ fixture suite to prevent silent regressions

## License

MIT.
