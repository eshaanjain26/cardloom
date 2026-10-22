"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserDeckStore } from "@/lib/deck/browser-store";
import { createDeck } from "@/lib/deck/ops";
import type { DeckSummary } from "@/lib/deck/store";

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);

  useEffect(() => setDecks(browserDeckStore().list()), []);

  function newDeck() {
    const deck = createDeck("Untitled deck", new Date().toISOString());
    browserDeckStore().save(deck);
    router.push(`/decks/${deck.id}`);
  }

  function remove(d: DeckSummary) {
    if (!window.confirm(`Delete “${d.title}”? This cannot be undone.`)) return;
    browserDeckStore().remove(d.id);
    setDecks(browserDeckStore().list());
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12 font-sans sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="font-mono text-sm text-neutral-500">
            cardloom
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Your decks</h1>
        </div>
        <button
          type="button"
          onClick={newDeck}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          New deck
        </button>
      </header>

      <p className="text-sm text-neutral-500">Decks are saved in this browser only.</p>

      {decks === null ? null : decks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          No decks yet. Start one with <strong>New deck</strong>.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200">
          {decks.map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-4 py-3">
              <Link href={`/decks/${d.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.title}</span>
                <span className="text-xs text-neutral-500">Edited {new Date(d.updatedAt).toLocaleString()}</span>
              </Link>
              <Link href={`/decks/${d.id}/present`} className="text-sm text-neutral-600 hover:text-neutral-900">
                Present
              </Link>
              <button type="button" onClick={() => remove(d)} className="text-sm text-neutral-500 hover:text-red-700">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
