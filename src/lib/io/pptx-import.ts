import JSZip from "jszip";
import { inlineToNodes } from "../ai/convert";
import { emptyCard, newId } from "../deck/ops";
import type { Card, Deck } from "../deck/schema";
import { safeLinkUrl } from "../media/embeds";

type XmlDoc = Document;
type ParseXml = (xml: string) => XmlDoc;
type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: unknown[] };

export type ImageSink = (bytes: Uint8Array, name: string) => Promise<string | null>;

// Namespace prefixes vary between producers, so match on local names.
const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const kid = (el: Element | undefined, name: string) => (el ? kids(el, name)[0] : undefined);
const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagName("*")).filter((c) => c.localName === name);
const rid = (el: Element | undefined, attr: string) => {
  if (!el) return null;
  // Browsers report prefix "r" and local name "embed"; some DOM implementations
  // report the whole "r:embed" as the name.
  for (const a of Array.from(el.attributes)) if (a.name === `r:${attr}` || (a.localName === attr && a.prefix === "r")) return a.value;
  return null;
};

// Read from the raw XML: <p:sldId id="256" r:id="rId2"/> has two attributes
// named "id", and some DOM implementations keep only one of them.
export function slideRelIds(presentationXml: string): string[] {
  const ids: string[] = [];
  for (const tag of presentationXml.matchAll(/<(?:\w+:)?sldId\b([^>]*)\/?>/g)) {
    const m = tag[1].match(/\b\w+:id="([^"]+)"/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

export function parseRels(xml: string, parse: ParseXml): Map<string, { target: string; type: string; external: boolean }> {
  const map = new Map<string, { target: string; type: string; external: boolean }>();
  for (const r of all(parse(xml), "Relationship")) {
    map.set(r.getAttribute("Id") ?? "", {
      target: r.getAttribute("Target") ?? "",
      type: r.getAttribute("Type") ?? "",
      external: r.getAttribute("TargetMode") === "External",
    });
  }
  return map;
}

export function resolvePart(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

type ParsedPara = { runs: PMNode[]; bullet: "bullet" | "number" | null; size: number };
type Shape = { kind: "text"; ph: string | null; paras: ParsedPara[] } | { kind: "image"; relId: string; alt: string };

function paragraph(p: Element, inBody: boolean, rels: Map<string, { target: string; external: boolean }>): ParsedPara {
  const pPr = kid(p, "pPr");
  const bullet = kid(pPr, "buAutoNum") ? "number" : kid(pPr, "buChar") ? "bullet" : inBody && !kid(pPr, "buNone") ? "bullet" : null;
  const runs: PMNode[] = [];
  let size = 0;
  for (const r of Array.from(p.children)) {
    if (r.localName === "br") {
      runs.push({ type: "text", text: " " });
      continue;
    }
    if (r.localName !== "r" && r.localName !== "fld") continue;
    const text = kid(r, "t")?.textContent ?? "";
    if (!text) continue;
    const rPr = kid(r, "rPr");
    size = Math.max(size, Number(rPr?.getAttribute("sz") ?? 0));
    const marks: unknown[] = [];
    if (rPr?.getAttribute("b") === "1") marks.push({ type: "bold" });
    if (rPr?.getAttribute("i") === "1") marks.push({ type: "italic" });
    const link = rels.get(rid(kid(rPr, "hlinkClick"), "id") ?? "");
    const href = link?.external ? safeLinkUrl(link.target) : null;
    if (href) marks.push({ type: "link", attrs: { href } });
    runs.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
  }
  return { runs, bullet, size };
}

function shapes(tree: Element, rels: Map<string, { target: string; external: boolean }>): Shape[] {
  const out: Shape[] = [];
  for (const el of Array.from(tree.children)) {
    if (el.localName === "grpSp") out.push(...shapes(el, rels));
    else if (el.localName === "sp") {
      const ph = kid(kid(kid(el, "nvSpPr"), "nvPr"), "ph");
      const phType = ph ? (ph.getAttribute("type") ?? "body") : null;
      const body = kid(el, "txBody");
      if (!body) continue;
      const inBody = phType === "body" || phType === "obj";
      const paras = kids(body, "p")
        .map((p) => paragraph(p, inBody, rels))
        .filter((p) => p.runs.some((r) => r.text?.trim()));
      if (paras.length) out.push({ kind: "text", ph: phType, paras });
    } else if (el.localName === "pic") {
      const relId = rid(kid(kid(el, "blipFill"), "blip"), "embed");
      const alt = kid(kid(el, "nvPicPr"), "cNvPr")?.getAttribute("descr") ?? "";
      if (relId) out.push({ kind: "image", relId, alt });
    } else if (el.localName === "graphicFrame") {
      // Tables become one paragraph per row; charts and diagrams are skipped.
      for (const tr of all(el, "tr")) {
        const cells = kids(tr, "tc").map((tc) => all(tc, "t").map((t) => t.textContent ?? "").join(" ").trim());
        if (cells.some(Boolean)) out.push({ kind: "text", ph: null, paras: [{ runs: [{ type: "text", text: cells.join(" | ") }], bullet: null, size: 0 }] });
      }
    }
  }
  return out;
}

function parasToNodes(paras: ParsedPara[]): PMNode[] {
  const nodes: PMNode[] = [];
  for (const p of paras) {
    const para: PMNode = { type: "paragraph", content: p.runs };
    if (p.bullet) {
      const type = p.bullet === "number" ? "orderedList" : "bulletList";
      const last = nodes.at(-1);
      const item = { type: "listItem", content: [para] };
      if (last?.type === type) last.content!.push(item);
      else nodes.push({ type, content: [item] });
    } else nodes.push(para);
  }
  return nodes;
}

export type SlideResult = { title: PMNode[] | null; body: PMNode[]; images: { relId: string; alt: string }[]; hasTitlePlaceholder: boolean };

export function parseSlide(xml: string, parse: ParseXml, rels: Map<string, { target: string; type: string; external: boolean }>): SlideResult {
  const doc = parse(xml);
  const tree = all(doc, "spTree")[0];
  const list = tree ? shapes(tree, rels) : [];
  let title: PMNode[] | null = null;
  const titleShape = list.find((s) => s.kind === "text" && (s.ph === "title" || s.ph === "ctrTitle"));
  let rest = list.filter((s) => s !== titleShape);
  if (titleShape?.kind === "text") title = titleShape.paras.flatMap((p, i) => (i ? [{ type: "text", text: " " }, ...p.runs] : p.runs));
  else {
    // Decks built without placeholders: the first short text box with the
    // largest font is the title.
    const texts = rest.filter((s): s is Extract<Shape, { kind: "text" }> => s.kind === "text");
    const largest = Math.max(0, ...texts.flatMap((s) => s.paras.map((p) => p.size)));
    const candidate = texts.find((s) => s.paras.length <= 2 && largest > 0 && s.paras.every((p) => p.size === largest && !p.bullet));
    if (candidate) {
      title = candidate.paras.flatMap((p, i) => (i ? [{ type: "text", text: " " }, ...p.runs] : p.runs));
      rest = rest.filter((s) => s !== candidate);
    }
  }
  const body: PMNode[] = [];
  const images: SlideResult["images"] = [];
  for (const s of rest) {
    if (s.kind === "image") images.push({ relId: s.relId, alt: s.alt });
    else body.push(...parasToNodes(s.paras));
  }
  return { title, body, images, hasTitlePlaceholder: Boolean(titleShape) };
}

function notesText(xml: string, parse: ParseXml): string {
  const doc = parse(xml);
  const bodyShapes = all(doc, "sp").filter((sp) => all(sp, "ph").some((ph) => (ph.getAttribute("type") ?? "body") === "body"));
  return bodyShapes
    .flatMap((sp) => all(sp, "p").map((p) => all(p, "t").map((t) => t.textContent ?? "").join("")))
    .join("\n")
    .trim();
}

export async function pptxToDeck(data: ArrayBuffer | Uint8Array, opts: { parse: ParseXml; storeImage: ImageSink; now: string; fallbackTitle: string }): Promise<{ deck: Deck; skippedImages: number }> {
  const zip = await JSZip.loadAsync(data);
  const read = (p: string) => zip.file(p)?.async("string");
  const presXml = await read("ppt/presentation.xml");
  if (!presXml) throw new Error("This file is not a PowerPoint presentation.");
  const presRels = parseRels((await read("ppt/_rels/presentation.xml.rels")) ?? "<Relationships/>", opts.parse);
  const slideIds = slideRelIds(presXml);

  let skippedImages = 0;
  const cards: Card[] = [];
  for (const [index, relId] of slideIds.entries()) {
    const rel = presRels.get(relId);
    if (!rel) continue;
    const path = resolvePart("ppt/presentation.xml", rel.target);
    const xml = await read(path);
    if (!xml) continue;
    const relsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const rels = parseRels((await read(relsPath)) ?? "<Relationships/>", opts.parse);
    const slide = parseSlide(xml, opts.parse, rels);

    const content: PMNode[] = [];
    if (slide.title?.length) content.push({ type: "heading", attrs: { level: index === 0 ? 1 : 2 }, content: slide.title });
    content.push(...slide.body);
    for (const img of slide.images) {
      const target = rels.get(img.relId);
      const file = target && !target.external ? zip.file(resolvePart(path, target.target)) : null;
      const src = file ? await opts.storeImage(await file.async("uint8array"), target!.target).catch(() => null) : null;
      if (src) content.push({ type: "figure", attrs: { src, alt: img.alt, credit: "", creditUrl: null, query: null } });
      else skippedImages++;
    }

    const notesRel = [...rels.values()].find((r) => r.type.endsWith("/notesSlide"));
    const notesXml = notesRel ? await read(resolvePart(path, notesRel.target)) : undefined;
    const hasImage = content.some((n) => n.type === "figure");
    const layout: Card["layout"] = index === 0 && slide.body.length <= 1 && !hasImage ? "title" : hasImage && slide.body.length ? "image-right" : slide.body.some((n) => n.type === "bulletList") ? "bullets" : "blank";
    cards.push({
      ...emptyCard(layout),
      content: { type: "doc", content: (content.length ? content : [{ type: "paragraph" }]) as Card["content"]["content"] },
      notes: notesXml ? notesText(notesXml, opts.parse) : "",
    });
  }
  if (!cards.length) cards.push({ ...emptyCard("title"), content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: inlineToNodes(opts.fallbackTitle) }] as Card["content"]["content"] } });

  const docTitle = all(opts.parse((await read("docProps/core.xml")) ?? "<x/>"), "title")[0]?.textContent?.trim();
  const firstHeading = (cards[0].content.content?.[0] as PMNode | undefined)?.content?.map((t) => t.text ?? "").join("");
  return {
    deck: {
      id: newId(),
      title: (docTitle || firstHeading || opts.fallbackTitle).slice(0, 200),
      format: "presentation",
      themeId: "default",
      cards,
      createdAt: opts.now,
      updatedAt: opts.now,
    },
    skippedImages,
  };
}
