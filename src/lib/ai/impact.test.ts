import { describe, expect, it } from "vitest";
import { estimateImpact, formatImpact, ImpactSettingsSchema, priceFor, type UsageEvent } from "./impact";

const settings = ImpactSettingsSchema.parse({});
const ev = (over: Partial<UsageEvent>): UsageEvent => ({
  id: "e",
  deckId: null,
  at: "2026-10-21T00:00:00.000Z",
  task: "cards",
  provider: "anthropic",
  model: "claude-opus-5-5",
  inputTokens: 0,
  outputTokens: 0,
  ...over,
});

describe("priceFor", () => {
  it("knows Claude prices, makes Ollama free, and lets users override", () => {
    expect(priceFor("anthropic", "claude-opus-5-5", settings)).toEqual({ input: 4, output: 20 });
    expect(priceFor("ollama", "llama3.2", settings)).toEqual({ input: 0, output: 0 });
    expect(priceFor("openai", "gpt-5", settings)).toBeNull();
    const custom = { ...settings, prices: { "gpt-5": { input: 1, output: 2 } } };
    expect(priceFor("openai", "gpt-5", custom)).toEqual({ input: 1, output: 2 });
  });

  it("does not apply Anthropic prices to the same name on another provider", () => {
    expect(priceFor("openrouter", "claude-opus-5-5", settings)).toBeNull();
  });
});

describe("estimateImpact", () => {
  it("sums tokens, cost, energy, and CO2", () => {
    const i = estimateImpact(
      [ev({ inputTokens: 10_000, outputTokens: 2_000 }), ev({ provider: "ollama", model: "llama3.2", inputTokens: 1_000, outputTokens: 1_000 })],
      settings,
    );
    expect(i.calls).toBe(2);
    expect(i.inputTokens).toBe(11_000);
    expect(i.outputTokens).toBe(3_000);
    expect(i.costUsd).toBeCloseTo((10_000 * 4 + 2_000 * 20) / 1e6, 10);
    expect(i.energyWh).toBeCloseTo(11 * 0.22 + 3 * 0.6, 10);
    expect(i.co2Grams).toBeCloseTo((i.energyWh / 1000) * 475, 10);
    expect(i.unpricedModels).toEqual([]);
  });

  it("leaves image generations out of the energy estimate", () => {
    const i = estimateImpact([ev({ task: "image", provider: "openai", model: "gpt-image-1", inputTokens: 50, outputTokens: 4000 })], settings);
    expect(i.imageCalls).toBe(1);
    expect(i.outputTokens).toBe(4000);
    expect(i.energyWh).toBe(0);
  });

  it("lists models it cannot price", () => {
    const i = estimateImpact([ev({ provider: "openai", model: "gpt-5", inputTokens: 5 }), ev({ provider: "google", model: "g" })], settings);
    expect(i.unpricedModels).toEqual(["g", "gpt-5"]);
    expect(formatImpact(i).cost).toBe("cost unknown");
  });

  it("formats small numbers readably", () => {
    const f = formatImpact(estimateImpact([ev({ inputTokens: 1234, outputTokens: 567 })], settings));
    expect(f.tokens).toBe("1,234 in · 567 out");
    expect(f.cost).toBe("$0.02");
    expect(f.energy).toMatch(/^~0\.\d\d Wh$/);
  });
});
