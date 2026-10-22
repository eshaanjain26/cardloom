import { createDeckStore, type DeckStore, type KeyValue } from "./store";

function memoryKeyValue(): KeyValue {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let kv: KeyValue | null = null;
let store: DeckStore | null = null;

// localStorage can throw in private windows or when site data is blocked; fall
// back to an in-memory store so the app still works for the session.
export function browserKeyValue(): KeyValue {
  if (kv) return kv;
  try {
    const probe = "cardloom:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    kv = window.localStorage;
  } catch {
    kv = memoryKeyValue();
  }
  return kv;
}

export function browserDeckStore(): DeckStore {
  store ??= createDeckStore(browserKeyValue());
  return store;
}
