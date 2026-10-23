import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDeck, emptyCard, insertCardAfter } from "../deck/ops";
import { createShareStore, hashPassword, sniffImage, verifyPassword, type ShareStore } from "./store";

const t = "2026-10-23T00:00:00.000Z";
function deck() {
  const d = createDeck("Pilot", t, "d1");
  return insertCardAfter(d, d.cards[0].id, emptyCard("blank", "c2"), t);
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ASSET = "0f8fad5b-d9cb-469f-a165-70867728950e";

let root: string;
let store: ShareStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "cardloom-share-"));
  store = createShareStore(root, "test-secret");
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("passwords and images", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("open sesame");
    expect(h).toMatch(/^scrypt\$/);
    expect(await verifyPassword("open sesame", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("recognizes image formats by their bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("share store", () => {
  it("creates, reads, and updates a link with an owner token", async () => {
    const { share, ownerToken } = await store.create({ kind: "link", deck: deck() });
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect((await store.get(share.id)).deck.title).toBe("Pilot");
    await expect(store.update(share.id, "wrong-token", { deck: { ...deck(), title: "X" } })).rejects.toMatchObject({ status: 403 });
    const updated = await store.update(share.id, ownerToken, { deck: { ...deck(), title: "Pilot v2" } });
    expect(updated.deck.title).toBe("Pilot v2");
  });

  it("rejects invalid decks and bad ids", async () => {
    await expect(store.create({ kind: "link", deck: { id: "x" } })).rejects.toMatchObject({ status: 400 });
    await expect(store.get("../../etc")).rejects.toMatchObject({ status: 404 });
  });

  it("protects with a password and signs viewers out when it changes", async () => {
    const { share, ownerToken } = await store.create({ kind: "link", deck: deck(), password: "pw1" });
    expect(share.hasPassword).toBe(true);
    expect(await store.canView(share.id, undefined)).toBe(false);
    expect(await store.checkPassword(share.id, "nope")).toBe(false);
    expect(await store.checkPassword(share.id, "pw1")).toBe(true);
    const cookie = (await store.accessToken(share.id))!;
    expect(await store.canView(share.id, cookie)).toBe(true);
    await store.update(share.id, ownerToken, { password: "pw2" });
    expect(await store.canView(share.id, cookie)).toBe(false);
    await store.update(share.id, ownerToken, { password: null });
    expect(await store.canView(share.id, undefined)).toBe(true);
  });

  it("tracks expiry", async () => {
    const { share } = await store.create({ kind: "link", deck: deck(), expiresAt: "2026-10-24T00:00:00Z" });
    expect(store.isExpired(share, Date.parse("2026-10-23T12:00:00Z"))).toBe(false);
    expect(store.isExpired(share, Date.parse("2026-10-24T00:00:01Z"))).toBe(true);
    await expect(store.create({ kind: "link", deck: deck(), expiresAt: "soon" })).rejects.toMatchObject({ status: 400 });
  });

  it("gives sites a unique public address and no password", async () => {
    const a = await store.create({ kind: "site", deck: deck(), slug: "elm-pilot" });
    expect((await store.getBySlug("elm-pilot")).id).toBe(a.share.id);
    await expect(store.create({ kind: "site", deck: deck(), slug: "elm-pilot" })).rejects.toMatchObject({ status: 409 });
    await expect(store.create({ kind: "site", deck: deck(), slug: "Bad Slug" })).rejects.toMatchObject({ status: 400 });
    await expect(store.create({ kind: "site", deck: deck(), slug: "ok-slug", password: "x" })).rejects.toMatchObject({ status: 400 });
    await store.update(a.share.id, a.ownerToken, { slug: "elm-pilot-2026" });
    await expect(store.getBySlug("elm-pilot")).rejects.toMatchObject({ status: 404 });
    expect((await store.getBySlug("elm-pilot-2026")).id).toBe(a.share.id);
    await store.remove(a.share.id, a.ownerToken);
    await expect(store.getBySlug("elm-pilot-2026")).rejects.toMatchObject({ status: 404 });
  });

  it("stores only real images within limits", async () => {
    const { share, ownerToken } = await store.create({ kind: "link", deck: deck() });
    await store.putAsset(share.id, ownerToken, ASSET, PNG);
    expect(await store.getAsset(share.id, ASSET)).toMatchObject({ mime: "image/png" });
    await expect(store.putAsset(share.id, ownerToken, ASSET, new TextEncoder().encode("<html>"))).rejects.toMatchObject({ status: 415 });
    await expect(store.putAsset(share.id, ownerToken, "../x", PNG)).rejects.toMatchObject({ status: 400 });
    await expect(store.putAsset(share.id, "nope", ASSET, PNG)).rejects.toMatchObject({ status: 403 });
    await expect(store.getAsset(share.id, "1b4e28ba-2fa1-11d2-883f-0016d3cca427")).rejects.toMatchObject({ status: 404 });
  });

  it("counts views, unique visitors, and dwell per known card", async () => {
    const { share, ownerToken } = await store.create({ kind: "link", deck: deck() });
    await Promise.all([
      store.recordEvent(share.id, { type: "view", visitor: "a" }),
      store.recordEvent(share.id, { type: "view", visitor: "a" }),
      store.recordEvent(share.id, { type: "view", visitor: "b" }),
      store.recordEvent(share.id, { type: "dwell", visitor: "a", cardId: "c2", ms: 4000 }),
      store.recordEvent(share.id, { type: "dwell", visitor: "b", cardId: "c2", ms: 6000 }),
      store.recordEvent(share.id, { type: "dwell", visitor: "b", cardId: "not-a-card", ms: 6000 }),
    ]);
    const s = await store.stats(share.id, ownerToken);
    expect(s.views).toBe(3);
    expect(s.visitors).toBe(2);
    expect(s.cards).toEqual({ c2: { views: 2, dwellMs: 10000 } });
    await expect(store.stats(share.id, "nope")).rejects.toMatchObject({ status: 403 });
  });
});
