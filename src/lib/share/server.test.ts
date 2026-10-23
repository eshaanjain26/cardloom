import { describe, expect, it } from "vitest";
import { addChildCard, createDeck, emptyCard } from "../deck/ops";
import { allowAttempt, deckForViewer, shareAssetPath } from "./server";
import type { Share } from "./store";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const fig = (src: string) => ({ type: "figure", attrs: { src, alt: "", credit: "", creditUrl: null, query: null } });

describe("deckForViewer", () => {
  it("strips notes and points stored images at uploaded copies", () => {
    const t = "2026-10-23T00:00:00.000Z";
    let deck = createDeck("D", t, "d");
    deck = { ...deck, cards: [{ ...deck.cards[0], id: "c1", notes: "secret plan", content: { type: "doc", content: [fig(`asset:${A}`), fig(`asset:${B}`), fig("https://x.example/a.png")] } }] };
    deck = addChildCard(deck, "c1", { ...emptyCard("blank", "c2"), notes: "nested secret" }, t);
    const share: Share = { id: "abcdefghijkl", kind: "link", slug: null, expiresAt: null, createdAt: t, updatedAt: t, deck, hasPassword: false, assets: { [A]: { mime: "image/png", bytes: 10 } } };
    const v = deckForViewer(share);
    expect(v.cards[0].notes).toBe("");
    expect(v.cards[0].children[0].notes).toBe("");
    expect(v.cards[0].content.content?.map((n) => (n as { attrs: { src: string | null } }).attrs.src)).toEqual([
      shareAssetPath("abcdefghijkl", A),
      null,
      "https://x.example/a.png",
    ]);
    expect(deck.cards[0].notes).toBe("secret plan");
  });
});

describe("allowAttempt", () => {
  it("limits attempts per key inside the window", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(allowAttempt(key, 3, 1000, 0)).toBe(true);
    expect(allowAttempt(key, 3, 1000, 10)).toBe(false);
    expect(allowAttempt(key, 3, 1000, 2000)).toBe(true);
  });
});
