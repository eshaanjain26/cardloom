import { describe, expect, it } from "vitest";
import {
  addChildCard,
  createDeck,
  emptyCard,
  insertCardAfter,
  moveCard,
  presentSequence,
  removeCard,
  updateCard,
} from "./ops";
import { parseDeck, type Deck } from "./schema";

const t0 = "2026-10-21T00:00:00.000Z";
const t1 = "2026-10-21T01:00:00.000Z";

function ids(deck: Deck) {
  return presentSequence(deck).map((s) => `${s.depth}:${s.card.id}`);
}

function sample(): Deck {
  let d = createDeck("Plan", t0, "d1");
  d = { ...d, cards: [{ ...d.cards[0], id: "a" }] };
  d = insertCardAfter(d, "a", emptyCard("bullets", "b"), t0);
  d = insertCardAfter(d, "b", emptyCard("blank", "c"), t0);
  d = addChildCard(d, "b", emptyCard("blank", "b1"), t0);
  d = addChildCard(d, "b", emptyCard("blank", "b2"), t0);
  return d;
}

describe("createDeck", () => {
  it("produces a schema-valid deck with a title card", () => {
    const d = createDeck("Q3 review", t0, "d1");
    expect(parseDeck(d)).toEqual(d);
    expect(d.cards[0].layout).toBe("title");
    expect(JSON.stringify(d.cards[0].content)).toContain("Q3 review");
  });
});

describe("card operations", () => {
  it("inserts, nests, and flattens depth-first", () => {
    expect(ids(sample())).toEqual(["0:a", "0:b", "1:b1", "1:b2", "0:c"]);
  });

  it("inserts after a nested card at the same level", () => {
    const d = insertCardAfter(sample(), "b1", emptyCard("blank", "x"), t1);
    expect(ids(d)).toEqual(["0:a", "0:b", "1:b1", "1:x", "1:b2", "0:c"]);
    expect(d.updatedAt).toBe(t1);
  });

  it("moves within siblings and stops at the edges", () => {
    let d = moveCard(sample(), "b2", -1, t1);
    expect(ids(d)).toEqual(["0:a", "0:b", "1:b2", "1:b1", "0:c"]);
    d = moveCard(d, "a", -1, t1);
    expect(ids(d)[0]).toBe("0:a");
  });

  it("updates a nested card without touching others", () => {
    const before = sample();
    const d = updateCard(before, "b2", { notes: "say this", layout: "quote" }, t1);
    const b2 = presentSequence(d).find((s) => s.card.id === "b2")!.card;
    expect(b2.notes).toBe("say this");
    expect(b2.layout).toBe("quote");
    expect(presentSequence(d).find((s) => s.card.id === "b1")!.card).toBe(
      presentSequence(before).find((s) => s.card.id === "b1")!.card,
    );
  });

  it("removes a card with its children", () => {
    expect(ids(removeCard(sample(), "b", t1))).toEqual(["0:a", "0:c"]);
  });

  it("keeps the last top-level card", () => {
    const d = createDeck("Solo", t0, "d1");
    expect(removeCard(d, d.cards[0].id, t1)).toBe(d);
  });

  it("returns the same deck for an unknown id", () => {
    const d = sample();
    expect(updateCard(d, "nope", { notes: "x" }, t1)).toBe(d);
    expect(removeCard(d, "nope", t1)).toBe(d);
  });

  it("keeps every result schema-valid", () => {
    expect(() => parseDeck(moveCard(removeCard(sample(), "c", t1), "b", -1, t1))).not.toThrow();
  });
});
