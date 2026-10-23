import { describe, expect, it } from "vitest";
import { pageToContent, toLines } from "./pdf-text";

const item = (str: string, x: number, y: number, height = 12) => ({ str, x, y, height });

describe("pdf text", () => {
  it("orders lines top to bottom and words left to right", () => {
    expect(toLines([item("world", 60, 700), item("Hello", 10, 700.6), item("Below", 10, 680)]).map((l) => l.text)).toEqual(["Hello world", "Below"]);
  });

  it("finds a large heading, paragraphs, and wrapped bullets", () => {
    const content = pageToContent(
      [
        item("Pilot results", 40, 760, 28),
        item("Evening visits grew each month", 40, 700),
        item("across all branches.", 40, 685),
        item("Staffing was covered by two people.", 40, 640),
        item("• 41 visits a night", 40, 600),
        item("• A third were teens, mostly", 40, 585),
        item("after 6 pm", 52, 570),
      ],
      2,
    );
    expect(content).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pilot results" }] },
      { type: "paragraph", content: [{ type: "text", text: "Evening visits grew each month across all branches." }] },
      { type: "paragraph", content: [{ type: "text", text: "Staffing was covered by two people." }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "41 visits a night" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "A third were teens, mostly after 6 pm" }] }] },
        ],
      },
    ]);
  });

  it("does not invent a heading when sizes are uniform", () => {
    const content = pageToContent([item("Plain line one", 40, 700), item("Plain line two", 40, 685)], 1);
    expect(content.map((n) => n.type)).toEqual(["paragraph"]);
  });

  it("returns nothing for an empty page", () => {
    expect(pageToContent([item("  ", 0, 0)], 1)).toEqual([]);
  });
});
