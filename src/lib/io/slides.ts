import type { Card } from "../deck/schema";
import type { FigureAttrs } from "../editor/nodes";
import { ChartDataSchema, normalizeChart, type ChartData } from "../media/chart";
import { safeImageSrc, safeLinkUrl } from "../media/embeds";

// A format-neutral description of one slide, built from a card. PPTX export
// renders it; keeping it pure makes the mapping testable without Office files.

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string };
export type Para = { runs: Run[]; bullet?: "bullet" | "number"; heading?: boolean; quote?: boolean; code?: boolean };
export type SlideSpec = {
  layout: Card["layout"];
  title: Run[] | null;
  body: Para[];
  image: { src: string; alt: string; credit: string } | null;
  chart: ChartData | null;
  notes: string;
};

type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: { href?: string } }[] };

function runs(nodes: PMNode[] | undefined): Run[] {
  return (nodes ?? []).flatMap((n): Run[] => {
    if (n.type === "hardBreak") return [{ text: " " }];
    if (typeof n.text !== "string") return runs(n.content);
    const marks = n.marks ?? [];
    const run: Run = { text: n.text };
    if (marks.some((m) => m.type === "bold")) run.bold = true;
    if (marks.some((m) => m.type === "italic")) run.italic = true;
    if (marks.some((m) => m.type === "code")) run.code = true;
    const href = safeLinkUrl(marks.find((m) => m.type === "link")?.attrs?.href ?? "");
    if (href) run.link = href;
    return [run];
  });
}

export function cardToSlideSpec(card: Card): SlideSpec {
  const spec: SlideSpec = { layout: card.layout, title: null, body: [], image: null, chart: null, notes: card.notes };
  for (const node of (card.content.content ?? []) as PMNode[]) {
    switch (node.type) {
      case "heading":
        if (!spec.title) spec.title = runs(node.content);
        else spec.body.push({ runs: runs(node.content), heading: true });
        break;
      case "paragraph": {
        const r = runs(node.content);
        if (r.some((x) => x.text.trim())) spec.body.push({ runs: r });
        break;
      }
      case "bulletList":
      case "orderedList":
        for (const li of node.content ?? []) {
          spec.body.push({ runs: runs(li.content), bullet: node.type === "bulletList" ? "bullet" : "number" });
        }
        break;
      case "blockquote":
        for (const p of node.content ?? []) spec.body.push({ runs: runs(p.content), quote: true });
        break;
      case "codeBlock":
        spec.body.push({ runs: [{ text: (node.content ?? []).map((t) => t.text ?? "").join(""), code: true }], code: true });
        break;
      case "figure": {
        const a = node.attrs as FigureAttrs;
        const src = safeImageSrc(a.src);
        if (src && !spec.image) spec.image = { src, alt: a.alt ?? "", credit: a.credit ?? "" };
        break;
      }
      case "chart": {
        const c = ChartDataSchema.safeParse(node.attrs?.data);
        if (c.success && !spec.chart) spec.chart = normalizeChart(c.data);
        break;
      }
      case "embed": {
        const url = safeLinkUrl(String(node.attrs?.url ?? ""));
        if (url) spec.body.push({ runs: [{ text: url, link: url }] });
        break;
      }
    }
  }
  return spec;
}

export function fontFor(stack: string): string {
  const s = stack.toLowerCase();
  if (s.includes("mono")) return "Consolas";
  if (s.includes("serif") && !s.startsWith("ui-sans") && !s.includes("sans-serif")) return "Georgia";
  return "Arial";
}

export const hex = (color: string) => color.replace("#", "").toUpperCase();
