import { describe, expect, it } from "vitest";
import { emptyCard } from "./ops";
import { cardLabel } from "./text";

describe("cardLabel", () => {
  it("joins the first text nodes", () => {
    const card = {
      ...emptyCard("blank", "c"),
      content: {
        type: "doc" as const,
        content: [
          { type: "heading", content: [{ type: "text", text: "Revenue" }] },
          { type: "paragraph", content: [{ type: "text", text: "up   12%" }] },
        ],
      },
    };
    expect(cardLabel(card)).toBe("Revenue up 12%");
  });

  it("falls back for an empty card", () => {
    expect(cardLabel(emptyCard("blank", "c"))).toBe("Untitled card");
  });
});
