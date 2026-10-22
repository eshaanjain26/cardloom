"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserAiStore, USAGE_EVENT } from "@/lib/ai/client";
import { estimateImpact, formatImpact, type Impact } from "@/lib/ai/impact";

type Props = { deckId?: string; eventIds?: string[]; className?: string };

export function ImpactMeter({ deckId, eventIds, className = "" }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const idsKey = eventIds?.join(",");

  useEffect(() => {
    function refresh() {
      const ai = browserAiStore();
      let events = ai.usage(deckId);
      if (idsKey !== undefined) {
        const ids = new Set(idsKey.split(","));
        events = events.filter((e) => ids.has(e.id));
      }
      setImpact(estimateImpact(events, ai.settings().impact));
    }
    refresh();
    window.addEventListener(USAGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(USAGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [deckId, idsKey]);

  if (!impact || impact.calls === 0) return null;
  const f = formatImpact(impact);
  return (
    <Link
      href="/settings#impact"
      title={`${impact.calls} AI call${impact.calls === 1 ? "" : "s"}. Energy and CO₂ are estimates; see Settings.${
        impact.unpricedModels.length ? ` No price set for: ${impact.unpricedModels.join(", ")}.` : ""
      }`}
      className={`inline-flex flex-wrap items-center gap-x-2 rounded-full border border-neutral-200 bg-white px-3 py-1 font-mono text-[11px] text-neutral-600 hover:border-neutral-400 ${className}`}
    >
      <span>{f.tokens}</span>
      <span aria-hidden>·</span>
      <span>{f.cost}</span>
      <span aria-hidden>·</span>
      <span>{f.energy}</span>
      <span aria-hidden>·</span>
      <span>{f.co2}</span>
    </Link>
  );
}
