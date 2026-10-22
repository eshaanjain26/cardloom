import { z } from "zod/v4";
import type { KeyValue } from "../deck/store";
import { ImpactSettingsSchema, UsageEventSchema, type UsageEvent } from "./impact";
import { DEFAULT_MODELS, PROVIDERS, type ProviderConfig, type ProviderId } from "./providers";

const SETTINGS_KEY = "cardloom:ai-settings";
const USAGE_KEY = "cardloom:usage";
export const MAX_USAGE_EVENTS = 2000;

export const AiSettingsSchema = z.object({
  provider: z.enum(PROVIDERS).default("anthropic"),
  models: z.partialRecord(z.enum(PROVIDERS), z.string()).default({}),
  keys: z.partialRecord(z.enum(PROVIDERS), z.string()).default({}),
  impact: ImpactSettingsSchema.default(ImpactSettingsSchema.parse({})),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export function providerConfig(s: AiSettings, provider: ProviderId = s.provider): ProviderConfig {
  const key = s.keys[provider]?.trim();
  return {
    provider,
    model: s.models[provider]?.trim() || DEFAULT_MODELS[provider],
    ...(key && provider !== "ollama" ? { apiKey: key } : {}),
  };
}

function readJson(kv: KeyValue, key: string): unknown {
  try {
    const raw = kv.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function createAiStore(kv: KeyValue) {
  return {
    settings(): AiSettings {
      const parsed = AiSettingsSchema.safeParse(readJson(kv, SETTINGS_KEY) ?? {});
      return parsed.success ? parsed.data : AiSettingsSchema.parse({});
    },
    saveSettings(s: AiSettings) {
      kv.setItem(SETTINGS_KEY, JSON.stringify(AiSettingsSchema.parse(s)));
    },
    usage(deckId?: string): UsageEvent[] {
      const raw = readJson(kv, USAGE_KEY);
      const events = Array.isArray(raw) ? raw.flatMap((e) => (UsageEventSchema.safeParse(e).success ? [e as UsageEvent] : [])) : [];
      return deckId === undefined ? events : events.filter((e) => e.deckId === deckId);
    },
    record(event: UsageEvent) {
      const events = [...this.usage(), UsageEventSchema.parse(event)].slice(-MAX_USAGE_EVENTS);
      kv.setItem(USAGE_KEY, JSON.stringify(events));
    },
    assignDeck(eventIds: string[], deckId: string) {
      const ids = new Set(eventIds);
      kv.setItem(USAGE_KEY, JSON.stringify(this.usage().map((e) => (ids.has(e.id) ? { ...e, deckId } : e))));
    },
  };
}
export type AiStore = ReturnType<typeof createAiStore>;
