import { inlineToNodes, nodesToInline } from "../ai/convert";
import { emptyCard, newId, presentSequence } from "../deck/ops";
import { CARD_LAYOUTS, type Card, type Deck } from "../deck/schema";
import { ChartDataSchema, normalizeChart } from "../media/chart";
import { assetId, safeImageSrc, safeLinkUrl } from "../media/embeds";

type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string };

// Cardloom-specific details (layout, nesting, notes, chart data) ride along in
// HTML comments, so the file reads as plain Markdown everywhere else and still
// round-trips back into Cardloom.
const comment = (key: string, value: string) => `<!-- ${key}: ${value.replace(/--/g, "\\u002d\\u002d")} -->`;
const uncomment = (value: string) => value.replace(/\\u002d/g, "-");

function blockToMarkdown(node: PMNode): string {
  const inline = () => nodesToInline(node.content as never);
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 2))} ${inline()}`;
    case "paragraph":
      return inline();
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${node.type === "bulletList" ? "-" : `${i + 1}.`} ${(li.content ?? []).map((p) => nodesToInline(p.content as never)).join(" ")}`)
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((p) => `> ${nodesToInline(p.content as never)}`).join("\n>\n");
    case "codeBlock":
      return `\`\`\`\n${(node.content ?? []).map((t) => t.text ?? "").join("")}\n\`\`\``;
    case "horizontalRule":
      return "***";
    case "figure": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
      const alt = String(node.attrs?.alt ?? "");
      if (!src) return comment("image", String(node.attrs?.query ?? alt));
      if (assetId(src)) return comment("image stored in Cardloom", alt || "image");
      const credit = node.attrs?.credit ? `\n*${String(node.attrs.credit)}*` : "";
      return `![${alt.replace(/[[\]]/g, "")}](${src})${credit}`;
    }
    case "chart": {
      const parsed = ChartDataSchema.safeParse(node.attrs?.data);
      if (!parsed.success) return "";
      const c = parsed.data;
      const table = [
        `| ${["", ...c.series.map((s) => s.name)].join(" | ")} |`,
        `| ${["---", ...c.series.map(() => "---:")].join(" | ")} |`,
        ...c.labels.map((l, i) => `| ${[l, ...c.series.map((s) => String(s.values[i] ?? 0))].join(" | ")} |`),
      ].join("\n");
      return `${c.title ? `**${c.title}**\n\n` : ""}${table}\n${comment("chart", JSON.stringify(c))}`;
    }
    case "embed":
      return `${comment("embed", String(node.attrs?.url ?? ""))}\n<${String(node.attrs?.url ?? "")}>`;
    default:
      return "";
  }
}

export function deckToMarkdown(deck: Deck): string {
  const header = comment("cardloom", JSON.stringify({ title: deck.title, theme: deck.themeId, format: deck.format }));
  const cards = presentSequence(deck).map(({ card, depth }) => {
    const meta = [
      card.layout !== "blank" ? comment("layout", card.layout) : "",
      depth > 0 ? comment("depth", String(depth)) : "",
    ].filter(Boolean);
    const body = ((card.content.content ?? []) as PMNode[]).map(blockToMarkdown).filter((b) => b.trim());
    const notes = card.notes.trim() ? [comment("notes", card.notes.trim())] : [];
    return [...meta, ...body, ...notes].join("\n\n");
  });
  return `${header}\n\n${cards.join("\n\n---\n\n")}\n`;
}

