"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { callAi } from "@/lib/ai/client";
import { applyAgentOps, type ChatTurn } from "@/lib/ai/pipelines";
import type { AgentResult } from "@/lib/ai/schemas";
import type { Deck } from "@/lib/deck/schema";
import { imageSourceFor } from "@/lib/media/client";
import { pendingImages, resolvePendingImages } from "@/lib/media/resolve";

type Message = ChatTurn & { note?: string; undo?: Deck; error?: boolean; status?: boolean };

type Props = {
  deck: Deck;
  focusCardId: string | null;
  focusLabel: string | null;
  onClearFocus: () => void;
  onApply: (deck: Deck) => void;
  onClose: () => void;
};

const SUGGESTIONS = ["Make every card shorter", "Add a card with next steps at the end", "Write speaker notes for each card"];

export function AgentPanel({ deck, focusCardId, focusLabel, onClearFocus, onApply, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history: ChatTurn[] = messages.filter((m) => !m.error && !m.status).map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await callAi<AgentResult>(
        "agent",
        { deck, message, history, ...(focusCardId ? { focusCardId } : {}) },
        deck.id,
      );
      const before = deck;
      const { deck: next, applied, skipped } = applyAgentOps(deck, res.data.operations, new Date().toISOString());
      if (applied > 0) onApply(next);
      const note =
        applied > 0
          ? `Applied ${applied} change${applied === 1 ? "" : "s"}${skipped.length ? `, skipped ${skipped.length}` : ""}.`
          : skipped.length
            ? `No changes applied; ${skipped.length} could not be used.`
            : undefined;
      setMessages((m) => [
        ...m.map((x) => ({ ...x, undo: undefined })),
        { role: "assistant", text: res.data.reply, note, undo: applied > 0 ? before : undefined },
      ]);
      const missing = pendingImages(next).length;
      if (applied > 0 && missing > 0) {
        setMessages((m) => [...m, { role: "assistant", text: `Finding ${missing} image${missing === 1 ? "" : "s"}…`, status: true }]);
        const found = await resolvePendingImages(next, imageSourceFor("stock", next.id));
        onApply(found.deck);
        setMessages((m) =>
          m
            .filter((x) => !x.status)
            .concat(found.failed ? [{ role: "assistant" as const, text: `${found.failed} image${found.failed === 1 ? "" : "s"} not found. Use Choose image on the card to pick one.` }] : []),
        );
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err instanceof Error ? err.message : "Request failed", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function undo(i: number) {
    const snapshot = messages[i].undo;
    if (!snapshot) return;
    onApply({ ...snapshot, updatedAt: new Date().toISOString() });
    setMessages((m) => m.map((x, j) => (j === i ? { ...x, undo: undefined, note: "Undone." } : x)));
  }

  return (
    <aside
      aria-label="AI assistant"
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-neutral-200 bg-white font-sans shadow-xl sm:w-96"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="font-semibold">Ask AI</h2>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100" aria-label="Close assistant">
          ✕
        </button>
      </header>

      <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
        {messages.length === 0 && (
          <li className="flex flex-col gap-2 text-neutral-500">
            <p>Ask for edits to this deck. Changes apply right away and can be undone.</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="w-fit rounded-full border border-neutral-200 px-3 py-1 text-left text-neutral-700 hover:border-neutral-400"
              >
                {s}
              </button>
            ))}
          </li>
        )}
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "self-end" : "self-start"}>
            <div
              className={`max-w-[18rem] rounded-2xl px-3 py-2 ${
                m.role === "user" ? "bg-neutral-900 text-white" : m.error ? "bg-red-50 text-red-800" : "bg-neutral-100 text-neutral-900"
              }`}
            >
              {m.text}
              {m.error && m.text.toLowerCase().includes("key") && (
                <>
                  {" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>
                </>
              )}
            </div>
            {(m.note || m.undo) && (
              <div className="mt-1 flex items-center gap-2 px-1 text-xs text-neutral-500">
                {m.note}
                {m.undo && (
                  <button type="button" onClick={() => undo(i)} className="underline hover:text-neutral-900">
                    Undo
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {busy && <li className="self-start text-neutral-500">Thinking…</li>}
      </ol>

      <form
        className="flex flex-col gap-2 border-t border-neutral-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {focusLabel && (
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="truncate">Focused on: {focusLabel}</span>
            <button type="button" onClick={onClearFocus} className="underline">
              Whole deck
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            aria-label="Message"
            rows={2}
            maxLength={4000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Make card 3 a comparison…"
            className="min-w-0 flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
