import { describe, expect, it } from "vitest";
import { countCards, parseDeck } from "./schema";

const now = "2026-10-21T00:00:00.000Z";

function deck(cards: unknown[]) {
  return { id: "d1", title: "Q3 review", cards, createdAt: now, updatedAt: now };
}

describe("parseDeck", () => {
  it("fills defaults for a minimal deck", () => {
    const parsed = parseDeck(deck([{ id: "c1" }]));
    expect(parsed.format).toBe("presentation");
    expect(parsed.themeId).toBe("default");
    expect(parsed.cards[0]).toEqual({
      id: "c1",
      layout: "blank",
      content: { type: "doc", content: [] },
      notes: "",
      children: [],
    });
  });

  it("accepts nested cards and counts them all", () => {
    const parsed = parseDeck(
      deck([{ id: "c1", children: [{ id: "c1a" }, { id: "c1b", children: [{ id: "c1b1" }] }] }, { id: "c2" }]),
    );
    expect(countCards(parsed)).toBe(5);
  });

  it("rejects duplicate card ids, including nested ones", () => {
    expect(() => parseDeck(deck([{ id: "c1", children: [{ id: "c1" }] }]))).toThrow(/Duplicate card id: c1/);
  });

  it("rejects an empty deck", () => {
    expect(() => parseDeck(deck([]))).toThrow();
  });

  it("rejects unknown layouts and formats", () => {
    expect(() => parseDeck(deck([{ id: "c1", layout: "hexagon" }]))).toThrow();
    expect(() => parseDeck({ ...deck([{ id: "c1" }]), format: "video" })).toThrow();
  });
});
