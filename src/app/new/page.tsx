"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImpactMeter } from "@/components/ImpactMeter";
import { browserAiStore, callAi } from "@/lib/ai/client";
import { batchRanges, deckFromGeneration } from "@/lib/ai/pipelines";
import { PROVIDER_LABELS } from "@/lib/ai/providers";
import { MAX_CARDS, MAX_INPUT_CHARS, type GenCard, type Outline, type OutlineRequest } from "@/lib/ai/schemas";
import { providerConfig } from "@/lib/ai/settings";
import { browserDeckStore } from "@/lib/deck/browser-store";
import { DECK_FORMATS } from "@/lib/deck/schema";
import { THEMES } from "@/lib/themes";

type Step = "input" | "outline" | "writing";

const field = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";
const primary =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function NewDeckPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [modelLabel, setModelLabel] = useState("");
  const [req, setReq] = useState<OutlineRequest>({
    mode: "prompt",
    input: "",
    format: "presentation",
    cardCount: 8,
    textHandling: "condense",
    tone: "",
    audience: "",
    language: "English",
  });
  const [outline, setOutline] = useState<Outline | null>(null);
  const [themeId, setThemeId] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [written, setWritten] = useState<GenCard[]>([]);

  useEffect(() => {
    const c = providerConfig(browserAiStore().settings());
    setModelLabel(`${c.model} via ${PROVIDER_LABELS[c.provider]}`);
  }, []);

  async function makeOutline() {
    setBusy(true);
    setError(null);
    try {
      const res = await callAi<Outline>("outline", { request: req }, null);
      setEventIds((ids) => [...ids, res.eventId]);
      setOutline(res.data);
      setStep("outline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outline failed");
    } finally {
      setBusy(false);
    }
  }

  async function writeDeck(outline: Outline, from: GenCard[] = []) {
    setStep("writing");
    setBusy(true);
    setError(null);
    const cards = [...from];
    const ids = [...eventIds];
    try {
      for (const [start, end] of batchRanges(outline.cards.length)) {
        if (end <= cards.length) continue;
        const res = await callAi<{ cards: GenCard[] }>("cards", { request: req, outline, start, end }, null);
        ids.push(res.eventId);
        cards.push(...res.data.cards);
        setWritten([...cards]);
        setEventIds([...ids]);
      }
      const deck = deckFromGeneration({ title: outline.title, format: req.format, themeId, cards }, new Date().toISOString());
      browserDeckStore().save(deck);
      browserAiStore().assignDeck(ids, deck.id);
      router.push(`/decks/${deck.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setBusy(false);
    }
  }

  function editCard(i: number, patch: Partial<Outline["cards"][number]>) {
    setOutline((o) => o && { ...o, cards: o.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  }

  function moveCard(i: number, dir: -1 | 1) {
    setOutline((o) => {
      if (!o || i + dir < 0 || i + dir >= o.cards.length) return o;
      const cards = [...o.cards];
      [cards[i], cards[i + dir]] = [cards[i + dir], cards[i]];
      return { ...o, cards };
    });
  }

  async function readFile(file: File) {
    if (file.size > MAX_INPUT_CHARS * 4) {
      setError("That file is too large. Paste an excerpt instead.");
      return;
    }
    const text = (await file.text()).slice(0, MAX_INPUT_CHARS);
    setReq((r) => ({ ...r, mode: "text", input: text }));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12 font-sans sm:px-8">
      <header className="flex flex-col gap-2">
        <Link href="/decks" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Decks
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Create with AI</h1>
        <p className="text-sm text-neutral-500">
          Using <span className="font-mono">{modelLabel}</span>.{" "}
          <Link href="/settings" className="underline">
            Change
          </Link>
        </p>
        <ImpactMeter eventIds={eventIds} className="w-fit" />
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          {error.toLowerCase().includes("key") && (
            <>
              {" "}
              <Link href="/settings" className="underline">
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {step === "input" && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void makeOutline();
          }}
        >
          <div role="tablist" aria-label="Input type" className="flex gap-2">
            {(
              [
                ["prompt", "Prompt"],
                ["text", "Paste text"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={req.mode === mode}
                onClick={() => setReq({ ...req, mode })}
                className={`rounded-full px-3 py-1 text-sm ${req.mode === mode ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
              >
                {label}
              </button>
            ))}
            <label className="cursor-pointer rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200">
              Import .md / .txt
              <input
                type="file"
                accept=".md,.markdown,.txt,text/plain,text/markdown"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {req.mode === "prompt" ? "What is it about?" : "Source text"}
            <textarea
              required
              rows={req.mode === "prompt" ? 3 : 10}
              maxLength={MAX_INPUT_CHARS}
              value={req.input}
              onChange={(e) => setReq({ ...req, input: e.target.value })}
              placeholder={
                req.mode === "prompt"
                  ? "A 10-minute pitch for a neighborhood solar co-op"
                  : "Paste notes, a draft, or an article. Facts come only from this text."
              }
              className={field}
            />
            {req.mode === "text" && (
              <span className="text-xs font-normal text-neutral-500">
                {req.input.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()} characters
              </span>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Format
              <select className={field} value={req.format} onChange={(e) => setReq({ ...req, format: e.target.value as OutlineRequest["format"] })}>
                {DECK_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Cards
              <input
                className={field}
                type="number"
                min={1}
                max={MAX_CARDS}
                value={req.cardCount}
                onChange={(e) => setReq({ ...req, cardCount: Math.max(1, Math.min(MAX_CARDS, Number(e.target.value) || 1)) })}
              />
            </label>
            {req.mode === "text" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Text handling
                <select
                  className={field}
                  value={req.textHandling}
                  onChange={(e) => setReq({ ...req, textHandling: e.target.value as OutlineRequest["textHandling"] })}
                >
                  <option value="condense">Condense</option>
                  <option value="preserve">Preserve wording</option>
                  <option value="expand">Expand</option>
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Language
                <input className={field} value={req.language} maxLength={60} onChange={(e) => setReq({ ...req, language: e.target.value })} />
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              <span>
                Tone <span className="font-normal text-neutral-500">(optional)</span>
              </span>
              <input className={field} value={req.tone} maxLength={200} placeholder="Confident, plain" onChange={(e) => setReq({ ...req, tone: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              <span>
                Audience <span className="font-normal text-neutral-500">(optional)</span>
              </span>
              <input className={field} value={req.audience} maxLength={200} placeholder="City council" onChange={(e) => setReq({ ...req, audience: e.target.value })} />
            </label>
          </div>

          <button type="submit" disabled={busy || !req.input.trim()} className={`${primary} w-fit`}>
            {busy ? "Planning…" : "Generate outline"}
          </button>
        </form>
      )}

      {step === "outline" && outline && (
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <input className={`${field} text-base`} value={outline.title} maxLength={200} onChange={(e) => setOutline({ ...outline, title: e.target.value })} />
          </label>

          <ol className="flex flex-col gap-3">
            {outline.cards.map((card, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-neutral-200 p-3">
                <span className="w-6 pt-2 text-right font-mono text-xs text-neutral-400">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    aria-label={`Card ${i + 1} title`}
                    className={`${field} font-medium`}
                    value={card.title}
                    maxLength={200}
                    onChange={(e) => editCard(i, { title: e.target.value })}
                  />
                  <textarea
                    aria-label={`Card ${i + 1} points, one per line`}
                    className={field}
                    rows={Math.max(2, card.points.length)}
                    value={card.points.join("\n")}
                    onChange={(e) => editCard(i, { points: e.target.value.split("\n") })}
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <button type="button" aria-label={`Move card ${i + 1} up`} className="rounded px-2 py-1 hover:bg-neutral-100" onClick={() => moveCard(i, -1)}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Move card ${i + 1} down`} className="rounded px-2 py-1 hover:bg-neutral-100" onClick={() => moveCard(i, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove card ${i + 1}`}
                    disabled={outline.cards.length === 1}
                    className="rounded px-2 py-1 hover:bg-neutral-100 hover:text-red-700 disabled:opacity-30"
                    onClick={() => setOutline({ ...outline, cards: outline.cards.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={outline.cards.length >= MAX_CARDS}
            onClick={() => setOutline({ ...outline, cards: [...outline.cards, { title: "New card", points: [] }] })}
            className="w-fit rounded-full border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:border-neutral-500"
          >
            + Add card
          </button>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Theme</legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    themeId === t.id ? "border-neutral-900" : "border-neutral-200"
                  }`}
                >
                  <input type="radio" name="theme" className="sr-only" checked={themeId === t.id} onChange={() => setThemeId(t.id)} />
                  <span
                    aria-hidden
                    className="h-5 w-5 rounded-full border border-neutral-300"
                    style={{ background: `linear-gradient(135deg, ${t.colors.surface} 50%, ${t.colors.accent} 50%)` }}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-3">
            <button type="button" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm" onClick={() => setStep("input")}>
              Back
            </button>
            <button
              type="button"
              className={primary}
              disabled={busy || !outline.title.trim() || outline.cards.some((c) => !c.title.trim())}
              onClick={() => {
                const cleaned = {
                  ...outline,
                  cards: outline.cards.map((c) => ({ title: c.title.trim(), points: c.points.map((p) => p.trim()).filter(Boolean) })),
                };
                setOutline(cleaned);
                setWritten([]);
                void writeDeck(cleaned);
              }}
            >
              Generate {outline.cards.length} cards
            </button>
          </div>
        </div>
      )}

      {step === "writing" && outline && (
        <section aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-neutral-700">
            {busy
              ? `Writing cards… ${written.length} of ${outline.cards.length} done`
              : `Stopped after ${written.length} of ${outline.cards.length} cards.`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width]"
              style={{ width: `${(written.length / outline.cards.length) * 100}%` }}
            />
          </div>
          {!busy && (
            <div className="flex gap-3">
              <button type="button" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm" onClick={() => setStep("outline")}>
                Back to outline
              </button>
              <button type="button" className={primary} onClick={() => void writeDeck(outline, written)}>
                Retry remaining
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
