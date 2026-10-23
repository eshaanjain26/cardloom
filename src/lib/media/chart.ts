import { z } from "zod/v4";

export const CHART_TYPES = ["bar", "line", "pie"] as const;
export const MAX_SERIES = 4;
export const MAX_LABELS = 24;
// Beyond three slices the categorical palette cannot keep every pair apart, so
// pies fold the rest into "Other".
export const MAX_PIE_SLICES = 3;

export const ChartDataSchema = z.object({
  type: z.enum(CHART_TYPES),
  title: z.string(),
  labels: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
});
export type ChartData = z.infer<typeof ChartDataSchema>;

export function normalizeChart(input: ChartData): ChartData {
  const labels = input.labels.slice(0, MAX_LABELS).map((l) => l.trim().slice(0, 60));
  const series = input.series
    .slice(0, input.type === "pie" ? 1 : MAX_SERIES)
    .map((s) => ({
      name: s.name.trim().slice(0, 60) || "Series",
      values: labels.map((_, i) => (Number.isFinite(s.values[i]) ? s.values[i] : 0)),
    }));
  return {
    type: input.type,
    title: input.title.trim().slice(0, 120),
    labels,
    series: series.length ? series : [{ name: "Series", values: labels.map(() => 0) }],
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const toNumber = (s: string) => Number(s.replace(/[$,%\s]/g, ""));

// First row: a label header followed by series names. Each following row: a
// category label followed by one value per series.
export function parseChartCsv(text: string): { labels: string[]; series: ChartData["series"] } | { error: string } {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(splitCsvLine);
  if (rows.length < 2) return { error: "Add a header row and at least one data row." };
  const names = rows[0].slice(1);
  if (names.length === 0) return { error: "The header needs at least one series name after the label column." };
  const body = rows.slice(1);
  for (const [i, row] of body.entries()) {
    for (const cell of row.slice(1, names.length + 1)) {
      if (cell !== "" && !Number.isFinite(toNumber(cell))) return { error: `Row ${i + 2}: "${cell}" is not a number.` };
    }
  }
  return {
    labels: body.map((r) => r[0] ?? ""),
    series: names.map((name, s) => ({ name, values: body.map((r) => (r[s + 1] ? toNumber(r[s + 1]) : 0)) })),
  };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function chartToCsv(chart: ChartData): string {
  const header = ["Label", ...chart.series.map((s) => s.name)].map(csvCell).join(",");
  const rows = chart.labels.map((l, i) => [csvCell(l), ...chart.series.map((s) => String(s.values[i] ?? 0))].join(","));
  return [header, ...rows].join("\n");
}

export function pieSlices(chart: ChartData): { label: string; value: number; other: boolean }[] {
  const values = chart.labels
    .map((label, i) => ({ label, value: Math.max(0, chart.series[0]?.values[i] ?? 0), other: false }))
    .sort((a, b) => b.value - a.value);
  if (values.length <= MAX_PIE_SLICES + 1) return values;
  const rest = values.slice(MAX_PIE_SLICES).reduce((sum, v) => sum + v.value, 0);
  return [...values.slice(0, MAX_PIE_SLICES), { label: "Other", value: rest, other: true }];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${+(v / 1e3).toFixed(1)}k`;
  return String(+v.toFixed(2));
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= max)!;
  return step * pow;
}

const seriesColor = (chart: ChartData, i: number) => (chart.series.length === 1 && chart.type !== "pie" ? "var(--cl-accent)" : `var(--cl-series-${i + 1})`);

// Renders a chart as a self-contained SVG string. Colors are CSS variables set
// by the card theme, so the same markup works on every theme.
export function renderChartSvg(input: ChartData): string {
  const chart = normalizeChart(input);
  const W = 640;
  const H = 360;
  const text = 'fill="var(--cl-muted)" font-size="12" font-family="var(--cl-font-body)"';
  const parts: string[] = [];
  const legend = chart.type !== "pie" && chart.series.length > 1;
  const top = legend ? 40 : 16;

  if (legend) {
    let x = 0;
    chart.series.forEach((s, i) => {
      parts.push(`<rect x="${x}" y="8" width="12" height="12" rx="3" fill="${seriesColor(chart, i)}"/>`);
      parts.push(`<text x="${x + 18}" y="18" ${text}>${esc(s.name)}</text>`);
      x += 30 + s.name.length * 7;
    });
  }

  if (chart.type === "pie") {
    const slices = pieSlices(chart);
    const total = slices.reduce((s, v) => s + v.value, 0) || 1;
    const cx = 180;
    const cy = H / 2;
    const r = 130;
    let angle = -Math.PI / 2;
    slices.forEach((slice, i) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const color = slice.other ? "var(--cl-muted)" : `var(--cl-series-${i + 1})`;
      const pct = `${Math.round((slice.value / total) * 100)}%`;
      if (sweep >= Math.PI * 2 - 1e-6) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"><title>${esc(slice.label)}: ${formatValue(slice.value)}</title></circle>`);
      } else if (sweep > 0) {
        const [x1, y1] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
        const [x2, y2] = [cx + r * Math.cos(angle + sweep), cy + r * Math.sin(angle + sweep)];
        parts.push(
          `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="var(--cl-surface)" stroke-width="2"><title>${esc(slice.label)}: ${formatValue(slice.value)} (${pct})</title></path>`,
        );
      }
      angle += sweep;
      const ly = 90 + i * 34;
      parts.push(`<rect x="360" y="${ly - 11}" width="14" height="14" rx="3" fill="${color}"/>`);
      parts.push(`<text x="382" y="${ly}" fill="var(--cl-text)" font-size="14" font-family="var(--cl-font-body)">${esc(slice.label)}</text>`);
      parts.push(`<text x="382" y="${ly + 16}" ${text}>${formatValue(slice.value)} · ${pct}</text>`);
    });
  } else {
    const left = 48;
    const bottom = H - 36;
    const plotW = W - left - 8;
    const plotH = bottom - top;
    const all = chart.series.flatMap((s) => s.values);
    const max = niceMax(Math.max(0, ...all));
    const y = (v: number) => bottom - (Math.max(0, v) / max) * plotH;

    for (let t = 0; t <= 4; t++) {
      const v = (max / 4) * t;
      parts.push(`<line x1="${left}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--cl-muted)" stroke-opacity="${t === 0 ? 0.5 : 0.15}" stroke-width="1"/>`);
      parts.push(`<text x="${left - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" ${text}>${formatValue(v)}</text>`);
    }
    const band = plotW / Math.max(1, chart.labels.length);
    const showEvery = Math.ceil(chart.labels.length / 12);
    chart.labels.forEach((label, i) => {
      if (i % showEvery) return;
      parts.push(`<text x="${(left + band * (i + 0.5)).toFixed(1)}" y="${bottom + 20}" text-anchor="middle" ${text}>${esc(label.slice(0, 14))}</text>`);
    });

    if (chart.type === "bar") {
      const n = chart.series.length;
      const groupW = band * 0.7;
      const gap = 2;
      const barW = Math.max(2, (groupW - gap * (n - 1)) / n);
      const labelBars = chart.labels.length * n <= 12;
      chart.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const x = left + band * i + (band - groupW) / 2 + si * (barW + gap);
          const h = bottom - y(v);
          const r = Math.min(4, barW / 2, h);
          const yy = y(v);
          // Rounded top corners only; the bar stays anchored to the baseline.
          const d = `M${x.toFixed(1)},${bottom} V${(yy + r).toFixed(1)} Q${x.toFixed(1)},${yy.toFixed(1)} ${(x + r).toFixed(1)},${yy.toFixed(1)} H${(x + barW - r).toFixed(1)} Q${(x + barW).toFixed(1)},${yy.toFixed(1)} ${(x + barW).toFixed(1)},${(yy + r).toFixed(1)} V${bottom} Z`;
          parts.push(`<path d="${d}" fill="${seriesColor(chart, si)}"><title>${esc(s.name)} · ${esc(chart.labels[i])}: ${formatValue(v)}</title></path>`);
          if (labelBars) parts.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${(yy - 6).toFixed(1)}" text-anchor="middle" fill="var(--cl-text)" font-size="12" font-family="var(--cl-font-body)">${formatValue(v)}</text>`);
        });
      });
    } else {
      chart.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => [left + band * (i + 0.5), y(v)] as const);
        parts.push(`<polyline points="${pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}" fill="none" stroke="${seriesColor(chart, si)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
        pts.forEach(([px, py], i) =>
          parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${seriesColor(chart, si)}" stroke="var(--cl-surface)" stroke-width="2"><title>${esc(s.name)} · ${esc(chart.labels[i])}: ${formatValue(s.values[i])}</title></circle>`),
        );
        const last = pts.at(-1);
        if (last) parts.push(`<text x="${(last[0] - 6).toFixed(1)}" y="${(last[1] - 10).toFixed(1)}" text-anchor="end" fill="var(--cl-text)" font-size="12" font-family="var(--cl-font-body)">${formatValue(s.values.at(-1)!)}</text>`);
      });
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(chart.title || "Chart")}" style="width:100%;height:auto;overflow:visible">${parts.join("")}</svg>`;
}
