import PptxGenJS from "pptxgenjs";
import { presentSequence } from "../deck/ops";
import type { Deck } from "../deck/schema";
import { pieSlices } from "../media/chart";
import { getTheme, SERIES_DARK, SERIES_LIGHT } from "../themes";
import { cardToSlideSpec, fontFor, hex, type Para, type Run } from "./slides";

// 13.33 x 7.5 in, PowerPoint's default widescreen size.
const W = 13.333;
const H = 7.5;
const M = 0.6;

export type ImageResolver = (src: string) => Promise<string | null>;

function textRuns(runs: Run[], base: { color: string; font: string; accent: string }): PptxGenJS.TextProps[] {
  return runs.map((r) => ({
    text: r.text,
    options: {
      bold: r.bold,
      italic: r.italic,
      fontFace: r.code ? "Consolas" : base.font,
      color: r.link ? base.accent : base.color,
      ...(r.link ? { hyperlink: { url: r.link } } : {}),
    },
  }));
}

function bodyRuns(paras: Para[], base: { color: string; font: string; muted: string; accent: string }): PptxGenJS.TextProps[] {
  return paras.flatMap((p, i) => {
    const runs = textRuns(p.runs, { ...base, color: p.quote ? base.muted : base.color });
    if (runs.length === 0) runs.push({ text: "" });
    const last = runs.length - 1;
    return runs.map((r, j) => ({
      text: r.text,
      options: {
        ...r.options,
        ...(p.heading ? { bold: true, fontSize: 22 } : {}),
        ...(p.quote ? { italic: true } : {}),
        ...(j === 0 && p.bullet ? { bullet: p.bullet === "number" ? { type: "number" as const } : true } : {}),
        ...(j === last && i < paras.length - 1 ? { breakLine: true } : {}),
        paraSpaceAfter: 6,
      },
    }));
  });
}

export async function deckToPptx(deck: Deck, resolveImage: ImageResolver): Promise<{ pptx: PptxGenJS; skippedImages: number }> {
  const theme = getTheme(deck.themeId);
  const colors = {
    color: hex(theme.colors.text),
    muted: hex(theme.colors.muted),
    accent: hex(theme.colors.accent),
    font: fontFor(theme.fonts.body),
  };
  const headingFont = fontFor(theme.fonts.heading);
  const series = (theme.dark ? SERIES_DARK : SERIES_LIGHT).map(hex);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.defineSlideMaster({
    title: "CARDLOOM",
    background: { color: hex(theme.colors.surface) },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.4, w: W - 2 * M, h: 1.1 }, text: "" } }],
  });

  let skippedImages = 0;
  for (const { card } of presentSequence(deck)) {
    const spec = cardToSlideSpec(card);
    const slide = pptx.addSlide({ masterName: "CARDLOOM" });
    const isTitle = spec.layout === "title";
    if (spec.title) {
      slide.addText(textRuns(spec.title, { ...colors, font: headingFont }), {
        placeholder: "title",
        fontFace: headingFont,
        fontSize: isTitle ? 40 : 30,
        bold: true,
        color: colors.color,
        align: isTitle ? "center" : "left",
        valign: isTitle ? "bottom" : "middle",
        ...(isTitle ? { y: 1.6, h: 2 } : {}),
      });
    }

    const top = isTitle ? 3.8 : 1.7;
    const media = spec.image || spec.chart;
    const half = (W - 3 * M) / 2;
    const mediaLeft = spec.layout === "image-left";
    const textX = media && spec.body.length ? (mediaLeft ? 2 * M + half : M) : M;
    const textW = media && spec.body.length ? half : W - 2 * M;
    const mediaBox = spec.body.length ? { x: mediaLeft ? M : 2 * M + half, y: top, w: half, h: H - top - M } : { x: M, y: top, w: W - 2 * M, h: H - top - M };

    if (spec.body.length) {
      slide.addText(bodyRuns(spec.body, colors), {
        x: textX,
        y: top,
        w: textW,
        h: H - top - M,
        fontSize: 18,
        fontFace: colors.font,
        color: colors.color,
        valign: "top",
        align: isTitle ? "center" : "left",
      });
    }

    if (spec.image) {
      const data = await resolveImage(spec.image.src).catch(() => null);
      if (data) {
        slide.addImage({ data, ...mediaBox, sizing: { type: "contain", w: mediaBox.w, h: mediaBox.h }, altText: spec.image.alt });
        if (spec.image.credit) slide.addText(spec.image.credit, { x: mediaBox.x, y: H - M + 0.05, w: mediaBox.w, h: 0.3, fontSize: 9, color: colors.muted });
      } else skippedImages++;
    } else if (spec.chart) {
      const c = spec.chart;
      const data =
        c.type === "pie"
          ? [{ name: c.series[0]?.name ?? "", labels: pieSlices(c).map((s) => s.label), values: pieSlices(c).map((s) => s.value) }]
          : c.series.map((s) => ({ name: s.name, labels: c.labels, values: s.values }));
      slide.addChart(c.type === "pie" ? pptx.ChartType.pie : c.type === "line" ? pptx.ChartType.line : pptx.ChartType.bar, data, {
        ...mediaBox,
        chartColors: c.type !== "pie" && c.series.length === 1 ? [colors.accent] : series,
        showLegend: c.type === "pie" || c.series.length > 1,
        legendPos: "b",
        showValue: c.type !== "line",
        showTitle: Boolean(c.title),
        title: c.title,
        titleColor: colors.color,
        catAxisLabelColor: colors.muted,
        valAxisLabelColor: colors.muted,
        dataLabelColor: colors.color,
        lineSize: 2,
      });
    }

    if (spec.notes.trim()) slide.addNotes(spec.notes);
  }
  return { pptx, skippedImages };
}
