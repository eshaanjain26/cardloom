import { describe, expect, it } from "vitest";
import { chartToCsv, formatValue, normalizeChart, parseChartCsv, pieSlices, renderChartSvg, type ChartData } from "./chart";

const bar: ChartData = {
  type: "bar",
  title: "Visits",
  labels: ["Q1", "Q2", "Q3"],
  series: [
    { name: "Elm", values: [10, 20, 30] },
    { name: "Oak", values: [5, 15, 25] },
  ],
};

describe("csv", () => {
  it("parses headers, quoted cells, currency, and tabs", () => {
    expect(parseChartCsv('Quarter,"Revenue, $"\nQ1,"$1,200"\nQ2\t50%')).toEqual({
      labels: ["Q1", "Q2"],
      series: [{ name: "Revenue, $", values: [1200, 50] }],
    });
  });

  it("reports bad input", () => {
    expect(parseChartCsv("only header")).toHaveProperty("error");
    expect(parseChartCsv("Label\nQ1")).toHaveProperty("error");
    expect(parseChartCsv("Label,A\nQ1,abc")).toEqual({ error: 'Row 2: "abc" is not a number.' });
  });

  it("round-trips through chartToCsv", () => {
    const parsed = parseChartCsv(chartToCsv(bar));
    expect(parsed).toEqual({ labels: bar.labels, series: bar.series });
  });
});

describe("normalizeChart", () => {
  it("caps series, pads values, and keeps one series for pies", () => {
    const many = { ...bar, series: Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, values: [1] })) };
    const n = normalizeChart(many);
    expect(n.series).toHaveLength(4);
    expect(n.series[0].values).toEqual([1, 0, 0]);
    expect(normalizeChart({ ...bar, type: "pie" }).series).toHaveLength(1);
  });
});

describe("pieSlices", () => {
  it("keeps up to four slices and folds the rest into Other", () => {
    const pie: ChartData = { type: "pie", title: "", labels: ["a", "b", "c", "d", "e"], series: [{ name: "x", values: [1, 5, 3, 2, 4] }] };
    expect(pieSlices(pie)).toEqual([
      { label: "b", value: 5, other: false },
      { label: "e", value: 4, other: false },
      { label: "c", value: 3, other: false },
      { label: "Other", value: 3, other: true },
    ]);
    expect(pieSlices({ ...pie, labels: ["a", "b"], series: [{ name: "x", values: [1, 2] }] })).toHaveLength(2);
  });
});

describe("renderChartSvg", () => {
  it("draws one bar per value with a legend and labels", () => {
    const svg = renderChartSvg(bar);
    expect(svg.match(/<path d="M/g)).toHaveLength(6);
    expect(svg).toContain("var(--cl-series-2)");
    expect(svg).toContain(">Oak<");
    expect(svg).toContain('aria-label="Visits"');
  });

  it("uses the theme accent for a single series", () => {
    const svg = renderChartSvg({ ...bar, type: "line", series: [bar.series[0]] });
    expect(svg).toContain('stroke="var(--cl-accent)"');
    expect(svg).not.toContain("--cl-series-1");
    expect(svg.match(/<circle/g)).toHaveLength(3);
  });

  it("escapes text", () => {
    const svg = renderChartSvg({ ...bar, title: '<script>"x"', labels: ["<b>", "Q2", "Q3"] });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;b&gt;");
  });

  it("draws a full circle for a single-slice pie", () => {
    expect(renderChartSvg({ type: "pie", title: "", labels: ["all"], series: [{ name: "x", values: [3] }] })).toContain("<circle");
  });

  it("formats values compactly", () => {
    expect([formatValue(18400), formatValue(2_500_000), formatValue(41), formatValue(0.125)]).toEqual(["18.4k", "2.5M", "41", "0.13"]);
  });
});
