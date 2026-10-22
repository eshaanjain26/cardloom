import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html";
import { cardExtensions } from "../editor/extensions";
import { emptyCard } from "../deck/ops";
import { contentToGenCard, genCardToContent, inlineToNodes } from "./convert";
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

  it("maps layouts the model cannot produce to blank", () => {
    expect(contentToGenCard(emptyCard("timeline", "c")).layout).toBe("blank");
  });
});
