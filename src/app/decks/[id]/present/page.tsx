"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CardView } from "@/components/CardView";
import { browserDeckStore } from "@/lib/deck/browser-store";
import { presentSequence } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { presentKey } from "@/lib/present/keys";
import { getTheme, themeVars } from "@/lib/themes";

export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => setDeck(browserDeckStore().get(id)), [id]);
  const steps = useMemo(() => (deck ? presentSequence(deck) : []), [deck]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = presentKey(e.key, index, steps.length);
      if (!action) return;
      e.preventDefault();
      if (action.type === "go") setIndex(action.index);
      if (action.type === "toggle-notes") setShowNotes((s) => !s);
      if (action.type === "exit") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else router.push(`/decks/${id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, router, id]);

  if (deck === undefined) return null;
  if (deck === null || steps.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center font-sans">
        <h1 className="text-2xl font-semibold">Deck not found</h1>
        <Link href="/decks" className="mt-6 inline-block underline">
          Back to your decks
        </Link>
      </main>
    );
  }

  const step = steps[Math.min(index, steps.length - 1)];
  const theme = getTheme(deck.themeId);
  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));

  return (
    <div
      className="fixed inset-0 flex flex-col font-sans"
      style={{ ...themeVars(theme), background: "var(--cl-bg)", color: "var(--cl-text)" } as React.CSSProperties}
    >
      <h1 className="sr-only">{deck.title}</h1>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-10">
        <button
          type="button"
          aria-label="Previous card"
          className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize"
          onClick={() => go(-1)}
        />
        <div className="cl-stage" aria-live="polite">
          <CardView key={step.card.id} card={step.card} className="cl-card-present" />
        </div>
        <button
          type="button"
          aria-label="Next card"
          className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize"
          onClick={() => go(1)}
        />
      </div>

      {showNotes && (
        <aside
          aria-label="Speaker notes"
          className="max-h-40 overflow-auto border-t px-6 py-3 text-sm whitespace-pre-wrap"
          style={{ borderColor: "var(--cl-muted)", background: "var(--cl-surface)" }}
        >
          {step.card.notes || <span style={{ color: "var(--cl-muted)" }}>No notes for this card.</span>}
        </aside>
      )}

      <footer className="flex items-center gap-3 px-4 py-2 text-xs" style={{ color: "var(--cl-muted)" }}>
        <Link href={`/decks/${id}`} className="hover:underline">
          Exit
        </Link>
        <button type="button" onClick={() => setShowNotes((s) => !s)} className="hover:underline">
          Notes (N)
        </button>
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.()}
          className="hover:underline"
        >
          Fullscreen
        </button>
        <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cl-surface)" }}>
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${((index + 1) / steps.length) * 100}%`, background: "var(--cl-accent)" }}
          />
        </div>
        <span className="font-mono">
          {index + 1} / {steps.length}
        </span>
      </footer>
    </div>
  );
}
