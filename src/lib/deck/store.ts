import { DeckSchema, type Deck } from "./schema";

export type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type DeckSummary = { id: string; title: string; updatedAt: string };

const INDEX_KEY = "cardloom:decks";
const deckKey = (id: string) => `cardloom:deck:${id}`;

export function createDeckStore(kv: KeyValue) {
  function readIndex(): DeckSummary[] {
    try {
      const raw = kv.getItem(INDEX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as DeckSummary[]) : [];
    } catch {
      return [];
    }
  }

  function writeIndex(index: DeckSummary[]) {
    index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    kv.setItem(INDEX_KEY, JSON.stringify(index));
  }

  return {
    list(): DeckSummary[] {
      return readIndex();
    },

    get(id: string): Deck | null {
      try {
        const raw = kv.getItem(deckKey(id));
        if (!raw) return null;
        const result = DeckSchema.safeParse(JSON.parse(raw));
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    },

    save(deck: Deck): void {
      const valid = DeckSchema.parse(deck);
      kv.setItem(deckKey(valid.id), JSON.stringify(valid));
      const index = readIndex().filter((d) => d.id !== valid.id);
      index.push({ id: valid.id, title: valid.title, updatedAt: valid.updatedAt });
      writeIndex(index);
    },

    remove(id: string): void {
      kv.removeItem(deckKey(id));
      writeIndex(readIndex().filter((d) => d.id !== id));
    },
  };
}

export type DeckStore = ReturnType<typeof createDeckStore>;
