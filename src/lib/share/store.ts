import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod/v4";
import { presentSequence } from "../deck/ops";
import { DeckSchema, type Deck } from "../deck/schema";
import { sniffImage } from "./sniff";

export { sniffImage };

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SHARE_KINDS = ["link", "site"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export const MAX_DECK_BYTES = 2_000_000;
export const MAX_ASSET_BYTES = 5_000_000;
export const MAX_SHARE_ASSET_BYTES = 30_000_000;
const MAX_VISITORS = 10_000;

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const ID = /^[A-Za-z0-9_-]{12}$/;
const ASSET_ID = /^[0-9a-f-]{36}$/;

const ShareSchema = z.object({
  id: z.string(),
  kind: z.enum(SHARE_KINDS),
  slug: z.string().nullable(),
  ownerHash: z.string(),
  passwordHash: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deck: z.unknown(),
  assets: z.record(z.string(), z.object({ mime: z.string(), bytes: z.number() })),
});
type ShareFile = z.infer<typeof ShareSchema>;

export type Share = Omit<ShareFile, "deck" | "ownerHash" | "passwordHash"> & { deck: Deck; hasPassword: boolean };

export type Stats = {
  views: number;
  visitors: number;
  lastViewedAt: string | null;
  cards: Record<string, { views: number; dwellMs: number }>;
};
type StatsFile = { views: number; visitorHashes: string[]; lastViewedAt: string | null; cards: Stats["cards"] };

export class ShareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (bytes: number) => randomBytes(bytes).toString("base64url");

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), 32);
  return safeEqual(actual.toString("base64url"), key);
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  const tmp = `${file}.${token(6)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export type CreateShareInput = { kind: ShareKind; deck: unknown; slug?: string | null; password?: string | null; expiresAt?: string | null };
export type UpdateShareInput = { deck?: unknown; slug?: string | null; password?: string | null; expiresAt?: string | null };

export function createShareStore(root: string, secret: string) {
  const sharesDir = path.join(root, "shares");
  const slugsDir = path.join(root, "slugs");
  const dir = (id: string) => {
    if (!ID.test(id)) throw new ShareError(404, "Not found");
    return path.join(sharesDir, id);
  };
  const statsQueue = new Map<string, Promise<unknown>>();

  function parseDeck(deck: unknown): Deck {
    if (JSON.stringify(deck ?? null).length > MAX_DECK_BYTES) throw new ShareError(413, "This deck is too large to publish.");
    const parsed = DeckSchema.safeParse(deck);
    if (!parsed.success) throw new ShareError(400, "Invalid deck.");
    return parsed.data;
  }

  function checkExpiry(expiresAt: string | null | undefined) {
    if (expiresAt == null) return null;
    const t = Date.parse(expiresAt);
    if (Number.isNaN(t)) throw new ShareError(400, "Invalid expiry date.");
    return new Date(t).toISOString();
  }

  async function load(id: string): Promise<ShareFile> {
    const raw = await readJson<unknown>(path.join(dir(id), "share.json"));
    const parsed = ShareSchema.safeParse(raw);
    if (!parsed.success) throw new ShareError(404, "Not found");
    return parsed.data;
  }

  function view(f: ShareFile): Share {
    return {
      id: f.id,
      kind: f.kind,
      slug: f.slug,
      expiresAt: f.expiresAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      assets: f.assets,
      deck: DeckSchema.parse(f.deck),
      hasPassword: f.passwordHash !== null,
    };
  }

  async function claimSlug(slug: string, id: string) {
    if (!SLUG.test(slug)) throw new ShareError(400, "Use 3 to 48 lowercase letters, numbers, and dashes.");
    await fs.mkdir(slugsDir, { recursive: true });
    try {
      await fs.writeFile(path.join(slugsDir, slug), id, { flag: "wx" });
    } catch {
      const owner = (await fs.readFile(path.join(slugsDir, slug), "utf8").catch(() => "")).trim();
      if (owner !== id) throw new ShareError(409, "That address is taken.");
    }
  }

  async function authorize(id: string, ownerToken: string): Promise<ShareFile> {
    const f = await load(id);
    if (!safeEqual(sha256(ownerToken), f.ownerHash)) throw new ShareError(403, "Not allowed.");
    return f;
  }

  return {
    async create(input: CreateShareInput): Promise<{ share: Share; ownerToken: string }> {
      const deck = parseDeck(input.deck);
      const id = token(9);
      const ownerToken = token(32);
      const now = new Date().toISOString();
      if (input.kind === "site" && input.password) throw new ShareError(400, "Published websites are public; use a share link for password protection.");
      const slug = input.kind === "site" ? (input.slug ?? null) : null;
      if (input.kind === "site" && !slug) throw new ShareError(400, "Choose a web address.");
      const file: ShareFile = {
        id,
        kind: input.kind,
        slug,
        ownerHash: sha256(ownerToken),
        passwordHash: input.password ? await hashPassword(input.password) : null,
        expiresAt: checkExpiry(input.expiresAt),
        createdAt: now,
        updatedAt: now,
        deck,
        assets: {},
      };
      if (slug) await claimSlug(slug, id);
      await fs.mkdir(path.join(dir(id), "assets"), { recursive: true });
      await writeAtomic(path.join(dir(id), "share.json"), JSON.stringify(file));
      return { share: view(file), ownerToken };
    },

    async get(id: string): Promise<Share> {
      return view(await load(id));
    },

    async getBySlug(slug: string): Promise<Share> {
      if (!SLUG.test(slug)) throw new ShareError(404, "Not found");
      const id = (await fs.readFile(path.join(slugsDir, slug), "utf8").catch(() => "")).trim();
      if (!id) throw new ShareError(404, "Not found");
      return view(await load(id));
    },

    async update(id: string, ownerToken: string, input: UpdateShareInput): Promise<Share> {
      const f = await authorize(id, ownerToken);
      if (input.deck !== undefined) f.deck = parseDeck(input.deck);
      if (input.expiresAt !== undefined) f.expiresAt = checkExpiry(input.expiresAt);
      if (input.password !== undefined) {
        if (f.kind === "site" && input.password) throw new ShareError(400, "Published websites are public.");
        f.passwordHash = input.password ? await hashPassword(input.password) : null;
      }
      if (input.slug !== undefined && f.kind === "site" && input.slug && input.slug !== f.slug) {
        await claimSlug(input.slug, id);
        if (f.slug) await fs.rm(path.join(slugsDir, f.slug), { force: true });
        f.slug = input.slug;
      }
      f.updatedAt = new Date().toISOString();
      await writeAtomic(path.join(dir(id), "share.json"), JSON.stringify(f));
      return view(f);
    },

    async remove(id: string, ownerToken: string): Promise<void> {
      const f = await authorize(id, ownerToken);
      if (f.slug) await fs.rm(path.join(slugsDir, f.slug), { force: true });
      await fs.rm(dir(id), { recursive: true, force: true });
    },

    async putAsset(id: string, ownerToken: string, assetId: string, bytes: Uint8Array): Promise<void> {
      if (!ASSET_ID.test(assetId)) throw new ShareError(400, "Invalid asset id.");
      if (bytes.byteLength > MAX_ASSET_BYTES) throw new ShareError(413, "Each image must be under 5 MB.");
      const mime = sniffImage(bytes);
      if (!mime) throw new ShareError(415, "Only PNG, JPEG, GIF, and WebP images can be published.");
      const f = await authorize(id, ownerToken);
      const total = Object.entries(f.assets).reduce((s, [k, a]) => s + (k === assetId ? 0 : a.bytes), 0) + bytes.byteLength;
      if (total > MAX_SHARE_ASSET_BYTES) throw new ShareError(413, "Images in one share are limited to 30 MB.");
      await writeAtomic(path.join(dir(id), "assets", assetId), bytes);
      f.assets[assetId] = { mime, bytes: bytes.byteLength };
      await writeAtomic(path.join(dir(id), "share.json"), JSON.stringify(f));
    },

    async getAsset(id: string, assetId: string): Promise<{ bytes: Buffer; mime: string }> {
      if (!ASSET_ID.test(assetId)) throw new ShareError(404, "Not found");
      const f = await load(id);
      const meta = f.assets[assetId];
      if (!meta) throw new ShareError(404, "Not found");
      return { bytes: await fs.readFile(path.join(dir(id), "assets", assetId)), mime: meta.mime };
    },

    isExpired(share: Pick<Share, "expiresAt">, now = Date.now()): boolean {
      return share.expiresAt !== null && Date.parse(share.expiresAt) <= now;
    },

    async checkPassword(id: string, password: string): Promise<boolean> {
      const f = await load(id);
      return f.passwordHash !== null && (await verifyPassword(password, f.passwordHash));
    },

    // The access cookie is bound to the current password hash, so changing the
    // password signs every earlier viewer out.
    async accessToken(id: string): Promise<string | null> {
      const f = await load(id);
      return f.passwordHash ? createHmac("sha256", secret).update(`${id}:${f.passwordHash}`).digest("base64url") : null;
    },

    async canView(id: string, cookie: string | undefined): Promise<boolean> {
      const expected = await this.accessToken(id);
      return expected === null || (cookie !== undefined && safeEqual(cookie, expected));
    },

    async recordEvent(id: string, event: { visitor: string; type: "view" } | { visitor: string; type: "dwell"; cardId: string; ms: number }) {
      const run = async () => {
        const f = await load(id);
        const file = path.join(dir(id), "stats.json");
        const s = (await readJson<StatsFile>(file)) ?? { views: 0, visitorHashes: [], lastViewedAt: null, cards: {} };
        const deck = DeckSchema.parse(f.deck);
        if (event.type === "view") {
          s.views++;
          s.lastViewedAt = new Date().toISOString();
          const h = createHmac("sha256", secret).update(`${id}:${event.visitor}`).digest("base64url").slice(0, 16);
          if (!s.visitorHashes.includes(h) && s.visitorHashes.length < MAX_VISITORS) s.visitorHashes.push(h);
        } else {
          if (!presentSequence(deck).some((step) => step.card.id === event.cardId)) return;
          const c = (s.cards[event.cardId] ??= { views: 0, dwellMs: 0 });
          c.views++;
          c.dwellMs += Math.max(0, Math.min(event.ms, 10 * 60_000));
        }
        await writeAtomic(file, JSON.stringify(s));
      };
      // Serialize writes per share so concurrent beacons do not drop counts.
      const next = (statsQueue.get(id) ?? Promise.resolve()).then(run, run);
      statsQueue.set(id, next.catch(() => {}));
      await next;
    },

    async stats(id: string, ownerToken: string): Promise<Stats> {
      await authorize(id, ownerToken);
      const s = await readJson<StatsFile>(path.join(dir(id), "stats.json"));
      return { views: s?.views ?? 0, visitors: s?.visitorHashes.length ?? 0, lastViewedAt: s?.lastViewedAt ?? null, cards: s?.cards ?? {} };
    },
  };
}

export type ShareStore = ReturnType<typeof createShareStore>;
