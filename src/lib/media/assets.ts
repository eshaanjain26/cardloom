import type { Card, Deck } from "../deck/schema";
import { presentSequence } from "../deck/ops";
import { assetId } from "./embeds";

// Uploaded and generated images live in IndexedDB, not in the deck JSON, so
// decks stay small enough for localStorage. Decks refer to them as asset:<id>.

const DB_NAME = "cardloom-assets";
const STORE = "assets";

type AssetRecord = { id: string; blob: Blob; createdAt: string };

function openDb(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createAssetStore(idb?: IDBFactory) {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => (db ??= openDb(idb));
  const urls = new Map<string, string>();

  return {
    async put(blob: Blob): Promise<string> {
      const id = crypto.randomUUID();
      const record: AssetRecord = { id, blob, createdAt: new Date().toISOString() };
      await tx(await conn(), "readwrite", (s) => s.put(record));
      return id;
    },
    async get(id: string): Promise<Blob | null> {
      const rec = (await tx(await conn(), "readonly", (s) => s.get(id))) as AssetRecord | undefined;
      return rec?.blob ?? null;
    },
    async url(id: string): Promise<string | null> {
      const cached = urls.get(id);
      if (cached) return cached;
      const blob = await this.get(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    },
    async ids(): Promise<string[]> {
      return (await tx(await conn(), "readonly", (s) => s.getAllKeys())) as string[];
    },
    async remove(id: string): Promise<void> {
      await tx(await conn(), "readwrite", (s) => s.delete(id));
      const url = urls.get(id);
      if (url) URL.revokeObjectURL(url);
      urls.delete(id);
    },
    // Deletes every stored image that no deck refers to.
    async collect(referenced: Set<string>): Promise<number> {
      let removed = 0;
      for (const id of await this.ids()) {
        if (!referenced.has(id)) {
          await this.remove(id);
          removed++;
        }
      }
      return removed;
    },
  };
}
export type AssetStore = ReturnType<typeof createAssetStore>;

type PMNode = { type?: string; attrs?: Record<string, unknown>; content?: PMNode[] };

function visit(node: PMNode, fn: (n: PMNode) => void) {
  fn(node);
  node.content?.forEach((c) => visit(c, fn));
}

export function assetIdsInCard(card: Card): string[] {
  const ids: string[] = [];
  visit(card.content as PMNode, (n) => {
    if (n.type === "figure") {
      const id = assetId(typeof n.attrs?.src === "string" ? n.attrs.src : null);
      if (id) ids.push(id);
    }
  });
  return ids;
}

export function assetIdsInDeck(deck: Deck): string[] {
  return presentSequence(deck).flatMap(({ card }) => assetIdsInCard(card));
}

let browserStore: AssetStore | null = null;
export function browserAssetStore(): AssetStore {
  browserStore ??= createAssetStore();
  return browserStore;
}
