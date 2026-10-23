export type ViewEvent = { type: "view"; visitor: string } | { type: "dwell"; visitor: string; cardId: string; ms: number };

// Collects time on the active card and turns it into dwell events. Kept free
// of browser APIs so it can be tested; the hook wires it to timers and beacons.
export function createDwellTracker(visitor: string, now: () => number = Date.now) {
  let active: string | null = null;
  let since = now();
  let visible = true;
  const pending = new Map<string, number>();

  const settle = () => {
    const t = now();
    if (active && visible) pending.set(active, (pending.get(active) ?? 0) + (t - since));
    since = t;
  };

  return {
    setActive(cardId: string | null) {
      settle();
      active = cardId;
    },
    setVisible(v: boolean) {
      settle();
      visible = v;
    },
    // Dwell under a second is noise from scrolling past a card.
    flush(): ViewEvent[] {
      settle();
      const events: ViewEvent[] = [];
      for (const [cardId, ms] of pending) if (ms >= 1000) events.push({ type: "dwell", visitor, cardId, ms: Math.round(ms) });
      pending.clear();
      return events;
    },
  };
}

export function trackingAllowed(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  return nav.doNotTrack !== "1" && nav.globalPrivacyControl !== true;
}
