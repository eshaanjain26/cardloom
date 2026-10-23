import { inlineToNodes } from "../ai/convert";

export type PdfTextItem = { str: string; x: number; y: number; height: number };
type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string };

type Line = { text: string; y: number; height: number };

const BULLET = /^([•▪◦‣●○■□–—*-])\s+/;

// Groups positioned text (PDF y grows upward) into lines, top to bottom.
export function toLines(items: PdfTextItem[]): Line[] {
  const rows = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const key = Math.round(it.y / 2) * 2;
    rows.set(key, [...(rows.get(key) ?? []), it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, row]) => ({
      y,
      height: Math.max(...row.map((r) => r.height)),
      text: row
        .sort((a, b) => a.x - b.x)
        .map((r) => r.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    }));
}

// Turns one page of text into card content: a heading when the top line is
// clearly larger than the rest, then bullets and paragraphs.
export function pageToContent(items: PdfTextItem[], headingLevel: 1 | 2): PMNode[] {
  const lines = toLines(items);
  if (!lines.length) return [];
  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const nodes: PMNode[] = [];
  let start = 0;
  if (lines.length === 1 || (lines[0].height >= median * 1.3 && lines[0].text.length <= 120)) {
    // A title can wrap onto a second line of the same size.
    let title = lines[0].text;
    start = 1;
    if (lines[1] && Math.abs(lines[1].height - lines[0].height) < 0.5 && lines[0].height >= median * 1.3) {
      title += ` ${lines[1].text}`;
      start = 2;
    }
    nodes.push({ type: "heading", attrs: { level: headingLevel }, content: inlineToNodes(title) as PMNode[] });
  }

  let para: string[] = [];
  let list: PMNode | null = null;
  let prev: Line | null = null;
  const flush = () => {
    if (para.length) nodes.push({ type: "paragraph", content: inlineToNodes(para.join(" ")) as PMNode[] });
    para = [];
  };
  for (const line of lines.slice(start)) {
    const gap = prev ? prev.y - line.y : 0;
    const bullet = line.text.match(BULLET);
    if (bullet) {
      flush();
      if (!list) {
        list = { type: "bulletList", content: [] };
        nodes.push(list);
      }
      list.content!.push({ type: "listItem", content: [{ type: "paragraph", content: inlineToNodes(line.text.replace(BULLET, "")) as PMNode[] }] });
    } else if (list && gap <= line.height * 1.5 && prev) {
      // A wrapped bullet continues on the next line without its own marker.
      const lastItem = list.content!.at(-1)!.content![0];
      lastItem.content = inlineToNodes(`${(lastItem.content ?? []).map((t) => t.text ?? "").join("")} ${line.text}`) as PMNode[];
    } else {
      list = null;
      if (prev && gap > line.height * 1.8) flush();
      para.push(line.text);
    }
    prev = line;
  }
  flush();
  return nodes;
}
