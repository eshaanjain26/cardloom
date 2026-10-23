import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { ChartDataSchema, normalizeChart, type ChartData } from "../media/chart";
import { assetId, safeImageSrc, safeLinkUrl, toEmbed } from "../media/embeds";

export type FigureAttrs = {
  src: string | null;
  alt: string;
  credit: string;
  creditUrl: string | null;
  query: string | null;
};

// An image with optional credit line. `query` marks an image the AI asked for
// that has not been found or generated yet.
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      credit: { default: "" },
      creditUrl: { default: null },
      query: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-cl-figure]",
        getAttrs: (el) => {
          const img = el.querySelector("img");
          const id = img?.getAttribute("data-asset-id");
          return {
            src: id ? safeImageSrc(`asset:${id}`) : safeImageSrc(img?.getAttribute("src")),
            alt: img?.getAttribute("alt") ?? "",
            credit: el.querySelector("figcaption")?.textContent ?? "",
            creditUrl: safeLinkUrl(el.querySelector("figcaption a")?.getAttribute("href") ?? ""),
            query: el.getAttribute("data-query") || null,
          };
        },
      },
    ];
  },

  renderHTML({ node }): DOMOutputSpec {
    const a = node.attrs as FigureAttrs;
    const src = safeImageSrc(a.src);
    if (!src) {
      return [
        "figure",
        { "data-cl-figure": "", class: "cl-figure", "data-query": a.query ?? "" },
        ["div", { class: "cl-figure-pending" }, a.query ? `Image: ${a.query}` : "Image"],
      ];
    }
    const id = assetId(src);
    const img: DOMOutputSpec = [
      "img",
      id ? { "data-asset-id": id, alt: a.alt } : { src, alt: a.alt, loading: "lazy", referrerpolicy: "no-referrer" },
    ];
    const link = a.creditUrl ? safeLinkUrl(a.creditUrl) : null;
    const caption: DOMOutputSpec[] = a.credit
      ? [["figcaption", {}, link ? ["a", { href: link, target: "_blank", rel: "noopener noreferrer nofollow" }, a.credit] : a.credit]]
      : [];
    return ["figure", { "data-cl-figure": "", class: "cl-figure" }, img, ...caption];
  },
});

export function chartTable(chart: ChartData): DOMOutputSpec {
  return [
    "table",
    { class: "sr-only" },
    ["thead", {}, ["tr", {}, ["th", {}, "Label"], ...chart.series.map((s): DOMOutputSpec => ["th", {}, s.name])]],
    [
      "tbody",
      {},
      ...chart.labels.map(
        (l, i): DOMOutputSpec => ["tr", {}, ["th", {}, l], ...chart.series.map((s): DOMOutputSpec => ["td", {}, String(s.values[i] ?? 0)])],
      ),
    ],
  ];
}

export function parseChartAttr(raw: string | null): ChartData | null {
  if (!raw) return null;
  try {
    const parsed = ChartDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? normalizeChart(parsed.data) : null;
  } catch {
    return null;
  }
}

// The SVG is drawn on the client from `data-cl-chart`; the table carries the
// numbers for screen readers and for anything that cannot run scripts.
export const Chart = Node.create({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { data: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-cl-chart]", getAttrs: (el) => ({ data: parseChartAttr(el.getAttribute("data-cl-chart")) }) }];
  },

  renderHTML({ node }): DOMOutputSpec {
    const parsed = ChartDataSchema.safeParse(node.attrs.data);
    if (!parsed.success) return ["div", { class: "cl-chart" }];
    const chart = normalizeChart(parsed.data);
    return [
      "div",
      { "data-cl-chart": JSON.stringify(chart), class: "cl-chart" },
      ...(chart.title ? [["p", { class: "cl-chart-title" }, chart.title] as DOMOutputSpec] : []),
      ["div", { class: "cl-chart-svg" }],
      chartTable(chart),
    ];
  },
});

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { url: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "div[data-cl-embed]", getAttrs: (el) => ({ url: el.getAttribute("data-cl-embed") ?? "" }) }];
  },

  renderHTML({ node }): DOMOutputSpec {
    const url = String(node.attrs.url ?? "");
    const embed = toEmbed(url);
    const link = safeLinkUrl(url);
    if (!embed) {
      return [
        "div",
        { "data-cl-embed": url, class: "cl-embed cl-embed-link" },
        link ? ["a", { href: link, target: "_blank", rel: "noopener noreferrer nofollow" }, link] : "Invalid link",
      ];
    }
    return [
      "div",
      { "data-cl-embed": url, class: "cl-embed" },
      [
        "iframe",
        {
          src: embed.src,
          title: `${embed.provider} embed`,
          loading: "lazy",
          allow: "fullscreen; picture-in-picture; encrypted-media; clipboard-write",
          allowfullscreen: "true",
          sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ];
  },
});
