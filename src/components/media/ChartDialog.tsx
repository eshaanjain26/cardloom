"use client";

import { useEffect, useMemo, useState } from "react";
import { CHART_TYPES, chartToCsv, MAX_SERIES, normalizeChart, parseChartCsv, renderChartSvg, type ChartData } from "@/lib/media/chart";
import { field, Modal, primaryBtn } from "./Modal";

const SAMPLE: ChartData = {
  type: "bar",
  title: "",
  labels: ["Q1", "Q2", "Q3", "Q4"],
  series: [{ name: "Value", values: [10, 14, 9, 18] }],
};

type Props = { open: boolean; initial?: ChartData | null; onClose: () => void; onSave: (data: ChartData) => void; themeStyle?: React.CSSProperties };

export function ChartDialog({ open, initial, onClose, onSave, themeStyle }: Props) {
  const [type, setType] = useState<ChartData["type"]>("bar");
  const [title, setTitle] = useState("");
  const [csv, setCsv] = useState("");

  useEffect(() => {
    if (!open) return;
    const start = initial ?? SAMPLE;
    setType(start.type);
    setTitle(start.title);
    setCsv(chartToCsv(start));
  }, [open, initial]);

  const parsed = useMemo(() => parseChartCsv(csv), [csv]);
  const chart = "error" in parsed ? null : normalizeChart({ type, title, ...parsed });

  return (
    <Modal open={open} title={initial ? "Edit chart" : "Add chart"} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (chart) onSave(chart);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Type
            <select className={field} value={type} onChange={(e) => setType(e.target.value as ChartData["type"])}>
              {CHART_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <input className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Data (CSV: first row is the header, one row per label)
          <textarea className={`${field} font-mono`} rows={7} value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} />
          <span className="text-xs font-normal text-neutral-500">
            Up to {MAX_SERIES} series. Pies use the first series and show the 3 largest values plus Other.
          </span>
        </label>
        {"error" in parsed ? (
          <p role="alert" className="text-sm text-red-700">
            {parsed.error}
          </p>
        ) : (
          chart && (
            <div className="cl-card" style={themeStyle} aria-label="Preview">
              <div className="cl-chart-svg" dangerouslySetInnerHTML={{ __html: renderChartSvg(chart) }} />
            </div>
          )
        )}
        <button type="submit" className={`${primaryBtn} w-fit`} disabled={!chart}>
          {initial ? "Save chart" : "Add chart"}
        </button>
      </form>
    </Modal>
  );
}