const para = (text: string): PMNode => {
  const content = inlineToNodes(text) as PMNode[];
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

function parseChartComment(value: string): PMNode | null {
  try {
    const chart = ChartDataSchema.safeParse(JSON.parse(uncomment(value)));
    return chart.success ? { type: "chart", attrs: { data: normalizeChart(chart.data) } } : null;
  } catch {
    return null;
  }
}

type ParsedCard = { layout: Card["layout"]; depth: number; notes: string; content: PMNode[] };

function parseCard(lines: string[]): ParsedCard {
  const out: ParsedCard = { layout: "blank", depth: 0, notes: "", content: [] };
  let i = 0;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.content.push(para(paragraph.join(" ")));
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const meta = trimmed.match(/^<!--\s*([\w ]+):\s*([\s\S]*?)\s*-->$/);
    if (meta) {
      flush();
      const [, key, value] = meta;
      if (key === "layout" && (CARD_LAYOUTS as readonly string[]).includes(value)) out.layout = value as Card["layout"];
      else if (key === "depth") out.depth = Math.max(0, Math.min(3, Number(value) || 0));
      else if (key === "notes") out.notes = uncomment(value);
      else if (key === "image") out.content.push({ type: "figure", attrs: { src: null, alt: "", credit: "", creditUrl: null, query: uncomment(value) } });
      else if (key === "embed" && safeLinkUrl(value)) {
        out.content.push({ type: "embed", attrs: { url: value } });
        if (lines[i + 1]?.trim() === `<${value}>`) i++;
      } else if (key === "chart") {
        const chart = parseChartComment(value);
        if (chart) {
          // Drop the bold title line written above the table on export.
          const title = (chart.attrs?.data as { title?: string }).title;
          const last = out.content.at(-1);
          if (title && last?.type === "paragraph" && nodesToInline(last.content as never) === `**${title}**`) out.content.pop();
          out.content.push(chart);
        }
      }
      i++;
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      out.content.push({ type: "codeBlock", content: code.length ? [{ type: "text", text: code.join("\n") }] : [] });
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      out.content.push({ type: "heading", attrs: { level: heading[1].length }, content: inlineToNodes(heading[2]) as PMNode[] });
      i++;
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)\]\((\S+)\)$/);
    if (image) {
      flush();
      const src = safeImageSrc(image[2]);
      const credit = lines[i + 1]?.trim().match(/^\*([^*]+)\*$/);
      if (src) out.content.push({ type: "figure", attrs: { src, alt: image[1], credit: credit ? credit[1] : "", creditUrl: null, query: null } });
      i += credit ? 2 : 1;
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(trimmed)) {
      flush();
      const ordered = /^\d/.test(trimmed);
      const items: PMNode[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && /^\d/.test(lines[i].trim()) === ordered) {
        items.push({ type: "listItem", content: [para(lines[i].trim().replace(/^([-*+]|\d+[.)])\s+/, ""))] });
        i++;
      }
      out.content.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].trim().replace(/^>\s?/, ""));
      out.content.push({ type: "blockquote", content: quote.join("\n").split(/\n\s*\n/).map((q) => para(q.replace(/\n/g, " "))) });
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      // A table written by Cardloom is followed by its chart comment, which wins.
      const next = lines[i]?.trim() ?? "";
      if (next.startsWith("<!-- chart:")) continue;
      out.content.push(para(rows.join(" ")));
      continue;
    }
    if (!trimmed) {
      flush();
      i++;
      continue;
    }
    paragraph.push(trimmed);
    i++;
  }
  flush();
  return out;
}

function splitCards(lines: string[]): string[][] {
  const cards: string[][] = [[]];
  let fence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) fence = !fence;
    if (!fence && /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim()) && line.trim().startsWith("-")) cards.push([]);
    else cards.at(-1)!.push(line);
  }
  return cards.filter((c) => c.some((l) => l.trim()));
}

// Without "---" separators, start a new card at every top-level heading.
function splitOnHeadings(lines: string[]): string[][] {
  const cards: string[][] = [[]];
  let fence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) fence = !fence;
    if (!fence && /^#{1,2}\s/.test(line.trim()) && cards.at(-1)!.some((l) => l.trim())) cards.push([]);
    cards.at(-1)!.push(line);
  }
  return cards.filter((c) => c.some((l) => l.trim()));
}

export function markdownToDeck(markdown: string, now: string, fallbackTitle = "Imported deck"): Deck {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  let theme = "default";
  let format: Deck["format"] = "presentation";
  const headerIndex = lines.findIndex((l) => l.trim().startsWith("<!-- cardloom:"));
  if (headerIndex !== -1) {
    try {
      const meta = JSON.parse(uncomment(lines[headerIndex].trim().replace(/^<!--\s*cardloom:\s*/, "").replace(/\s*-->$/, "")));
      title = String(meta.title ?? "");
      theme = String(meta.theme ?? "default");
      if (["presentation", "document", "webpage", "social"].includes(meta.format)) format = meta.format;
    } catch {
      // Ignore a damaged header; the content still imports.
    }
    lines.splice(headerIndex, 1);
  }
  const hasSeparators = lines.some((l) => /^-{3,}\s*$/.test(l.trim()));
  const groups = hasSeparators ? splitCards(lines) : splitOnHeadings(lines);
  const parsed = groups.map(parseCard).filter((c) => c.content.length || c.notes);
  if (!parsed.length) parsed.push({ layout: "title", depth: 0, notes: "", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title || fallbackTitle }] }] });

  // Rebuild nesting from depth markers: a card nests under the nearest card above it with a smaller depth.
  const roots: Card[] = [];
  const stack: { card: Card; depth: number }[] = [];
  for (const p of parsed) {
    const card: Card = { ...emptyCard(p.layout), content: { type: "doc", content: p.content as Card["content"]["content"] }, notes: p.notes };
    while (stack.length && stack.at(-1)!.depth >= p.depth) stack.pop();
    if (stack.length && p.depth > 0) stack.at(-1)!.card.children.push(card);
    else roots.push(card);
    stack.push({ card, depth: stack.length && p.depth > 0 ? p.depth : 0 });
  }

  const firstHeading = parsed.flatMap((p) => p.content).find((n) => n.type === "heading");
  const derived = firstHeading ? nodesToInline(firstHeading.content as never).replace(/[*`]/g, "") : "";
  return {
    id: newId(),
    title: (title || derived || fallbackTitle).slice(0, 200),
    format,
    themeId: theme,
    cards: roots,
    createdAt: now,
    updatedAt: now,
  };
}
