import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Deck } from "../deck/schema";
import { assetId } from "../media/embeds";
import { createShareStore, ShareError, type Share, type ShareStore } from "./store";

let store: Promise<ShareStore> | null = null;

// Shares live on the server's disk under CARDLOOM_DATA_DIR. The signing secret
// comes from CARDLOOM_SECRET, or is generated once and kept next to the data.
export function shareStore(): Promise<ShareStore> {
  store ??= (async () => {
    const root = process.env.CARDLOOM_DATA_DIR ?? path.join(process.cwd(), "data");
    await fs.mkdir(root, { recursive: true });
    let secret = process.env.CARDLOOM_SECRET;
    if (!secret) {
      const file = path.join(root, "secret");
      secret = await fs.readFile(file, "utf8").catch(async () => {
        const fresh = randomBytes(32).toString("base64url");
        await fs.writeFile(file, fresh, { mode: 0o600, flag: "wx" }).catch(() => {});
        return fs.readFile(file, "utf8");
      });
    }
    return createShareStore(root, secret.trim());
  })();
  return store;
}

export const accessCookie = (id: string) => `cl_share_${id}`;

export function shareAssetPath(shareId: string, id: string) {
  return `/api/shares/${shareId}/assets/${id}`;
}

type PMNode = { type?: string; attrs?: Record<string, unknown>; content?: PMNode[] };

// Points browser-stored images at the copies uploaded with the share. Images
// that were never uploaded become placeholders rather than broken links.
export function deckForViewer(share: Share): Deck {
  const rewrite = (node: PMNode): PMNode => {
    if (node.type === "figure") {
      const id = assetId(typeof node.attrs?.src === "string" ? node.attrs.src : null);
      if (id) return { ...node, attrs: { ...node.attrs, src: share.assets[id] ? shareAssetPath(share.id, id) : null } };
    }
    return node.content ? { ...node, content: node.content.map(rewrite) } : node;
  };
  // Speaker notes are the presenter's; they never reach viewers.
  const cards = (list: Deck["cards"]): Deck["cards"] =>
    list.map((c) => ({ ...c, notes: "", content: rewrite(c.content as PMNode) as Deck["cards"][number]["content"], children: cards(c.children) }));
  return { ...share.deck, cards: cards(share.deck.cards) };
}

export function errorResponse(err: unknown) {
  if (err instanceof ShareError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[shares]", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ShareError(413, "Request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new ShareError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ShareError(400, "Body must be JSON.");
  }
}

export function ownerToken(request: Request): string {
  const token = request.headers.get("x-owner-token");
  if (!token) throw new ShareError(401, "Missing owner token.");
  return token;
}

// In-memory limit on password attempts per share and client address.
const attempts = new Map<string, number[]>();
export function allowAttempt(key: string, max = 10, windowMs = 10 * 60_000, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}
