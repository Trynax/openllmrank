import { existsSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";

const SAMPLE_CONFIG = {
  brand: { name: "Acme", aliases: ["acme.com"] },
  competitors: [
    { name: "Globex", aliases: ["globex.com"] },
    { name: "Initech", aliases: ["initech.io"] },
  ],
  prompts: [
    "best AI search rank tracking tools",
    "open source alternatives to Ahrefs",
    "how do I track my brand in ChatGPT",
    "Acme vs Globex",
    "problems with AI rank tracking tools",
  ],
  providers: [{ id: "openai", model: "gpt-4o-mini" }],
  samples_per_prompt: 3,
  concurrency_per_provider: 4,
};

const SAMPLE_ENV = `# openllmrank API keys
# Get your key at https://platform.openai.com/api-keys
OPENAI_API_KEY=

# Future providers (v0.1+):
# ANTHROPIC_API_KEY=
# GOOGLE_API_KEY=
# PERPLEXITY_API_KEY=
`;

export const initCmd = defineCommand({
  meta: {
    name: "init",
    description: "Create openllmrank.config.json and .env.example in the current directory",
  },
  args: {
    force: { type: "boolean", description: "Overwrite existing config", default: false },
  },
  async run({ args }) {
    const configPath = "openllmrank.config.json";
    const envPath = ".env.example";

    if (existsSync(configPath) && !args.force) {
      console.error(`! ${configPath} already exists. Pass --force to overwrite.`);
    } else {
      writeFileSync(configPath, JSON.stringify(SAMPLE_CONFIG, null, 2) + "\n");
      console.log(`+ Wrote ${configPath}`);
    }
    if (existsSync(envPath) && !args.force) {
      console.error(`! ${envPath} already exists. Pass --force to overwrite.`);
    } else {
      writeFileSync(envPath, SAMPLE_ENV);
      console.log(`+ Wrote ${envPath}`);
    }

    console.log(`
Next:
  1. Edit ${configPath} with your brand, competitors, and prompts
  2. Copy ${envPath} to .env and add your OPENAI_API_KEY
  3. Run: openllmrank run
`);
  },
});
