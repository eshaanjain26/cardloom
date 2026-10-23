"use client";

import { generateHTML } from "@tiptap/html";
import { useEffect, useMemo, useRef } from "react";
import type { Card } from "@/lib/deck/schema";
import { cardExtensions } from "@/lib/editor/extensions";
import { hydrateMedia } from "@/lib/media/hydrate";

export function CardView({ card, className = "" }: { card: Card; className?: string }) {
  const html = useMemo(() => generateHTML(card.content, cardExtensions), [card.content]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) hydrateMedia(ref.current);
  }, [html]);
  return (
    <div className={`cl-card cl-layout-${card.layout} ${className}`}>
      <div ref={ref} className="cl-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
