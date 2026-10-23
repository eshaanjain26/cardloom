import { describe, expect, it, vi } from "vitest";
import { createDeck, emptyCard, insertCardAfter } from "../deck/ops";
import { parseDeck, type Deck } from "../deck/schema";
import { firstResult, pendingImages, queryFallbacks, resolvePendingImages } from "./resolve";

const t = "2026-10-22T00:00:00.000Z";
const fig = (attrs: object) => ({ type: "figure", attrs: { src: null, alt: "", credit: "", creditUrl: null, query: null, ...attrs } });

function deck(): Deck {
  let d = createDeck("D", t, "d");
  d = insertCardAfter(
    d,
    d.cards[0].id,
    {
      ...emptyCard("image-left", "c2"),
      content: {
        type: "doc",
        content: [fig({ query: "solar roof", alt: "Roof" }), fig({ src: "https://done.example/a.jpg" }), fig({ query: "rooftop crew" })],
      },
    },
    t,
  );
  return d;
}

describe("pending images", () => {
  it("lists figures that have a query and no source", () => {
    expect(pendingImages(deck())).toEqual([
      { cardId: "c2", query: "solar roof", alt: "Roof" },
      { cardId: "c2", query: "rooftop crew", alt: "" },
    ]);
  });

  it("fills each pending image and keeps failures as placeholders", async () => {
    const source = vi.fn(async (p: { query: string }) =>
      p.query === "solar roof" ? { src: "https://img.example/1.jpg", credit: "by A, CC BY", creditUrl: null, alt: "Ignored" } : null,
    );
    const progress: number[] = [];
    const res = await resolvePendingImages(deck(), source, (done) => progress.push(done));
    expect(res.failed).toBe(1);
    expect(progress).toEqual([1, 2]);
    const content = res.deck.cards[1].content.content as { attrs: Record<string, unknown> }[];
    expect(content[0].attrs).toMatchObject({ src: "https://img.example/1.jpg", alt: "Roof", credit: "by A, CC BY", query: null });
    expect(content[2].attrs).toMatchObject({ src: null, query: "rooftop crew" });
    expect(() => parseDeck(res.deck)).not.toThrow();
  });

  it("counts thrown lookups as failures", async () => {
    const res = await resolvePendingImages(deck(), async () => {
      throw new Error("offline");
    });
    expect(res.failed).toBe(2);
  });
});

describe("stock lookup fallbacks", () => {
  it("shortens long queries", () => {
    expect(queryFallbacks("  library desk evening staff ")).toEqual(["library desk evening staff", "library desk"]);
    expect(queryFallbacks("solar")).toEqual(["solar"]);
  });

  it("retries a failed request once, then falls back to the shorter query", async () => {
    const calls: string[] = [];
    const search = vi.fn(async (q: string) => {
      calls.push(q);
      if (q === "a b c") throw new Error("timeout");
      return q === "a b" ? ["hit"] : [];
    });
    expect(await firstResult(["a b c", "a b"], search)).toBe("hit");
    expect(calls).toEqual(["a b c", "a b c", "a b"]);
  });

  it("returns null when nothing matches", async () => {
    expect(await firstResult(["x"], async () => [])).toBeNull();
  });
});
