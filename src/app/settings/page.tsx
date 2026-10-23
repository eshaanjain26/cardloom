"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ImpactMeter } from "@/components/ImpactMeter";
import { browserAiStore, callAi, USAGE_EVENT } from "@/lib/ai/client";
import { DEFAULT_IMPACT, KNOWN_PRICES } from "@/lib/ai/impact";
import { DEFAULT_MODELS, PROVIDER_LABELS, PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import type { AiSettings } from "@/lib/ai/settings";

const SUGGESTED: Partial<Record<ProviderId, string[]>> = {
  anthropic: Object.keys(KNOWN_PRICES),
};

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";

export default function SettingsPage() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[] | string | null>(null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; message?: string }>({ state: "idle" });
  const [priceDraft, setPriceDraft] = useState({ model: "", input: "", output: "" });

  useEffect(() => setS(browserAiStore().settings()), []);

  useEffect(() => {
    if (s?.provider !== "ollama") return;
    fetch("/api/ollama/models")
      .then(async (r) => {
        const body = (await r.json()) as { models?: string[]; error?: string };
        setOllamaModels(body.models ?? body.error ?? "Could not list models");
      })
      .catch(() => setOllamaModels("Could not list models"));
  }, [s?.provider]);

  if (!s) return null;
  const provider = s.provider;

  function update(next: AiSettings) {
    setS(next);
    browserAiStore().saveSettings(next);
    window.dispatchEvent(new Event(USAGE_EVENT));
    setTest({ state: "idle" });
  }

  async function runTest() {
    setTest({ state: "running" });
    try {
      const res = await callAi<{ ok: boolean }>("ping", {}, null);
      setTest({ state: "ok", message: `Connected to ${res.model}.` });
    } catch (err) {
      setTest({ state: "error", message: err instanceof Error ? err.message : "Failed" });
    }
  }

  const suggestions = provider === "ollama" && Array.isArray(ollamaModels) ? ollamaModels : (SUGGESTED[provider] ?? []);
  const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-4 py-12 font-sans sm:px-8">
      <header>
        <Link href="/decks" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Decks
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Saved in this browser only.</p>
      </header>

      <section aria-labelledby="model" className="flex flex-col gap-4">
        <h2 id="model" className="text-lg font-semibold">
          AI model
        </h2>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Provider</legend>
          {PROVIDERS.map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                provider === p ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
              }`}
            >
              <input type="radio" name="provider" checked={provider === p} onChange={() => update({ ...s, provider: p })} />
              {PROVIDER_LABELS[p]}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Model
          <input
            className={input}
            list="model-suggestions"
            value={s.models[provider] ?? ""}
            placeholder={DEFAULT_MODELS[provider]}
            onChange={(e) => update({ ...s, models: { ...s.models, [provider]: e.target.value } })}
          />
          <datalist id="model-suggestions">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {provider === "ollama" && typeof ollamaModels === "string" && (
            <span className="text-xs font-normal text-amber-700">
              {ollamaModels}. Start Ollama, or set OLLAMA_BASE_URL on the server.
            </span>
          )}
        </label>

        {provider === "ollama" ? (
          <p className="text-sm text-neutral-600">
            No key needed. Requests go from the Cardloom server to your Ollama instance and never leave that machine.
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium">
            API key
            <input
              className={input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={s.keys[provider] ?? ""}
              onChange={(e) => update({ ...s, keys: { ...s.keys, [provider]: e.target.value } })}
            />
            <span className="text-xs font-normal text-neutral-500">
              Stored in this browser and sent only to your Cardloom server, which forwards it to {PROVIDER_LABELS[provider]}. Leave
              empty to use a key from the server environment, if the operator enabled that.
            </span>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={test.state === "running"}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 disabled:opacity-50"
          >
            {test.state === "running" ? "Testing…" : "Test connection"}
          </button>
          <span
            aria-live="polite"
            className={`text-sm ${test.state === "error" ? "text-red-700" : test.state === "ok" ? "text-emerald-700" : ""}`}
          >
            {test.message}
          </span>
        </div>
      </section>

      <section aria-labelledby="impact" id="impact" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="impact" className="text-lg font-semibold">
            Usage, cost, and CO₂ estimates
          </h2>
          <ImpactMeter />
        </div>
        <p className="text-sm text-neutral-600">
          Energy and CO₂ are estimates scaled from public per-query figures. See{" "}
          <a className="underline" href="https://github.com/eshaanjain26/cardloom/blob/main/docs/impact.md">
            how they are calculated
          </a>
          .
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["whPer1kInput", "Wh per 1k input tokens"],
              ["whPer1kOutput", "Wh per 1k output tokens"],
              ["gridGramsPerKwh", "Grid g CO₂e per kWh"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1 text-sm font-medium">
              {label}
              <input
                className={input}
                type="number"
                min={0}
                step="any"
                value={s.impact[key]}
                onChange={(e) => update({ ...s, impact: { ...s.impact, [key]: num(e.target.value, DEFAULT_IMPACT[key]) } })}
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Your prices (USD per million tokens)</h3>
          {Object.entries(s.impact.prices).map(([model, p]) => (
            <div key={model} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate font-mono">{model}</span>
              <span>
                ${p.input} in · ${p.output} out
              </span>
              <button
                type="button"
                className="text-neutral-500 hover:text-red-700"
                onClick={() => {
                  const prices = { ...s.impact.prices };
                  delete prices[model];
                  update({ ...s, impact: { ...s.impact, prices } });
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const model = priceDraft.model.trim();
              const pIn = parseFloat(priceDraft.input);
              const pOut = parseFloat(priceDraft.output);
              if (!model || !(pIn >= 0) || !(pOut >= 0)) return;
              update({ ...s, impact: { ...s.impact, prices: { ...s.impact.prices, [model]: { input: pIn, output: pOut } } } });
              setPriceDraft({ model: "", input: "", output: "" });
            }}
          >
            <input
              aria-label="Model name"
              placeholder="model name"
              className={`${input} flex-1`}
              value={priceDraft.model}
              onChange={(e) => setPriceDraft({ ...priceDraft, model: e.target.value })}
            />
            <input
              aria-label="Input price"
              placeholder="input $"
              type="number"
              min={0}
              step="any"
              className={`${input} w-24`}
              value={priceDraft.input}
              onChange={(e) => setPriceDraft({ ...priceDraft, input: e.target.value })}
            />
            <input
              aria-label="Output price"
              placeholder="output $"
              type="number"
              min={0}
              step="any"
              className={`${input} w-24`}
              value={priceDraft.output}
              onChange={(e) => setPriceDraft({ ...priceDraft, output: e.target.value })}
            />
            <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-900">
              Add
            </button>
          </form>
          <p className="text-xs text-neutral-500">Claude prices are built in. Local Ollama runs cost $0.</p>
        </div>
      </section>
    </main>
  );
}
