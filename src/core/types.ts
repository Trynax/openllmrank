import { z } from "zod";

export type ProviderId = "openai" | "anthropic" | "google" | "perplexity";

export const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "google", "perplexity"];

export type ProviderErrorKind =
  | "transient"
  | "rate_limit"
  | "auth"
  | "bad_request"
  | "unknown";

export type ProviderError = {
  kind: ProviderErrorKind;
  retry_after_ms?: number;
  http_status?: number;
  message: string;
  raw: unknown;
};

export type GroundedSource = {
  url: string;
  title?: string;
  snippet?: string;
};

export type ProviderResult = {
  response_text: string;
  search_results: GroundedSource[];
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
};

export type ProviderQueryArgs = {
  prompt: string;
  model: string;
  signal?: AbortSignal;
};

export interface Provider {
  id: ProviderId;
  query(args: ProviderQueryArgs): Promise<ProviderResult>;
}

export const BrandSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});
export type Brand = z.infer<typeof BrandSchema>;

export const ProviderConfigSchema = z.object({
  id: z.enum(["openai", "anthropic", "google", "perplexity"]),
  model: z.string().min(1),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ConfigSchema = z.object({
  brand: BrandSchema,
  competitors: z.array(BrandSchema).default([]),
  prompts: z.array(z.string().min(1)).min(1),
  providers: z.array(ProviderConfigSchema).min(1),
  samples_per_prompt: z.number().int().positive().default(3),
  concurrency_per_provider: z.number().int().positive().default(4),
});
export type Config = z.infer<typeof ConfigSchema>;

export type CitationKind = "name" | "url" | "grounded_source";

export type Citation = {
  brand: string;
  matched_text: string;
  kind: CitationKind;
};

export type CallRecord = {
  run_id: string;
  prompt_id: string;
  sample_index: number;
  ts: string;
  response_text: string;
  search_results_json: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  error_code: string | null;
  error_message: string | null;
};

export type PromptRecord = {
  prompt_id: string;
  prompt_text: string;
  model: string;
  provider: ProviderId;
  config_blob: string;
  created_at: string;
};
