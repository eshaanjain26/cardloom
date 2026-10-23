import { browserKeyValue } from "../deck/browser-store";
import type { Deck } from "../deck/schema";
import { assetIdsInDeck, browserAssetStore } from "../media/assets";
import type { ShareKind, Stats } from "./store";

export type PublishedShare = { id: string; ownerToken: string; slug: string | null; expiresAt: string | null; hasPassword: boolean; publishedAt: string };
type Registry = Record<string, Partial<Record<ShareKind, PublishedShare>>>;

const KEY = "cardloom:shares";

// Owner tokens are the only proof of ownership until accounts exist, so they
// live in this browser next to the deck they belong to.
function read(): Registry {
  try {
    return JSON.parse(browserKeyValue().getItem(KEY) ?? "{}") as Registry;
  } catch {
    return {};
  }
}

function write(r: Registry) {
  browserKeyValue().setItem(KEY, JSON.stringify(r));
}

export function sharesFor(deckId: string): Partial<Record<ShareKind, PublishedShare>> {
  return read()[deckId] ?? {};
}

function remember(deckId: string, kind: ShareKind, share: PublishedShare | null) {
  const r = read();
  const entry = { ...(r[deckId] ?? {}) };
  if (share) entry[kind] = share;
  else delete entry[kind];
  r[deckId] = entry;
  write(r);
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

async function uploadAssets(deck: Deck, share: PublishedShare): Promise<number> {
  let missing = 0;
  for (const id of new Set(assetIdsInDeck(deck))) {
    const blob = await browserAssetStore().get(id);
    if (!blob) {
      missing++;
      continue;
    }
    const res = await fetch(`/api/shares/${share.id}/assets/${id}`, {
      method: "PUT",
      headers: { "x-owner-token": share.ownerToken, "content-type": blob.type || "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) await json(res);
  }
  return missing;
}

export type PublishOptions = { slug?: string | null; password?: string | null; expiresAt?: string | null };

export async function publish(deck: Deck, kind: ShareKind, opts: PublishOptions): Promise<{ share: PublishedShare; missingImages: number }> {
  const existing = sharesFor(deck.id)[kind];
  let share: PublishedShare;
  if (existing) {
    const body: Record<string, unknown> = { deck, expiresAt: opts.expiresAt ?? null };
    if (kind === "site") body.slug = opts.slug;
    if (opts.password !== undefined) body.password = opts.password;
    const res = await json<{ slug: string | null; expiresAt: string | null; hasPassword: boolean }>(
      await fetch(`/api/shares/${existing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-owner-token": existing.ownerToken },
        body: JSON.stringify(body),
      }),
    );
    share = { ...existing, ...res, publishedAt: new Date().toISOString() };
  } else {
    const res = await json<{ id: string; ownerToken: string; slug: string | null; expiresAt: string | null; hasPassword: boolean }>(
      await fetch("/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, deck, slug: opts.slug ?? null, password: opts.password || null, expiresAt: opts.expiresAt ?? null }),
      }),
    );
    share = { ...res, publishedAt: new Date().toISOString() };
  }
  remember(deck.id, kind, share);
  return { share, missingImages: await uploadAssets(deck, share) };
}

export async function unpublish(deckId: string, kind: ShareKind) {
  const share = sharesFor(deckId)[kind];
  if (!share) return;
  const res = await fetch(`/api/shares/${share.id}`, { method: "DELETE", headers: { "x-owner-token": share.ownerToken } });
  if (!res.ok && res.status !== 404) await json(res);
  remember(deckId, kind, null);
}

export async function fetchStats(share: PublishedShare): Promise<Stats> {
  return json<Stats>(await fetch(`/api/shares/${share.id}/stats`, { headers: { "x-owner-token": share.ownerToken }, cache: "no-store" }));
}

export const shareUrl = (share: PublishedShare, kind: ShareKind) =>
  `${window.location.origin}${kind === "site" ? `/p/${share.slug}` : `/s/${share.id}`}`;

export function suggestSlug(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s.length >= 3 ? s : `deck-${s || "site"}`;
}
