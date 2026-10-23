import {
  emptyCard,
  insertCardAfter,
  moveCard,
  newId,
  presentSequence,
  removeCard,
  updateCard,
} from "../deck/ops";
import type { Card, Deck } from "../deck/schema";
import { THEMES } from "../themes";
import { contentToGenCard, figureRefs, genCardToContent } from "./convert";
import type { Complete, Usage } from "./providers";
import {
  AgentResultSchema,
  CardsBatchSchema,
  OutlineSchema,
  type AgentOp,
  type AgentResult,
  type GenCard,
  type Outline,
  type OutlineRequest,
} from "./schemas";

export const CARD_BATCH_SIZE = 5;

function audienceLines(req: OutlineRequest): string {
  return [
    req.tone && `Tone: ${req.tone}.`,
    req.audience && `Audience: ${req.audience}.`,
    `Write in ${req.language || "English"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const TEXT_HANDLING: Record<OutlineRequest["textHandling"], string> = {
  condense: "Condense the source into its key points.",
  preserve: "Keep the source wording wherever possible; only split it into cards.",
  expand: "Expand on the source with explanation and examples that follow from it.",
};

// Prompt mode has no source to check against, so figures the user did not give
// become visible placeholders instead of plausible-looking guesses.
const NO_INVENTED_FIGURES =
  "Do not state statistics, percentages, prices, or dates the user did not give. Describe them in words, or write [add figure] where a number belongs.";

function sourceBlock(req: OutlineRequest): string {
  return req.mode === "text" ? `\n\n<source>\n${req.input}\n</source>` : "";
}

export async function generateOutline(complete: Complete, req: OutlineRequest) {
  const subject =
    req.mode === "prompt"
      ? `${NO_INVENTED_FIGURES}\n\nTopic: ${req.input}`
      : `Build it from the source text below. ${TEXT_HANDLING[req.textHandling]} Keep facts from the source and do not invent numbers, names, or quotes.`;
  const res = await complete({
    system: `You plan ${req.format}s for Cardloom, a card-based presentation and document builder.`,
    prompt: `Plan a ${req.format} with exactly ${req.cardCount} cards. Card 1 introduces the topic. Give each card a short title and 2 to 5 short points.\n${audienceLines(req)}\n\n${subject}${sourceBlock(req)}`,
    schema: OutlineSchema,
    maxTokens: 8000,
  });
  const cards = res.data.cards
    .slice(0, req.cardCount)
    .map((c) => ({ title: c.title.trim().slice(0, 200), points: c.points.map((p) => p.trim()).filter(Boolean).slice(0, 8) }))
    .filter((c) => c.title);
  if (cards.length === 0) throw new Error("The outline came back empty.");
  return { outline: { title: res.data.title.trim().slice(0, 200) || cards[0].title, cards }, usage: res.usage, model: res.model };
}

export function batchRanges(total: number, size = CARD_BATCH_SIZE): [number, number][] {
  const ranges: [number, number][] = [];
  for (let start = 0; start < total; start += size) ranges.push([start, Math.min(total, start + size)]);
  return ranges;
}

export function outlineCardToGen(card: Outline["cards"][number], index: number): GenCard {
  return {
    layout: index === 0 ? "title" : "bullets",
    blocks: [
      { type: "heading", text: card.title },
      ...(card.points.length ? [{ type: "bullets" as const, items: card.points }] : []),
    ],
    notes: "",
  };
}

const LAYOUT_GUIDE =
  'Layouts: "title" for card 1 only; "bullets" for lists; "two-column" for longer cards; "quote" when the card centers on one quotation; "image-left" or "image-right" for a card with an image block; "timeline" for dated events (a bullets block whose items start with a bold date, like **2024** Pilot starts); "steps" for a process (a numbered block, one step per item); "comparison" for two options (a heading block, then for each option a heading block followed by a bullets block); "stats" for key numbers (a bullets block whose items start with a bold number, like **41** visits a night); "blank" otherwise.';

function mediaGuide(req: OutlineRequest): string {
  const images =
    req.imageMode === "none"
      ? "Do not add image blocks."
      : `Add an image block (with alt text and ref null) to roughly every other card where a picture helps, and give those cards the image-left or image-right layout. ${
          req.imageMode === "ai"
            ? "The query is a vivid one-sentence description for an image generator: subject, setting, style. No text in the image."
            : "The query is 2 to 5 plain words for a free stock photo search."
        }`;
  const charts =
    req.mode === "text"
      ? "Add a chart block only when the source gives several comparable numbers, and use exactly those numbers."
      : "Do not add chart blocks.";
  return `${images} ${charts} Do not add embed blocks.`;
}

export async function generateCards(
  complete: Complete,
  args: { request: OutlineRequest; outline: Outline; start: number; end: number },
) {
  const { request, outline, start, end } = args;
  const wanted = outline.cards.slice(start, end);
  const outlineText = outline.cards
    .map((c, i) => `${i + 1}. ${c.title}${c.points.length ? `: ${c.points.join("; ")}` : ""}`)
    .join("\n");
  const res = await complete({
    system: `You write cards for a Cardloom ${request.format}. Each card is one slide or section: a heading plus concise content, under about 70 visible words. Use **bold** sparingly for key terms.`,
    prompt: `Deck title: ${outline.title}\nFull outline:\n${outlineText}\n\nWrite cards ${start + 1} to ${end}, exactly ${wanted.length} cards, in outline order. Start each card with a heading block. ${LAYOUT_GUIDE} ${mediaGuide(request)} Add 1 to 3 sentences of speaker notes per card.\n${audienceLines(request)}${request.mode === "text" ? `\nUse only facts from the source. ${TEXT_HANDLING[request.textHandling]}` : `\n${NO_INVENTED_FIGURES}`}${sourceBlock(request)}`,
    schema: CardsBatchSchema,
  });
  const cards = wanted.map((oc, i) => res.data.cards[i] ?? outlineCardToGen(oc, start + i));
  return { cards, filled: Math.max(0, wanted.length - res.data.cards.length), usage: res.usage, model: res.model };
}

export function deckFromGeneration(
  args: { title: string; format: Deck["format"]; themeId: string; cards: GenCard[] },
  now: string,
): Deck {
  return {
    id: newId(),
    title: args.title,
    format: args.format,
    themeId: args.themeId,
    createdAt: now,
    updatedAt: now,
    cards: args.cards.map((g) => ({ ...emptyCard(g.layout), content: genCardToContent(g), notes: g.notes })),
  };
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

export function deckForAgent(deck: Deck) {
  return {
    title: deck.title,
    themeId: deck.themeId,
    cards: presentSequence(deck).map(({ card, depth }) => ({ id: card.id, depth, ...contentToGenCard(card) })),
  };
}

export async function runAgent(
  complete: Complete,
  args: { deck: Deck; message: string; history: ChatTurn[]; focusCardId?: string },
): Promise<{ result: AgentResult; usage: Usage; model: string }> {
  const { deck, message, history, focusCardId } = args;
  const historyText = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "You"}: ${t.text}`)
    .join("\n");
  const res = await complete({
    system:
      `You edit Cardloom decks for the user. Make the changes they ask for through operations, and answer questions without operations. update_card replaces the whole card, so include every block the card should keep; keep existing image blocks with their ref unchanged. For a new image use ref null and a 2 to 5 word stock photo query. Use card ids exactly as given. Do not invent facts, numbers, quotes, or chart data that are not in the deck or the request. ${LAYOUT_GUIDE}`,
    prompt: `Available theme ids: ${THEMES.map((t) => t.id).join(", ")}\n\nDeck:\n${JSON.stringify(deckForAgent(deck))}\n${focusCardId ? `\nThe user is asking about card ${focusCardId} unless they say otherwise.\n` : ""}${historyText ? `\nEarlier conversation:\n${historyText}\n` : ""}\nRequest: ${message}\n\nReply in one or two sentences saying what you changed.`,
    schema: AgentResultSchema,
  });
  return { result: res.data, usage: res.usage, model: res.model };
}

