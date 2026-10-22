import { z } from "zod/v4";
import { PROVIDERS, type ProviderId } from "./providers";

// USD per million tokens, Anthropic first-party rates as of 2026-10-06.
// Other providers change prices often; users enter theirs in Settings.
export const KNOWN_PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

// Defaults derived in docs/impact.md. All three are estimates and editable.
export const DEFAULT_IMPACT = {
  whPer1kInput: 0.22,
  whPer1kOutput: 0.6,
  gridGramsPerKwh: 475,
};

const PriceSchema = z.object({ input: z.number().min(0), output: z.number().min(0) });

export const ImpactSettingsSchema = z.object({
  whPer1kInput: z.number().min(0).max(100).default(DEFAULT_IMPACT.whPer1kInput),
  whPer1kOutput: z.number().min(0).max(100).default(DEFAULT_IMPACT.whPer1kOutput),
  gridGramsPerKwh: z.number().min(0).max(2000).default(DEFAULT_IMPACT.gridGramsPerKwh),
  prices: z.record(z.string(), PriceSchema).default({}),
});
export type ImpactSettings = z.infer<typeof ImpactSettingsSchema>;

export const UsageEventSchema = z.object({
  id: z.string(),
  deckId: z.string().nullable(),
  at: z.string(),
  task: z.string(),
  provider: z.enum(PROVIDERS),
  model: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

export function priceFor(provider: ProviderId, model: string, settings: ImpactSettings) {
  if (provider === "ollama") return { input: 0, output: 0 };
  return settings.prices[model] ?? (provider === "anthropic" ? KNOWN_PRICES[model] : undefined) ?? null;
}

export type Impact = {
  calls: number;
  // Image generations count toward tokens and cost but not energy: the per-token
  // energy factors are for text models.
  imageCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  unpricedModels: string[];
  energyWh: number;
  co2Grams: number;
};

export function estimateImpact(events: UsageEvent[], settings: ImpactSettings): Impact {
  const impact: Impact = { calls: 0, imageCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedModels: [], energyWh: 0, co2Grams: 0 };
  const unpriced = new Set<string>();
  for (const e of events) {
    impact.calls++;
    impact.inputTokens += e.inputTokens;
    impact.outputTokens += e.outputTokens;
    const price = priceFor(e.provider, e.model, settings);
    if (price) impact.costUsd += (e.inputTokens * price.input + e.outputTokens * price.output) / 1_000_000;
    else unpriced.add(e.model);
    if (e.task === "image") impact.imageCalls++;
    else impact.energyWh += (e.inputTokens * settings.whPer1kInput + e.outputTokens * settings.whPer1kOutput) / 1000;
  }
  impact.co2Grams = (impact.energyWh / 1000) * settings.gridGramsPerKwh;
  impact.unpricedModels = [...unpriced].sort();
  return impact;
}

export function formatImpact(i: Impact) {
  const n = (v: number) => v.toLocaleString("en-US");
  const cost =
    i.unpricedModels.length && i.costUsd === 0
      ? "cost unknown"
      : `$${i.costUsd < 0.01 && i.costUsd > 0 ? i.costUsd.toFixed(4) : i.costUsd.toFixed(2)}${i.unpricedModels.length ? "+" : ""}`;
  return {
    tokens: `${n(i.inputTokens)} in · ${n(i.outputTokens)} out`,
    cost,
    energy: `~${i.energyWh < 10 ? i.energyWh.toFixed(2) : i.energyWh.toFixed(0)} Wh`,
    co2: `~${i.co2Grams < 10 ? i.co2Grams.toFixed(2) : i.co2Grams.toFixed(0)} g CO₂e`,
  };
}
