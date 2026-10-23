"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "@/components/CardView";
import { presentSequence } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { presentKey } from "@/lib/present/keys";
import { createDwellTracker, trackingAllowed, type ViewEvent } from "@/lib/share/analytics";
import { getTheme, themeVars } from "@/lib/themes";

function visitorId(): string {
  try {
    const existing = localStorage.getItem("cardloom:visitor");
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem("cardloom:visitor", fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function useAnalytics(shareId: string, active: string | null) {
  const tracker = useRef<ReturnType<typeof createDwellTracker> | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!trackingAllowed({ doNotTrack: nav.doNotTrack, globalPrivacyControl: nav.globalPrivacyControl })) return;
    const visitor = visitorId();
    const t = createDwellTracker(visitor);
    tracker.current = t;
    const send = (events: ViewEvent[], beacon = false) => {
      if (!events.length) return;
      const url = `/api/shares/${shareId}/events`;
      const body = JSON.stringify(events);
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      else void fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    send([{ type: "view", visitor }]);
    const timer = window.setInterval(() => send(t.flush()), 15_000);
    const onVisibility = () => {
      t.setVisible(document.visibilityState === "visible");
      if (document.visibilityState === "hidden") send(t.flush(), true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      send(t.flush(), true);
      tracker.current = null;
    };
  }, [shareId]);

  useEffect(() => tracker.current?.setActive(active), [active]);
}

export function DeckViewer({ deck, shareId, kind }: { deck: Deck; shareId: string; kind: "link" | "site" }) {
  const steps = useMemo(() => presentSequence(deck), [deck]);
  const theme = getTheme(deck.themeId);
  const [active, setActive] = useState<string | null>(steps[0]?.card.id ?? null);
  const [presenting, setPresenting] = useState<number | null>(null);
  useAnalytics(shareId, presenting === null ? active : (steps[presenting]?.card.id ?? null));

  useEffect(() => {
    if (presenting !== null) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setActive(best.target.getAttribute("data-card-id"));
      },
      { threshold: [0.4, 0.7] },
    );
    document.querySelectorAll("[data-card-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [presenting, steps]);

  useEffect(() => {
    if (presenting === null) return;
    const onKey = (e: KeyboardEvent) => {
      const action = presentKey(e.key, presenting, steps.length);
      if (!action || action.type === "toggle-notes") return;
      e.preventDefault();
      if (action.type === "go") setPresenting(action.index);
      else setPresenting(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, steps.length]);

  const style = { ...themeVars(theme), background: "var(--cl-bg)", color: "var(--cl-text)" } as React.CSSProperties;

  if (presenting !== null) {
    return (
      <div className="fixed inset-0 flex flex-col font-sans" style={style}>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-10">
          <button type="button" aria-label="Previous card" className="absolute inset-y-0 left-0 w-1/4" onClick={() => setPresenting(Math.max(0, presenting - 1))} />
          <div className="cl-stage" aria-live="polite">
            <CardView key={steps[presenting].card.id} card={steps[presenting].card} className="cl-card-present" />
          </div>
          <button
            type="button"
            aria-label="Next card"
            className="absolute inset-y-0 right-0 w-1/4"
            onClick={() => setPresenting(Math.min(steps.length - 1, presenting + 1))}
          />
        </div>
        <footer className="flex items-center gap-3 px-4 py-2 text-xs" style={{ color: "var(--cl-muted)" }}>
          <button type="button" onClick={() => setPresenting(null)} className="hover:underline">
            Exit
          </button>
          <span className="ml-auto font-mono">
            {presenting + 1} / {steps.length}
          </span>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans" style={style}>
      <header className="sticky top-0 z-10 border-b px-4 py-3 backdrop-blur" style={{ borderColor: "color-mix(in srgb, var(--cl-muted) 25%, transparent)", background: "color-mix(in srgb, var(--cl-bg) 85%, transparent)" }}>
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <h1 className="min-w-0 flex-1 truncate font-semibold" style={{ fontFamily: "var(--cl-font-heading)" }}>
            {deck.title}
          </h1>
          {kind === "link" && (
            <button
              type="button"
              onClick={() => setPresenting(Math.max(0, steps.findIndex((s) => s.card.id === active)))}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--cl-accent)", color: "var(--cl-surface)" }}
            >
              Present
            </button>
          )}
        </div>
        {kind === "site" && steps.length > 1 && (
          <nav aria-label="Sections" className="mx-auto mt-2 flex max-w-4xl gap-4 overflow-x-auto text-sm" style={{ color: "var(--cl-muted)" }}>
            {steps
              .filter((s) => s.depth === 0)
              .map(({ card }, i) => (
                <a key={card.id} href={`#card-${card.id}`} className={`shrink-0 hover:underline ${active === card.id ? "font-semibold" : ""}`} style={active === card.id ? { color: "var(--cl-text)" } : undefined}>
                  {i + 1}. {sectionLabel(card)}
                </a>
              ))}
          </nav>
        )}
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        {steps.map(({ card, depth }) => (
          <section key={card.id} id={`card-${card.id}`} data-card-id={card.id} className="scroll-mt-28" style={{ marginLeft: depth * 24 }}>
            <CardView card={card} />
          </section>
        ))}
      </main>
      <footer className="px-4 pb-10 text-center text-xs" style={{ color: "var(--cl-muted)" }}>
        Made with{" "}
        <a href="https://github.com/eshaanjain26/cardloom" className="underline">
          Cardloom
        </a>
      </footer>
    </div>
  );
}

function sectionLabel(card: Deck["cards"][number]): string {
  const heading = (card.content.content ?? []).find((n) => (n as { type?: string }).type === "heading") as { content?: { text?: string }[] } | undefined;
  return (heading?.content ?? []).map((t) => t.text ?? "").join("").slice(0, 40) || "Section";
}
