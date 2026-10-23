"use client";

import { toBlob } from "html-to-image";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CardView } from "@/components/CardView";
import { field, Modal, primaryBtn } from "@/components/media/Modal";
import { presentSequence } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { cardLabel } from "@/lib/deck/text";
import { exportMarkdown, exportPngs, exportPptx, fetchableImageUrl } from "@/lib/io/client";
import { fetchStats, publish, sharesFor, shareUrl, suggestSlug, unpublish, type PublishedShare } from "@/lib/share/client";
import type { ShareKind, Stats } from "@/lib/share/store";
import { getTheme, themeVars } from "@/lib/themes";

type Tab = "link" | "site" | "export";

const EXPIRY: [string, number | null][] = [
  ["Never", null],
  ["1 day", 1],
  ["7 days", 7],
  ["30 days", 30],
];

const secondary = "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 disabled:opacity-50";

function StatsView({ share, deck }: { share: PublishedShare; deck: Deck }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStats(share).then(setStats, (e: Error) => setError(e.message));
  }, [share]);
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!stats) return <p className="text-sm text-neutral-500">Loading views…</p>;
  const cards = presentSequence(deck).map(({ card }, i) => ({ i, card, s: stats.cards[card.id] }));
  const maxAvg = Math.max(1, ...cards.map((c) => (c.s ? c.s.dwellMs / c.s.views : 0)));
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Views", stats.views],
          ["Visitors", stats.visitors],
          ["Last viewed", stats.lastViewedAt ? new Date(stats.lastViewedAt).toLocaleDateString() : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-neutral-50 p-2">
            <dt className="text-xs text-neutral-500">{k}</dt>
            <dd className="text-lg font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-left text-xs">
        <caption className="mb-1 text-left text-xs text-neutral-500">Average time on each card</caption>
        <tbody>
          {cards.map(({ i, card, s }) => {
            const avg = s ? s.dwellMs / s.views : 0;
            return (
              <tr key={card.id}>
                <td className="w-6 py-0.5 font-mono text-neutral-400">{i + 1}</td>
                <td className="max-w-0 truncate py-0.5 pr-2">{cardLabel(card)}</td>
                <td className="w-1/3 py-0.5">
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div className="h-2 rounded-full bg-neutral-800" style={{ width: `${(avg / maxAvg) * 100}%` }} />
                  </div>
                </td>
                <td className="w-12 py-0.5 text-right font-mono">{avg ? `${(avg / 1000).toFixed(1)}s` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">Anonymous: no names or IP addresses are stored, and visitors with Do Not Track or Global Privacy Control are not counted.</p>
    </div>
  );
}

function PublishPanel({ deck, kind }: { deck: Deck; kind: ShareKind }) {
  const [share, setShare] = useState<PublishedShare | undefined>(undefined);
  const [slug, setSlug] = useState(suggestSlug(deck.title));
  const [password, setPassword] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const s = sharesFor(deck.id)[kind];
    setShare(s);
    if (s?.slug) setSlug(s.slug);
  }, [deck.id, kind]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await fn() });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong", error: true });
    } finally {
      setBusy(false);
    }
  }

  const expiresAt = expiryDays ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : null;
  const doPublish = (opts: { password?: string | null }) =>
    run(async () => {
      const res = await publish(deck, kind, { slug: kind === "site" ? slug : null, expiresAt, ...opts });
      setShare(res.share);
      setPassword("");
      return `${share ? "Updated" : "Published"}.${res.missingImages ? ` ${res.missingImages} image(s) were not in this browser and show as placeholders.` : ""}`;
    });

  return (
    <div className="flex flex-col gap-4">
      {share && (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
          <div className="flex gap-2">
            <input readOnly aria-label="Share URL" className={`${field} font-mono text-xs`} value={shareUrl(share, kind)} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className={secondary}
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl(share, kind));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a className={secondary} href={shareUrl(share, kind)} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
          <p className="text-xs text-neutral-500">
            Published {new Date(share.publishedAt).toLocaleString()}. Viewers see that version until you update it.
            {share.hasPassword ? " Password protected." : ""}
            {share.expiresAt ? ` Expires ${new Date(share.expiresAt).toLocaleString()}.` : ""}
          </p>
        </div>
      )}

      {kind === "site" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Web address
          <div className="flex items-center gap-1 text-sm">
            <span className="shrink-0 font-normal text-neutral-500">{typeof window === "undefined" ? "" : `${window.location.host}/p/`}</span>
            <input className={field} value={slug} maxLength={48} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <span className="text-xs font-normal text-neutral-500">Public, indexed by search engines, with the deck title and first lines as its description.</span>
        </label>
      )}

      {kind === "link" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {share?.hasPassword ? "New password" : "Password"} <span className="font-normal text-neutral-500">(optional, 4+ characters)</span>
            <input type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Expires
            <select className={field} value={String(expiryDays)} onChange={(e) => setExpiryDays(e.target.value === "null" ? null : Number(e.target.value))}>
              {EXPIRY.map(([label, days]) => (
                <option key={label} value={String(days)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || (password.length > 0 && password.length < 4)}
          onClick={() => doPublish(password ? { password } : {})}
        >
          {busy ? "Working…" : share ? "Update with latest changes" : kind === "site" ? "Publish website" : "Create link"}
        </button>
        {share?.hasPassword && kind === "link" && (
          <button type="button" className={secondary} disabled={busy} onClick={() => doPublish({ password: null })}>
            Remove password
          </button>
        )}
        {share && (
          <button
            type="button"
            className={`${secondary} hover:border-red-700 hover:text-red-700`}
            disabled={busy}
            onClick={() => {
              if (window.confirm(kind === "site" ? "Unpublish this website?" : "Stop sharing? The link will stop working.")) {
                void run(async () => {
                  await unpublish(deck.id, kind);
                  setShare(undefined);
                  return kind === "site" ? "Unpublished." : "Link removed.";
                });
              }
            }}
          >
            {kind === "site" ? "Unpublish" : "Stop sharing"}
          </button>
        )}
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-red-700" : "text-neutral-700"}`}>
          {message.text}
        </p>
      )}
      {share && <StatsView share={share} deck={deck} />}
    </div>
  );
}

