"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AgentPanel } from "@/components/AgentPanel";
import { CardEditor } from "@/components/CardEditor";
import { ImpactMeter } from "@/components/ImpactMeter";
import { browserDeckStore } from "@/lib/deck/browser-store";
import {
  addChildCard,
  emptyCard,
  insertCardAfter,
  moveCard,
  presentSequence,
  removeCard,
  updateCard,
} from "@/lib/deck/ops";
import type { Card, Deck } from "@/lib/deck/schema";
import { cardLabel } from "@/lib/deck/text";
import { THEMES, getTheme, themeVars } from "@/lib/themes";

export default function DeckEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  const [saved, setSaved] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  // Bumped when the deck changes from outside the editors (AI edits, undo) so
  // each Tiptap instance remounts with the new content.
  const [rev, setRev] = useState(0);

  useEffect(() => setDeck(browserDeckStore().get(id)), [id]);

  useEffect(() => {
    if (!deck) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      browserDeckStore().save(deck);
      setSaved(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [deck]);

  const apply = useCallback((fn: (d: Deck, now: string) => Deck) => {
    setDeck((d) => (d ? fn(d, new Date().toISOString()) : d));
  }, []);

  if (deck === undefined) return null;
  if (deck === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center font-sans">
        <h1 className="text-2xl font-semibold">Deck not found</h1>
        <p className="mt-2 text-neutral-500">It may have been deleted, or it was saved in a different browser.</p>
        <Link href="/decks" className="mt-6 inline-block underline">
          Back to your decks
        </Link>
      </main>
    );
  }

  const theme = getTheme(deck.themeId);
  const steps = presentSequence(deck);
  const focusIndex = steps.findIndex((st) => st.card.id === focusCardId);

  const handlers = (card: Card) => ({
    onChange: (patch: Partial<Pick<Card, "content" | "layout" | "notes">>) =>
      apply((d, now) => updateCard(d, card.id, patch, now)),
    onAddAfter: () => apply((d, now) => insertCardAfter(d, card.id, emptyCard(), now)),
    onAddChild: () => apply((d, now) => addChildCard(d, card.id, emptyCard(), now)),
    onMove: (dir: -1 | 1) => apply((d, now) => moveCard(d, card.id, dir, now)),
    onRemove: () => apply((d, now) => removeCard(d, card.id, now)),
    onFocus: () => setFocusCardId(card.id),
  });

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur">
        <Link href="/decks" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Decks
        </Link>
        <input
          aria-label="Deck title"
          value={deck.title}
          maxLength={200}
          onChange={(e) => apply((d, now) => ({ ...d, title: e.target.value || "Untitled deck", updatedAt: now }))}
          className="min-w-0 flex-1 rounded px-2 py-1 text-base font-medium hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
        />
        <ImpactMeter deckId={deck.id} className="hidden md:inline-flex" />
        <span className="text-xs text-neutral-500" aria-live="polite">
          {saved ? "Saved" : "Saving…"}
        </span>
        <label className="flex items-center gap-1 text-sm text-neutral-600">
          Theme
          <select
            value={deck.themeId}
            onChange={(e) => apply((d, now) => ({ ...d, themeId: e.target.value, updatedAt: now }))}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setAiOpen((o) => !o)}
          aria-pressed={aiOpen}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-900"
        >
          Ask AI
        </button>
        <Link
          href={`/decks/${deck.id}/present`}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Present
        </Link>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <nav aria-label="Card outline" className="sticky top-16 hidden h-fit w-56 shrink-0 lg:block">
          <ol className="flex flex-col gap-1 text-sm">
            {steps.map(({ card, depth }, i) => (
              <li key={card.id} style={{ paddingLeft: depth * 12 }}>
                <a
                  href={`#card-${card.id}`}
                  className="flex gap-2 truncate rounded px-2 py-1 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-neutral-400">{i + 1}</span>
                  <span className="truncate">{cardLabel(card)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div
          className="min-w-0 flex-1 rounded-2xl p-4 sm:p-8"
          style={{ ...themeVars(theme), background: "var(--cl-bg)" } as React.CSSProperties}
        >
          {steps.map(({ card, depth }) => (
            <CardEditor key={`${card.id}-${rev}`} card={card} depth={depth} {...handlers(card)} />
          ))}
        </div>
      </div>

      {aiOpen && (
        <AgentPanel
          deck={deck}
          focusCardId={focusIndex === -1 ? null : focusCardId}
          focusLabel={focusIndex === -1 ? null : `Card ${focusIndex + 1}: ${cardLabel(steps[focusIndex].card)}`}
          onClearFocus={() => setFocusCardId(null)}
          onApply={(next) => {
            setDeck(next);
            setRev((r) => r + 1);
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
