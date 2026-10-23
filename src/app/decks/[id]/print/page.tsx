"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CardView } from "@/components/CardView";
import { browserDeckStore } from "@/lib/deck/browser-store";
import { presentSequence } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { getTheme, themeVars } from "@/lib/themes";

// One 16:9 page per card, then the browser's print dialog (Save as PDF).
export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);

  useEffect(() => setDeck(browserDeckStore().get(id)), [id]);

  useEffect(() => {
    if (!deck) return;
    document.title = deck.title;
    const timer = window.setTimeout(async () => {
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener("load", r, { once: true });
                img.addEventListener("error", r, { once: true });
              }),
        ),
      );
      // Next.js resets the title on hydration; the PDF's default filename uses it.
      document.title = deck.title;
      window.print();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [deck]);

  if (deck === undefined) return null;
  if (deck === null) return <p className="p-8 font-sans">Deck not found in this browser.</p>;
  const theme = getTheme(deck.themeId);
  return (
    <div className="cl-print font-sans" style={{ ...themeVars(theme), background: "var(--cl-bg)" } as React.CSSProperties}>
      <p className="cl-print-hint">Choose “Save as PDF” in the print dialog. Turn on background graphics to keep theme colors.</p>
      {presentSequence(deck).map(({ card }) => (
        <section key={card.id} className="cl-print-page">
          <div className="cl-stage">
            <CardView card={card} className="cl-card-present" />
          </div>
        </section>
      ))}
    </div>
  );
}
