import { Window } from "happy-dom";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createDeck, emptyCard, insertCardAfter, presentSequence } from "../deck/ops";
import { parseDeck, type Card, type Deck } from "../deck/schema";
import { deckToPptx } from "./pptx-export";
import { parseRels, parseSlide, pptxToDeck, resolvePart, slideRelIds } from "./pptx-import";
import { cardToSlideSpec, fontFor } from "./slides";

const t = "2026-10-23T00:00:00.000Z";
const PNG_DATA =
  "image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const win = new Window();
const parse = (xml: string) => new win.DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

const text = (s: string, marks?: object[]) => ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const li = (...c: object[]) => ({ type: "listItem", content: [{ type: "paragraph", content: c }] });
const card = (id: string, layout: Card["layout"], content: object[], notes = ""): Card => ({
  ...emptyCard(layout, id),
  content: { type: "doc", content: content as Card["content"]["content"] },
  notes,
});

function sample(): Deck {
  let d = createDeck("Library pilot", t, "d1");
  d = { ...d, cards: [card("a", "title", [{ type: "heading", attrs: { level: 1 }, content: [text("Library pilot")] }, { type: "paragraph", content: [text("Spring review")] }])] };
  d = insertCardAfter(
    d,
    "a",
    card(
      "b",
      "bullets",
      [
        { type: "heading", attrs: { level: 2 }, content: [text("Results")] },
        { type: "bulletList", content: [li(text("41", [{ type: "bold" }]), text(" visits")), li(text("Details "), text("here", [{ type: "link", attrs: { href: "https://ex.example/r" } }]))] },
        { type: "orderedList", content: [li(text("File request")), li(text("Board approves"))] },
      ],
      "Pause after the first number.",
    ),
    t,
  );
  d = insertCardAfter(d, "b", card("c", "image-right", [{ type: "heading", attrs: { level: 2 }, content: [text("Branch")] }, { type: "paragraph", content: [text("Elm Street")] }, { type: "figure", attrs: { src: "https://img.example/a.png", alt: "Branch photo", credit: "by A", creditUrl: null, query: null } }]), t);
  return insertCardAfter(d, "c", card("e", "blank", [{ type: "heading", attrs: { level: 2 }, content: [text("Visits")] }, { type: "chart", attrs: { data: { type: "bar", title: "Per night", labels: ["Mar", "Apr"], series: [{ name: "Elm", values: [32, 41] }] } } }]), t);
}

describe("slide specs", () => {
  it("maps a card to title, body, and media", () => {
    const spec = cardToSlideSpec(sample().cards[1]);
    expect(spec.title).toEqual([{ text: "Results" }]);
    expect(spec.body.map((p) => p.bullet)).toEqual(["bullet", "bullet", "number", "number"]);
    expect(spec.body[1].runs[1]).toEqual({ text: "here", link: "https://ex.example/r" });
    expect(spec.notes).toBe("Pause after the first number.");
  });

  it("picks Office fonts for theme stacks", () => {
    expect(fontFor('ui-serif, Georgia, "Times New Roman", serif')).toBe("Georgia");
    expect(fontFor('ui-sans-serif, system-ui, sans-serif')).toBe("Arial");
    expect(fontFor('ui-monospace, "SF Mono", Menlo, monospace')).toBe("Consolas");
  });
});

describe("pptx helpers", () => {
  it("reads slide order from presentation.xml", () => {
    expect(slideRelIds('<p:sldIdLst><p:sldId id="256" r:id="rId7"/><p:sldId id="257" r:id="rId3"></p:sldId></p:sldIdLst>')).toEqual(["rId7", "rId3"]);
  });

  it("resolves relative part paths", () => {
    expect(resolvePart("ppt/slides/slide1.xml", "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(resolvePart("ppt/presentation.xml", "slides/slide2.xml")).toBe("ppt/slides/slide2.xml");
    expect(resolvePart("ppt/x.xml", "/ppt/y.xml")).toBe("ppt/y.xml");
  });

  it("reads a placeholder-free slide, taking the largest short text as the title", () => {
    const xml = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:rPr sz="1800"/><a:t>Body line</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:rPr sz="4000" b="1"/><a:t>Big title</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Point</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree></p:cSld></p:sld>`;
    const res = parseSlide(xml, parse, parseRels("<Relationships/>", parse));
    expect(res.title).toEqual([{ type: "text", text: "Big title", marks: [{ type: "bold" }] }]);
    expect(res.body.map((n) => n.type)).toEqual(["paragraph", "bulletList"]);
  });
});

describe("pptx round trip", () => {
  it("exports a deck and imports it back", async () => {
    const original = sample();
    const { pptx, skippedImages } = await deckToPptx(original, async () => PNG_DATA);
    expect(skippedImages).toBe(0);
    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain('type="title"');

    const stored: string[] = [];
    const { deck, skippedImages: missed } = await pptxToDeck(buffer, {
      parse,
      now: t,
      fallbackTitle: "deck.pptx",
      storeImage: async (bytes) => {
        stored.push(String(bytes.length));
        return "https://img.example/imported.png";
      },
    });
    expect(missed).toBe(0);
    expect(stored).toHaveLength(1);
    expect(deck.title).toBe("Library pilot");
    expect(() => parseDeck(deck)).not.toThrow();

    const cards = presentSequence(deck).map((s) => s.card);
    expect(cards).toHaveLength(4);
    expect(cards[0].content.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 }, content: [{ text: "Library pilot" }] });
    const results = cards[1].content.content as { type: string; content?: { content?: { content?: unknown[] }[] }[] }[];
    expect(results.map((n) => n.type)).toEqual(["heading", "bulletList", "orderedList"]);
    expect(results[1].content?.[0].content?.[0].content?.[0]).toEqual({ type: "text", text: "41", marks: [{ type: "bold" }] });
    expect(JSON.stringify(results[1])).toContain('"href":"https://ex.example/r"');
    expect(cards[1].notes).toBe("Pause after the first number.");
    expect(cards[2].layout).toBe("image-right");
    expect(cards[2].content.content?.some((n) => (n as { type: string }).type === "figure")).toBe(true);
  });

  it("rejects files that are not presentations", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    const buf = await zip.generateAsync({ type: "uint8array" });
    await expect(pptxToDeck(buf, { parse, now: t, fallbackTitle: "x", storeImage: async () => null })).rejects.toThrow("not a PowerPoint");
  });
});
