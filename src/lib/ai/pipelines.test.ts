import { describe, expect, it, vi } from "vitest";
import { createDeck, emptyCard, insertCardAfter, presentSequence } from "../deck/ops";
import { parseDeck } from "../deck/schema";
import { contentToGenCard } from "./convert";
import {
  applyAgentOps,
  batchRanges,
  deckFromGeneration,
  generateCards,
  generateOutline,
  runAgent,
} from "./pipelines";
import type { Complete, CompleteRequest } from "./providers";
import { OutlineRequestSchema, type GenCard, type Outline } from "./schemas";

const t0 = "2026-10-21T00:00:00.000Z";
const usage = { inputTokens: 100, outputTokens: 50 };

function fakeComplete(data: unknown) {
  const calls: CompleteRequest<unknown>[] = [];
  const complete = vi.fn(async (req: CompleteRequest<unknown>) => {
    calls.push(req);
    return { data: req.schema.parse(data), usage, model: "test-model" };
  }) as unknown as Complete;
  return { complete, calls };
}

const request = OutlineRequestSchema.parse({ mode: "prompt", input: "Solar adoption in cities", cardCount: 3 });
const outline: Outline = {
  title: "Solar in cities",
  cards: [
    { title: "Why solar", points: ["Cost", "Air"] },
    { title: "Barriers", points: ["Permits"] },
    { title: "Next steps", points: [] },
  ],
};
const card = (text: string): GenCard => ({ layout: "bullets", blocks: [{ type: "heading", text }], notes: "n" });

describe("generateOutline", () => {
  it("trims to the requested count and drops empty titles", async () => {
    const { complete, calls } = fakeComplete({
      title: " Solar ",
      cards: [
        { title: "A", points: [" x ", ""] },
        { title: "  ", points: [] },
        { title: "B", points: [] },
        { title: "C", points: [] },
        { title: "D", points: [] },
      ],
    });
    const res = await generateOutline(complete, request);
    expect(res.outline).toEqual({ title: "Solar", cards: [{ title: "A", points: ["x"] }, { title: "B", points: [] }] });
    expect(res.usage).toEqual(usage);
    expect(calls[0].prompt).toContain("exactly 3 cards");
    expect(calls[0].prompt).toContain("Solar adoption in cities");
  });

  it("puts pasted text in a source block with a no-invention rule", async () => {
    const { complete, calls } = fakeComplete({ title: "T", cards: [{ title: "A", points: [] }] });
    await generateOutline(complete, { ...request, mode: "text", input: "Q3 revenue was $4M.", textHandling: "preserve" });
    expect(calls[0].prompt).toContain("<source>\nQ3 revenue was $4M.\n</source>");
    expect(calls[0].prompt).toContain("do not invent");
    expect(calls[0].prompt).toContain("Keep the source wording");
  });

  it("fails on an empty outline", async () => {
    const { complete } = fakeComplete({ title: "T", cards: [] });
    await expect(generateOutline(complete, request)).rejects.toThrow(/empty/);
  });
});

describe("generateCards", () => {
  it("splits work into batches", () => {
    expect(batchRanges(12, 5)).toEqual([[0, 5], [5, 10], [10, 12]]);
    expect(batchRanges(0)).toEqual([]);
  });

  it("fills missing cards from the outline and drops extras", async () => {
    const { complete } = fakeComplete({ cards: [card("Generated")] });
    const res = await generateCards(complete, { request, outline, start: 1, end: 3 });
    expect(res.filled).toBe(1);
    expect(res.cards[0]).toEqual(card("Generated"));
    expect(res.cards[1].blocks[0]).toEqual({ type: "heading", text: "Next steps" });
  });
});

describe("deckFromGeneration", () => {
  it("builds a schema-valid deck", () => {
    const deck = deckFromGeneration({ title: "S", format: "document", themeId: "paper", cards: [card("A"), card("B")] }, t0);
    expect(() => parseDeck(deck)).not.toThrow();
    expect(deck.cards).toHaveLength(2);
    expect(contentToGenCard(deck.cards[1]).blocks[0]).toEqual({ type: "heading", text: "B" });
  });
});

describe("agent", () => {
  function deck() {
    let d = createDeck("Plan", t0, "d1");
    d = { ...d, cards: [{ ...d.cards[0], id: "a" }] };
    return insertCardAfter(d, "a", emptyCard("bullets", "b"), t0);
  }

  it("sends the deck with card ids and the focus card", async () => {
    const { complete, calls } = fakeComplete({ reply: "Done", operations: [] });
    await runAgent(complete, { deck: deck(), message: "Shorten it", history: [{ role: "user", text: "hi" }], focusCardId: "b" });
    expect(calls[0].prompt).toContain('"id":"a"');
    expect(calls[0].prompt).toContain("card b");
    expect(calls[0].prompt).toContain("User: hi");
  });

  it("applies valid operations and skips ones that do nothing", () => {
    const res = applyAgentOps(
      deck(),
      [
        { op: "update_card", cardId: "b", card: card("New heading") },
        { op: "insert_after", afterCardId: "b", card: card("Inserted") },
        { op: "set_theme", themeId: "forest" },
        { op: "set_title", title: "  Better plan " },
        { op: "update_card", cardId: "missing", card: card("x") },
        { op: "set_theme", themeId: "neon" },
        { op: "move_card", cardId: "a", direction: "up" },
      ],
      "2026-10-21T02:00:00.000Z",
    );
    expect(res.applied).toBe(4);
    expect(res.skipped).toEqual(["update_card", "set_theme", "move_card"]);
    expect(res.deck.themeId).toBe("forest");
    expect(res.deck.title).toBe("Better plan");
    const labels = presentSequence(res.deck).map((s) => contentToGenCard(s.card).blocks[0]);
    expect(labels[1]).toEqual({ type: "heading", text: "New heading" });
    expect(labels[2]).toEqual({ type: "heading", text: "Inserted" });
    expect(() => parseDeck(res.deck)).not.toThrow();
  });

  it("will not remove the last card", () => {
    const solo = createDeck("Solo", t0, "d1");
    const res = applyAgentOps(solo, [{ op: "remove_card", cardId: solo.cards[0].id }], t0);
    expect(res.applied).toBe(0);
    expect(res.deck).toBe(solo);
  });
});
