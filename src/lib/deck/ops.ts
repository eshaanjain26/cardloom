import type { Card, Deck } from "./schema";
import { CARD_LAYOUTS } from "./schema";

export type Layout = (typeof CARD_LAYOUTS)[number];

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyCard(layout: Layout = "blank", id: string = newId()): Card {
  return { id, layout, content: { type: "doc", content: [{ type: "paragraph" }] }, notes: "", children: [] };
}

export function createDeck(title: string, now: string, id: string = newId()): Deck {
  const titleCard: Card = {
    ...emptyCard("title"),
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
        { type: "paragraph" },
      ],
    },
  };
  return { id, title, format: "presentation", themeId: "default", cards: [titleCard], createdAt: now, updatedAt: now };
}

function mapSiblings(cards: Card[], id: string, fn: (siblings: Card[], index: number) => Card[]): Card[] | null {
  const index = cards.findIndex((c) => c.id === id);
  if (index !== -1) return fn(cards, index);
  for (let i = 0; i < cards.length; i++) {
    const children = mapSiblings(cards[i].children, id, fn);
    if (children === cards[i].children) return cards;
    if (children) return cards.map((c, j) => (j === i ? { ...c, children } : c));
  }
  return null;
}

// Returns the same deck object when nothing changed, so callers can detect no-ops.
function withCards(deck: Deck, cards: Card[] | null, now: string): Deck {
  return cards && cards !== deck.cards ? { ...deck, cards, updatedAt: now } : deck;
}

export function updateCard(deck: Deck, id: string, patch: Partial<Omit<Card, "id" | "children">>, now: string): Deck {
  return withCards(
    deck,
    mapSiblings(deck.cards, id, (s, i) => s.map((c, j) => (j === i ? { ...c, ...patch } : c))),
    now,
  );
}

export function insertCardAfter(deck: Deck, afterId: string, card: Card, now: string): Deck {
  return withCards(
    deck,
    mapSiblings(deck.cards, afterId, (s, i) => [...s.slice(0, i + 1), card, ...s.slice(i + 1)]),
    now,
  );
}

export function addChildCard(deck: Deck, parentId: string, card: Card, now: string): Deck {
  return withCards(
    deck,
    mapSiblings(deck.cards, parentId, (s, i) =>
      s.map((c, j) => (j === i ? { ...c, children: [...c.children, card] } : c)),
    ),
    now,
  );
}

// A deck always keeps at least one top-level card, matching DeckSchema.
export function removeCard(deck: Deck, id: string, now: string): Deck {
  if (deck.cards.length === 1 && deck.cards[0].id === id) return deck;
  return withCards(
    deck,
    mapSiblings(deck.cards, id, (s, i) => s.filter((_, j) => j !== i)),
    now,
  );
}

export function moveCard(deck: Deck, id: string, direction: -1 | 1, now: string): Deck {
  return withCards(
    deck,
    mapSiblings(deck.cards, id, (s, i) => {
      const target = i + direction;
      if (target < 0 || target >= s.length) return s;
      const next = [...s];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    }),
    now,
  );
}

export type PresentStep = { card: Card; depth: number };

export function presentSequence(deck: Deck): PresentStep[] {
  const steps: PresentStep[] = [];
  const visit = (cards: Card[], depth: number) => {
    for (const card of cards) {
      steps.push({ card, depth });
      visit(card.children, depth + 1);
    }
  };
  visit(deck.cards, 0);
  return steps;
}
