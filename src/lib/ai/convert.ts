import type { Card } from "../deck/schema";
import type { FigureAttrs } from "../editor/nodes";
import { ChartDataSchema, normalizeChart } from "../media/chart";
import type { GenBlock, GenCard } from "./schemas";
import { GEN_LAYOUTS } from "./schemas";

type Mark = { type: "bold" | "italic" | "code" };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: Mark[] };

// Existing images by ref, so an AI rewrite of a card keeps their source and credit.
export type FigureRefs = Map<string, FigureAttrs>;

export const figureRef = (cardId: string, index: number) => `${cardId}/img${index}`;

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;

// Turns the small inline-markdown subset models emit (**bold**, *italic*,
// `code`) into ProseMirror text nodes.
export function inlineToNodes(text: string): TextNode[] {
  const nodes: TextNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    if (m[2]) nodes.push({ type: "text", text: m[2], marks: [{ type: "bold" }] });
    else if (m[3]) nodes.push({ type: "text", text: m[3], marks: [{ type: "italic" }] });
    else if (m[4]) nodes.push({ type: "text", text: m[4], marks: [{ type: "code" }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.filter((n) => n.text.length > 0);
}

function nodesToInline(nodes: PMNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return " ";
      const t = n.text ?? nodesToInline(n.content);
      const marks = (n.marks ?? []).map((m) => m.type);
      if (marks.includes("code")) return `\`${t}\``;
      if (marks.includes("bold")) return `**${t}**`;
      if (marks.includes("italic")) return `*${t}*`;
      return t;
    })
    .join("");
}

const paragraph = (text: string): PMNode => {
  const content = inlineToNodes(text);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

const list = (type: "bulletList" | "orderedList", items: string[]): PMNode => ({
  type,
  content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
});

function blockToNode(block: GenBlock, isFirst: boolean, layout: GenCard["layout"], refs?: FigureRefs): PMNode {
  switch (block.type) {
    case "image": {
      const known = block.ref ? refs?.get(block.ref) : undefined;
      const attrs: FigureAttrs = known
        ? { ...known, alt: block.alt || known.alt }
        : { src: null, alt: block.alt, credit: "", creditUrl: null, query: block.query.trim().slice(0, 300) || block.alt };
      return { type: "figure", attrs };
    }
    case "chart":
      return { type: "chart", attrs: { data: normalizeChart(block.chart) } };
    case "embed":
      return { type: "embed", attrs: { url: block.url } };
    case "heading":
      return {
        type: "heading",
        attrs: { level: isFirst && layout === "title" ? 1 : 2 },
        content: inlineToNodes(block.text),
      };
    case "paragraph":
      return paragraph(block.text);
    case "bullets":
      return list("bulletList", block.items);
    case "numbered":
      return list("orderedList", block.items);
    case "quote":
      return { type: "blockquote", content: [paragraph(block.text)] };
  }
}

function keepBlock(b: GenBlock): boolean {
  if ("text" in b) return Boolean(b.text.trim());
  if ("items" in b) return b.items.length > 0;
  if (b.type === "image") return Boolean(b.ref || b.query.trim() || b.alt.trim());
  if (b.type === "embed") return Boolean(b.url.trim());
  return b.chart.labels.length > 0;
}

export function genCardToContent(card: GenCard, refs?: FigureRefs): Card["content"] {
  const content = card.blocks.filter(keepBlock).map((b, i) => blockToNode(b, i === 0, card.layout, refs));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function figureRefs(cards: Card[]): FigureRefs {
  const refs: FigureRefs = new Map();
  for (const card of cards) {
    let n = 0;
    for (const node of (card.content.content ?? []) as PMNode[]) {
      if (node.type === "figure") refs.set(figureRef(card.id, n++), node.attrs as FigureAttrs);
    }
  }
  return refs;
}

export function contentToGenCard(card: Card): GenCard {
  const blocks: GenBlock[] = [];
  let images = 0;
  for (const node of (card.content.content ?? []) as PMNode[]) {
    switch (node.type) {
      case "figure": {
        const a = node.attrs as FigureAttrs;
        blocks.push({ type: "image", query: a.query ?? "", alt: a.alt ?? "", ref: figureRef(card.id, images++) });
        break;
      }
      case "chart": {
        const chart = ChartDataSchema.safeParse(node.attrs?.data);
        if (chart.success) blocks.push({ type: "chart", chart: chart.data });
        break;
      }
      case "embed":
        blocks.push({ type: "embed", url: String(node.attrs?.url ?? "") });
        break;
      case "heading":
        blocks.push({ type: "heading", text: nodesToInline(node.content) });
        break;
      case "bulletList":
      case "orderedList":
        blocks.push({
          type: node.type === "bulletList" ? "bullets" : "numbered",
          items: (node.content ?? []).map((li) => (li.content ?? []).map((p) => nodesToInline(p.content)).join(" ")),
        });
        break;
      case "blockquote":
        blocks.push({ type: "quote", text: (node.content ?? []).map((p) => nodesToInline(p.content)).join(" ") });
        break;
      default: {
        const text = node.type === "codeBlock" ? (node.content ?? []).map((t) => t.text ?? "").join("") : nodesToInline(node.content);
        if (text.trim()) blocks.push({ type: "paragraph", text });
      }
    }
  }
  const layout = (GEN_LAYOUTS as readonly string[]).includes(card.layout) ? (card.layout as GenCard["layout"]) : "blank";
  return { layout, blocks, notes: card.notes };
}
