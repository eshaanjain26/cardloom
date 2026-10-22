import { describe, expect, it } from "vitest";
import { createDeck } from "./ops";
import { createDeckStore, type KeyValue } from "./store";

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("deck store", () => {
  it("round-trips a deck and lists newest first", () => {
    const store = createDeckStore(memory());
    const a = createDeck("Older", "2026-10-01T00:00:00.000Z", "a");
    const b = createDeck("Newer", "2026-10-02T00:00:00.000Z", "b");
    store.save(a);
    store.save(b);
    expect(store.get("a")).toEqual(a);
    expect(store.list().map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("replaces the index entry on re-save", () => {
    const store = createDeckStore(memory());
    const a = createDeck("Draft", "2026-10-01T00:00:00.000Z", "a");
    store.save(a);
    store.save({ ...a, title: "Final", updatedAt: "2026-10-03T00:00:00.000Z" });
    expect(store.list()).toEqual([{ id: "a", title: "Final", updatedAt: "2026-10-03T00:00:00.000Z" }]);
  });

  it("removes a deck and its index entry", () => {
    const kv = memory();
    const store = createDeckStore(kv);
    store.save(createDeck("Gone", "2026-10-01T00:00:00.000Z", "a"));
    store.remove("a");
    expect(store.get("a")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("returns null for corrupt or invalid stored data", () => {
    const kv = memory();
    const store = createDeckStore(kv);
    kv.setItem("cardloom:deck:x", "{not json");
    kv.setItem("cardloom:deck:y", JSON.stringify({ id: "y" }));
    kv.setItem("cardloom:decks", "42");
    expect(store.get("x")).toBeNull();
    expect(store.get("y")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("refuses to save an invalid deck", () => {
    const store = createDeckStore(memory());
    const bad = { ...createDeck("Bad", "2026-10-01T00:00:00.000Z", "a"), cards: [] };
    expect(() => store.save(bad)).toThrow();
  });
});
