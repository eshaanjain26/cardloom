import { createDeckStore, type DeckStore, type KeyValue } from "./store";

function memoryKeyValue(): KeyValue {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let store: DeckStore | null = null;

// localStorage can throw in private windows or when site data is blocked; fall
// back to an in-memory store so the editor still works for the session.
export function browserDeckStore(): DeckStore {
  if (store) return store;
  try {
    const probe = "cardloom:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    store = createDeckStore(window.localStorage);
  } catch {
    store = createDeckStore(memoryKeyValue());
  }
  return store;
}
