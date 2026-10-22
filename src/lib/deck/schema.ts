import { z } from "zod";

export const DECK_FORMATS = ["presentation", "document", "webpage", "social"] as const;

export const CARD_LAYOUTS = [
  "blank",
  "title",
  "bullets",
  "image-left",
  "image-right",
  "two-column",
  "timeline",
  "steps",
  "comparison",
  "stats",
  "quote",
] as const;

// Card content is stored as a Tiptap/ProseMirror JSON document. Only the outer
// shape is validated here; the editor schema owns node-level validation.
export const RichTextSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.unknown())).default([]),
});

export type Card = {
  id: string;
  layout: (typeof CARD_LAYOUTS)[number];
  content: z.infer<typeof RichTextSchema>;
  notes: string;
  children: Card[];
};

export const CardSchema: z.ZodType<Card, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    layout: z.enum(CARD_LAYOUTS).default("blank"),
    content: RichTextSchema.default({ type: "doc", content: [] }),
    notes: z.string().default(""),
    children: z.array(CardSchema).default([]),
  }),
);

export const DeckSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(200),
    format: z.enum(DECK_FORMATS).default("presentation"),
    themeId: z.string().default("default"),
    cards: z.array(CardSchema).min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((deck, ctx) => {
    const seen = new Set<string>();
    for (const card of walkCards(deck.cards)) {
      if (seen.has(card.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate card id: ${card.id}` });
      }
      seen.add(card.id);
    }
  });

export type Deck = z.infer<typeof DeckSchema>;

export function* walkCards(cards: Card[]): Generator<Card> {
  for (const card of cards) {
    yield card;
    yield* walkCards(card.children);
  }
}

export function parseDeck(input: unknown): Deck {
  return DeckSchema.parse(input);
}

export function countCards(deck: Deck): number {
  return Array.from(walkCards(deck.cards)).length;
}