// Renders each card off-screen at 1280x720 and captures it as a PNG.
async function renderCardPng(deck: Deck, cardId: string): Promise<Blob | null> {
  const step = presentSequence(deck).find((s) => s.card.id === cardId);
  if (!step) return null;
  const proxied = JSON.parse(JSON.stringify(step.card), (k, v) => (k === "src" && typeof v === "string" && v.startsWith("https://") ? fetchableImageUrl(v) : v));
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: "1280px" });
  document.body.appendChild(host);
  const root = createRoot(host);
  const theme = getTheme(deck.themeId);
  root.render(
    <div className="cl-export" style={{ ...themeVars(theme), background: "var(--cl-bg)", padding: 40, width: 1280, height: 720, boxSizing: "border-box" } as React.CSSProperties}>
      <div className="cl-stage" style={{ width: 1200 }}>
        <CardView card={proxied} className="cl-card-present" />
      </div>
    </div>,
  );
  try {
    await new Promise((r) => setTimeout(r, 400));
    // Off-screen lazy images never load, so load them now and cap the wait.
    const images = Array.from(host.querySelectorAll("img"));
    images.forEach((img) => (img.loading = "eager"));
    await Promise.all(images.map((img) => Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])));
    return await toBlob(host.firstElementChild as HTMLElement, { pixelRatio: 1.5, width: 1280, height: 720 });
  } finally {
    root.unmount();
    host.remove();
  }
}

function ExportPanel({ deck }: { deck: Deck }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const run = (label: string, fn: () => Promise<string | void>) => async () => {
    setBusy(label);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ text });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Export failed", error: true });
    } finally {
      setBusy(null);
    }
  };
  const items: { label: string; detail: string; action: () => Promise<void> }[] = [
    {
      label: "PowerPoint (.pptx)",
      detail: "Editable slides with native charts and speaker notes.",
      action: run("pptx", async () => {
        const { skippedImages } = await exportPptx(deck);
        return skippedImages ? `${skippedImages} image(s) could not be fetched and were left out.` : undefined;
      }),
    },
    {
      label: "PDF",
      detail: "Opens a print view; choose Save as PDF.",
      action: run("pdf", async () => {
        window.open(`/decks/${deck.id}/print`, "_blank", "noopener");
      }),
    },
    {
      label: "PNG images",
      detail: "One 1920×1080 image per card, zipped.",
      action: run("png", async () => {
        const { failed } = await exportPngs(deck, (id) => renderCardPng(deck, id));
        return failed ? `${failed} card(s) could not be rendered.` : undefined;
      }),
    },
    {
      label: "Markdown (.md)",
      detail: "Plain text that imports back into Cardloom.",
      action: run("md", async () => exportMarkdown(deck)),
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          disabled={busy !== null}
          onClick={() => void it.action()}
          className="flex flex-col rounded-xl border border-neutral-200 px-4 py-3 text-left hover:border-neutral-900 disabled:opacity-50"
        >
          <span className="text-sm font-medium">{it.label}</span>
          <span className="text-xs text-neutral-500">{it.detail}</span>
        </button>
      ))}
      {busy && <p className="text-sm text-neutral-600">Exporting…</p>}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-red-700" : "text-neutral-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function ShareDialog({ deck, open, onClose }: { deck: Deck; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("link");
  const tabs: [Tab, string][] = [
    ["link", "Share link"],
    ["site", "Website"],
    ["export", "Export"],
  ];
  return (
    <Modal open={open} title="Share and export" onClose={onClose}>
      <div role="tablist" className="mb-4 flex gap-2">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-sm ${tab === t ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "link" && <PublishPanel key="link" deck={deck} kind="link" />}
      {tab === "site" && <PublishPanel key="site" deck={deck} kind="site" />}
      {tab === "export" && <ExportPanel deck={deck} />}
    </Modal>
  );
}
