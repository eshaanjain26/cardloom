import type { Card } from "../deck/schema";
import type { GenBlock, GenCard } from "./schemas";
import { GEN_LAYOUTS } from "./schemas";

type Mark = { type: "bold" | "italic" | "code" };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: Mark[] };

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

function blockToNode(block: GenBlock, isFirst: boolean, layout: GenCard["layout"]): PMNode {
  switch (block.type) {
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

export function genCardToContent(card: GenCard): Card["content"] {
  const content = card.blocks
    .filter((b) => ("text" in b ? b.text.trim() : b.items.length > 0))
    .map((b, i) => blockToNode(b, i === 0, card.layout));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function contentToGenCard(card: Card): GenCard {
  const blocks: GenBlock[] = [];
  for (const node of (card.content.content ?? []) as PMNode[]) {
    switch (node.type) {
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
