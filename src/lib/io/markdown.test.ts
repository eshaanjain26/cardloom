import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html";
import { addChildCard, createDeck, emptyCard, insertCardAfter, presentSequence } from "../deck/ops";
import { parseDeck, type Card, type Deck } from "../deck/schema";
import { cardExtensions } from "../editor/extensions";
import { deckToMarkdown, markdownToDeck } from "./markdown";

const t = "2026-10-23T00:00:00.000Z";
const text = (s: string, marks?: object[]) => ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const li = (...c: object[]) => ({ type: "listItem", content: [{ type: "paragraph", content: c }] });
const card = (id: string, layout: Card["layout"], content: object[], notes = ""): Card => ({
  ...emptyCard(layout, id),
  content: { type: "doc", content: content as Card["content"]["content"] },
  notes,
});

function sample(): Deck {
  let d = createDeck("Pilot review", t, "d1");
  d = { ...d, themeId: "paper", cards: [card("a", "title", [{ type: "heading", attrs: { level: 1 }, content: [text("Pilot review")] }])] };
  d = insertCardAfter(
    d,
    "a",
    card(
      "b",
      "stats",
      [
        { type: "heading", attrs: { level: 2 }, content: [text("Results")] },
        { type: "bulletList", content: [li(text("41", [{ type: "bold" }]), text(" visits")), li(text("see "), text("site", [{ type: "link", attrs: { href: "https://ex.example/" } }]))] },
        { type: "orderedList", content: [li(text("One")), li(text("Two"))] },
        { type: "blockquote", content: [{ type: "paragraph", content: [text("Ship weekly")] }] },
        { type: "codeBlock", content: [text("a\n---\nb")] },
        { type: "figure", attrs: { src: "https://img.example/a.jpg", alt: "Roof", credit: "by A, CC BY", creditUrl: null, query: null } },
        { type: "chart", attrs: { data: { type: "bar", title: "Visits", labels: ["Mar", "Apr"], series: [{ name: "Elm", values: [32, 41] }] } } },
        { type: "embed", attrs: { url: "https://vimeo.com/76979871" } },
      ],
      "Mention the -- budget",
    ),
    t,
  );
  return addChildCard(d, "b", card("c", "blank", [{ type: "paragraph", content: [text("Nested detail")] }]), t);
}

const shape = (d: Deck) =>
  presentSequence(d).map(({ card, depth }) => ({ depth, layout: card.layout, notes: card.notes, html: generateHTML(card.content, cardExtensions) }));

describe("markdown", () => {
  it("round-trips a deck with layouts, nesting, notes, media, and charts", () => {
    const original = sample();
    const md = deckToMarkdown(original);
    expect(md).toContain("- **41** visits");
    expect(md).toContain("[site](https://ex.example/)");
    expect(md).toContain("![Roof](https://img.example/a.jpg)");
    expect(md).toContain("| Mar | 32 |");
    const back = markdownToDeck(md, t);
    expect(back.title).toBe("Pilot review");
    expect(back.themeId).toBe("paper");
    expect(() => parseDeck(back)).not.toThrow();
    expect(shape(back)).toEqual(shape(original));
  });

  it("splits plain Markdown into cards at headings", () => {
    const d = markdownToDeck("# Launch plan\n\nIntro text\nstill intro\n\n## Goals\n- Grow\n- Learn\n\n## Risks\n1. Budget\n", t);
    expect(d.title).toBe("Launch plan");
    expect(presentSequence(d).map(({ card }) => card.content.content?.[0])).toMatchObject([
      { type: "heading", attrs: { level: 1 } },
      { type: "heading", attrs: { level: 2 } },
      { type: "heading", attrs: { level: 2 } },
    ]);
    expect(d.cards[0].content.content?.[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Intro text still intro" }] });
  });

  it("keeps --- inside code fences and drops unsafe images", () => {
    const d = markdownToDeck("```\nx\n---\ny\n```\n\n![bad](javascript:alert(1))\n![ok](https://a.example/b.png)", t);
    expect(d.cards).toHaveLength(1);
    expect(d.cards[0].content.content).toEqual([
      { type: "codeBlock", content: [{ type: "text", text: "x\n---\ny" }] },
      { type: "figure", attrs: { src: "https://a.example/b.png", alt: "ok", credit: "", creditUrl: null, query: null } },
    ]);
  });

  it("never produces an empty deck", () => {
    const d = markdownToDeck("   \n\n", t, "notes.md");
    expect(d.cards).toHaveLength(1);
    expect(d.title).toBe("notes.md");
    expect(() => parseDeck(d)).not.toThrow();
  });
});
