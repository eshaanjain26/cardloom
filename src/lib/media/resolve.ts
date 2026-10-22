import { presentSequence, updateCard } from "../deck/ops";
import type { Card, Deck } from "../deck/schema";
import type { FigureAttrs } from "../editor/nodes";

type PMNode = { type?: string; attrs?: Record<string, unknown>; content?: PMNode[] };

export type PendingImage = { cardId: string; query: string; alt: string };

// Images the AI asked for (a query, no source yet), in deck order.
export function pendingImages(deck: Deck): PendingImage[] {
  const out: PendingImage[] = [];
  for (const { card } of presentSequence(deck)) {
    for (const node of (card.content.content ?? []) as PMNode[]) {
      const a = node.attrs as Partial<FigureAttrs> | undefined;
      if (node.type === "figure" && !a?.src && a?.query) out.push({ cardId: card.id, query: a.query, alt: a.alt ?? "" });
    }
  }
  return out;
}

// Fills the first pending figure on a card that matches `query`.
export function fillPendingImage(deck: Deck, pending: PendingImage, attrs: Pick<FigureAttrs, "src" | "credit" | "creditUrl"> & { alt?: string }, now: string): Deck {
  const card = presentSequence(deck).find((s) => s.card.id === pending.cardId)?.card;
  if (!card) return deck;
  let done = false;
  const content = (card.content.content ?? []).map((n) => {
    const node = n as PMNode;
    if (done || node.type !== "figure" || node.attrs?.src || node.attrs?.query !== pending.query) return n;
    done = true;
    return { ...node, attrs: { ...node.attrs, ...attrs, alt: (node.attrs?.alt as string) || attrs.alt || "", query: null } };
  });
  return done ? updateCard(deck, card.id, { content: { ...card.content, content } as Card["content"] }, now) : deck;
}

export type ImageSource = (p: PendingImage) => Promise<(Pick<FigureAttrs, "src" | "credit" | "creditUrl"> & { alt?: string }) | null>;

// Resolves pending images one by one. A failed lookup leaves the placeholder so
// the user can pick an image by hand.
export async function resolvePendingImages(
  deck: Deck,
  source: ImageSource,
  onProgress?: (done: number, total: number, deck: Deck) => void,
): Promise<{ deck: Deck; failed: number }> {
  const pending = pendingImages(deck);
  let failed = 0;
  for (const [i, p] of pending.entries()) {
    try {
      const attrs = await source(p);
      if (attrs) deck = fillPendingImage(deck, p, attrs, new Date().toISOString());
      else failed++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, pending.length, deck);
  }
  return { deck, failed };
}

// Full query first, then its first two words: Openverse matches short queries
// far more often than long descriptive ones.
export function queryFallbacks(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const short = words.slice(0, 2).join(" ");
  return [...new Set([words.join(" "), short].filter(Boolean))];
}

// Tries each fallback query, retrying once when a request fails.
export async function firstResult<T>(queries: string[], search: (q: string) => Promise<T[]>): Promise<T | null> {
  for (const q of queries) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const results = await search(q);
        if (results[0]) return results[0];
        break;
      } catch {
        // Retry once, then move on to the next query.
      }
    }
  }
  return null;
}
