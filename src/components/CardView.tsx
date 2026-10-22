"use client";

import { generateHTML } from "@tiptap/html";
import { useMemo } from "react";
import type { Card } from "@/lib/deck/schema";
import { cardExtensions } from "@/lib/editor/extensions";

export function CardView({ card, className = "" }: { card: Card; className?: string }) {
  const html = useMemo(() => generateHTML(card.content, cardExtensions), [card.content]);
  return (
    <div className={`cl-card cl-layout-${card.layout} ${className}`}>
      <div className="cl-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
