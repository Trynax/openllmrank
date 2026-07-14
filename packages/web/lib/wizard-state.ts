// localStorage-backed wizard state. The wizard is 4 routes; this module is
// the one source of truth for what each step has captured.
//
// We deliberately do NOT use React context or a global store. The state
// only needs to survive route transitions and refreshes; localStorage
// handles both.

"use client";

import type {
  Brand,
  ProviderConfig,
} from "@openllmrank/shared/config";
import { HOSTED_REPORT_PROVIDERS } from "@openllmrank/shared/config";

export type WizardState = {
  brand?: Brand;
  competitors: Brand[];
  prompts: string[];
  providers: ProviderConfig[];
  email?: string;
};

const STORAGE_KEY = "openllmrank.wizard.v1";

const empty: WizardState = {
  competitors: [],
  prompts: [],
  providers: HOSTED_REPORT_PROVIDERS.map((provider) => ({ ...provider })),
};

export function readWizardState(): WizardState {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return {
      ...empty,
      ...JSON.parse(raw),
      // Provider selection is part of the hosted product, not a wizard input.
      // Normalize old saved sessions to the current report lineup.
      providers: HOSTED_REPORT_PROVIDERS.map((provider) => ({ ...provider })),
    };
  } catch {
    return empty;
  }
}

export function writeWizardState(patch: Partial<WizardState>): WizardState {
  const current = readWizardState();
  const next = { ...current, ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearWizardState(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
