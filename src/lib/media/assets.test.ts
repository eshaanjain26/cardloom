import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createDeck, emptyCard, insertCardAfter, addChildCard } from "../deck/ops";
import { assetIdsInDeck, createAssetStore } from "./assets";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const fig = (src: string) => ({ type: "figure", attrs: { src, alt: "" } });

describe("asset store", () => {
  it("stores, reads back, lists, and removes blobs", async () => {
    const store = createAssetStore(new IDBFactory());
    const id = await store.put(new Blob(["hello"], { type: "text/plain" }));
    expect(await (await store.get(id))!.text()).toBe("hello");
    expect(await store.ids()).toEqual([id]);
    await store.remove(id);
    expect(await store.get(id)).toBeNull();
  });

  it("collects only unreferenced assets", async () => {
    const store = createAssetStore(new IDBFactory());
    const keep = await store.put(new Blob(["a"]));
    const drop = await store.put(new Blob(["b"]));
    expect(await store.collect(new Set([keep]))).toBe(1);
    expect(await store.ids()).toEqual([keep]);
    expect(await store.get(drop)).toBeNull();
  });
});

describe("assetIdsInDeck", () => {
  it("finds asset images in nested cards and ignores remote ones", () => {
    const t = "2026-10-22T00:00:00.000Z";
    let d = createDeck("D", t, "d");
    d = insertCardAfter(d, d.cards[0].id, { ...emptyCard("blank", "c2"), content: { type: "doc", content: [fig(`asset:${A}`), fig("https://x.example/a.jpg")] } }, t);
    d = addChildCard(d, "c2", { ...emptyCard("blank", "c3"), content: { type: "doc", content: [fig(`asset:${B}`)] } }, t);
    expect(assetIdsInDeck(d)).toEqual([A, B]);
  });
});
