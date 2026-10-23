"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FigureAttrs } from "@/lib/editor/nodes";
import { safeImageSrc } from "@/lib/media/embeds";
import { generateAiImage, hasImageKey, searchStockImages, storeImage } from "@/lib/media/client";
import type { StockImage } from "@/lib/media/stock";
import { field, Modal, primaryBtn } from "./Modal";

type Tab = "search" | "upload" | "generate" | "link";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (attrs: FigureAttrs) => void;
  deckId: string | null;
  initialQuery?: string;
};

export function ImageDialog({ open, onClose, onPick, deckId, initialQuery = "" }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<StockImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialQuery);
  const [link, setLink] = useState("");
  const [alt, setAlt] = useState("");
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setPrompt(initialQuery);
    setResults(null);
    setError(null);
  }, [open, initialQuery]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const pick = (attrs: Partial<FigureAttrs> & { src: string }) =>
    onPick({ alt: "", credit: "", creditUrl: null, query: null, ...attrs });

  const tabs: [Tab, string][] = [
    ["search", "Free photos"],
    ["upload", "Upload"],
    ["generate", "Generate"],
    ["link", "Link"],
  ];

  return (
    <Modal open={open} title="Add image" onClose={onClose}>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
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

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {tab === "search" && (
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void run(async () => setResults(await searchStockImages(query.trim())));
            }}
          >
            <input aria-label="Search free photos" className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="solar panels on a roof" />
            <button type="submit" className={primaryBtn} disabled={busy || !query.trim()}>
              Search
            </button>
          </form>
          <p className="text-xs text-neutral-500">Openly licensed images from Openverse. The credit line is added for you; check each license before commercial use.</p>
          {results && results.length === 0 && <p className="text-sm text-neutral-500">No results.</p>}
          {results && results.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {results.filter((r) => !broken.has(r.id)).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pick({ src: r.url, alt: r.alt, credit: r.credit, creditUrl: r.creditUrl })}
                    className="group block w-full overflow-hidden rounded-lg border border-neutral-200 text-left hover:border-neutral-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnails of unknown size */}
                    <img
                      src={r.thumb}
                      alt={r.alt}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setBroken((b) => new Set(b).add(r.id))}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-[11px] text-neutral-500">{r.credit}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "upload" && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 p-8 text-sm text-neutral-600 hover:border-neutral-500">
          {busy ? "Saving…" : "Choose an image (PNG, JPEG, WebP, GIF; up to 15 MB)"}
          <span className="text-xs text-neutral-500">Stored in this browser only.</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(async () => pick({ src: await storeImage(file), alt: file.name.replace(/\.[^.]+$/, "") }));
            }}
          />
        </label>
      )}

      {tab === "generate" &&
        (hasImageKey() ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => pick({ src: await generateAiImage(prompt.trim(), deckId), alt: prompt.trim().slice(0, 200) }));
            }}
          >
            <textarea aria-label="Describe the image" className={field} rows={3} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Rows of solar panels on a brick school roof at golden hour" />
            <button type="submit" className={`${primaryBtn} w-fit`} disabled={busy || !prompt.trim()}>
              {busy ? "Generating… (up to a minute)" : "Generate"}
            </button>
            <p className="text-xs text-neutral-500">Uses your OpenAI key and the image model set in Settings. The image is stored in this browser.</p>
          </form>
        ) : (
          <p className="text-sm text-neutral-600">
            Image generation uses OpenAI. Add an OpenAI key in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </p>
        ))}

      {tab === "link" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const src = safeImageSrc(link.trim());
            if (!src) setError("Use an https:// image URL.");
            else pick({ src, alt: alt.trim() });
          }}
        >
          <input aria-label="Image URL" className={field} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/image.jpg" />
          <input aria-label="Alt text" className={field} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for screen readers" />
          <button type="submit" className={`${primaryBtn} w-fit`} disabled={!link.trim()}>
            Add
          </button>
        </form>
      )}
    </Modal>
  );
}
