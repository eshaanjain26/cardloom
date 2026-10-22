import { describe, expect, it } from "vitest";
import type { KeyValue } from "../deck/store";
import { createAiStore, MAX_USAGE_EVENTS, providerConfig } from "./settings";

function memory(): KeyValue {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const event = (id: string, deckId: string | null = null) => ({
  id,
  deckId,
  at: "2026-10-21T00:00:00.000Z",
  task: "outline",
  provider: "anthropic" as const,
  model: "claude-opus-5-5",
  inputTokens: 1,
  outputTokens: 1,
});

describe("ai settings", () => {
  it("defaults to Anthropic with the default model and impact factors", () => {
    const s = createAiStore(memory()).settings();
    expect(providerConfig(s)).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(s.impact.gridGramsPerKwh).toBe(475);
  });

  it("round-trips settings and never sends a key for Ollama", () => {
    const store = createAiStore(memory());
    const s = store.settings();
    store.saveSettings({ ...s, provider: "ollama", models: { ollama: "qwen3" }, keys: { ollama: "x", anthropic: " sk " } });
    const loaded = store.settings();
    expect(providerConfig(loaded)).toEqual({ provider: "ollama", model: "qwen3" });
    expect(providerConfig(loaded, "anthropic")).toEqual({ provider: "anthropic", model: "claude-opus-5-5", apiKey: "sk" });
  });

  it("recovers from corrupt storage", () => {
    const kv = memory();
    kv.setItem("cardloom:ai-settings", "{bad");
    kv.setItem("cardloom:usage", JSON.stringify([{ nope: 1 }, event("ok")]));
    const store = createAiStore(kv);
    expect(store.settings().provider).toBe("anthropic");
    expect(store.usage().map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("usage log", () => {
  it("filters by deck and reassigns events to a new deck", () => {
    const store = createAiStore(memory());
    store.record(event("a"));
    store.record(event("b", "d1"));
    store.assignDeck(["a"], "d2");
    expect(store.usage("d2").map((e) => e.id)).toEqual(["a"]);
    expect(store.usage("d1").map((e) => e.id)).toEqual(["b"]);
  });

  it("keeps only the newest events", () => {
    const store = createAiStore(memory());
    for (let i = 0; i < MAX_USAGE_EVENTS + 3; i++) store.record(event(String(i)));
    const ids = store.usage().map((e) => e.id);
    expect(ids).toHaveLength(MAX_USAGE_EVENTS);
    expect(ids[0]).toBe("3");
  });
});
