import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html";
import { cardExtensions } from "../editor/extensions";
import { emptyCard } from "../deck/ops";
import { contentToGenCard, figureRefs, genCardToContent, inlineToNodes } from "./convert";
import type { GenCard } from "./schemas";

describe("inlineToNodes", () => {
  it("parses bold, italic, and code", () => {
    expect(inlineToNodes("Grow **revenue** by *20%* with `ops`.")).toEqual([
      { type: "text", text: "Grow " },
      { type: "text", text: "revenue", marks: [{ type: "bold" }] },
      { type: "text", text: " by " },
      { type: "text", text: "20%", marks: [{ type: "italic" }] },
      { type: "text", text: " with " },
      { type: "text", text: "ops", marks: [{ type: "code" }] },
      { type: "text", text: "." },
    ]);
  });

  it("leaves plain text alone", () => {
    expect(inlineToNodes("2 * 3 = 6")).toEqual([{ type: "text", text: "2 * 3 = 6" }]);
  });
});

const gen: GenCard = {
  layout: "title",
  blocks: [
    { type: "heading", text: "Roadmap" },
    { type: "paragraph", text: "What ships **next**" },
    { type: "bullets", items: ["Editor", "AI"] },
    { type: "numbered", items: ["One", "Two"] },
    { type: "quote", text: "Ship weekly" },
  ],
  notes: "Keep it short",
};

describe("genCardToContent", () => {
  it("produces content the editor schema renders", () => {
    const html = generateHTML(genCardToContent(gen), cardExtensions);
    expect(html).toContain("<h1>Roadmap</h1>");
    expect(html).toContain("<strong>next</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
  });

  it("uses h2 for headings outside title cards", () => {
    const html = generateHTML(genCardToContent({ ...gen, layout: "bullets" }), cardExtensions);
    expect(html).toContain("<h2>Roadmap</h2>");
  });

  it("drops empty blocks and never returns an empty doc", () => {
    expect(genCardToContent({ layout: "blank", blocks: [{ type: "bullets", items: [] }], notes: "" })).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

describe("contentToGenCard", () => {
  it("round-trips generated content", () => {
    const card = { ...emptyCard("title", "c"), content: genCardToContent(gen), notes: gen.notes };
    expect(contentToGenCard(card)).toEqual(gen);
  });

  it("keeps smart layouts", () => {
    expect(contentToGenCard(emptyCard("timeline", "c")).layout).toBe("timeline");
  });

  it("turns new image blocks into pending figures and keeps existing ones by ref", () => {
    const existing = { src: "https://img.example/a.jpg", alt: "Old", credit: "by X, CC BY", creditUrl: "https://src.example", query: null };
    const card = { ...emptyCard("image-left", "c"), content: { type: "doc" as const, content: [{ type: "figure", attrs: existing }] } };
    const gen = contentToGenCard(card);
    expect(gen.blocks[0]).toEqual({ type: "image", query: "", alt: "Old", ref: "c/img0" });

    const refs = figureRefs([card]);
    const rewritten = genCardToContent(
      {
        layout: "image-left",
        notes: "",
        blocks: [
          { type: "image", query: "", alt: "Better alt", ref: "c/img0" },
          { type: "image", query: "school roof solar", alt: "Roof", ref: null },
          { type: "image", query: "", alt: "", ref: "c/img9" },
        ],
      },
      refs,
    );
    expect(rewritten.content).toEqual([
      { type: "figure", attrs: { ...existing, alt: "Better alt" } },
      { type: "figure", attrs: { src: null, alt: "Roof", credit: "", creditUrl: null, query: "school roof solar" } },
      { type: "figure", attrs: { src: null, alt: "", credit: "", creditUrl: null, query: "" } },
    ]);
  });

  it("round-trips charts and embeds", () => {
    const chart = { type: "bar" as const, title: "T", labels: ["a"], series: [{ name: "s", values: [1] }] };
    const gen: GenCard = { layout: "blank", notes: "", blocks: [{ type: "chart", chart }, { type: "embed", url: "https://vimeo.com/1" }] };
    const card = { ...emptyCard("blank", "c"), content: genCardToContent(gen) };
    expect(contentToGenCard(card).blocks).toEqual(gen.blocks);
  });
});