export function applyAgentOps(deck: Deck, ops: AgentOp[], now: string) {
  const exists = (id: string) => presentSequence(deck).some((s) => s.card.id === id);
  const refs = figureRefs(presentSequence(deck).map((s) => s.card));
  const skipped: string[] = [];
  let applied = 0;
  for (const op of ops) {
    const before = deck;
    switch (op.op) {
      case "update_card":
        if (exists(op.cardId))
          deck = updateCard(deck, op.cardId, { layout: op.card.layout, content: genCardToContent(op.card, refs), notes: op.card.notes }, now);
        break;
      case "insert_after":
        if (exists(op.afterCardId)) {
          const card: Card = { ...emptyCard(op.card.layout), content: genCardToContent(op.card, refs), notes: op.card.notes };
          deck = insertCardAfter(deck, op.afterCardId, card, now);
        }
        break;
      case "remove_card":
        if (exists(op.cardId)) deck = removeCard(deck, op.cardId, now);
        break;
      case "move_card":
        if (exists(op.cardId)) deck = moveCard(deck, op.cardId, op.direction === "up" ? -1 : 1, now);
        break;
      case "set_theme":
        if (THEMES.some((t) => t.id === op.themeId)) deck = { ...deck, themeId: op.themeId, updatedAt: now };
        break;
      case "set_title": {
        const title = op.title.trim().slice(0, 200);
        if (title) deck = { ...deck, title, updatedAt: now };
        break;
      }
    }
    if (deck === before) skipped.push(op.op);
    else applied++;
  }
  return { deck, applied, skipped };
}
