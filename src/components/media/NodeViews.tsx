"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Chart, Embed, Figure, type FigureAttrs } from "@/lib/editor/nodes";
import { cardExtensions } from "@/lib/editor/extensions";
import { browserAssetStore } from "@/lib/media/assets";
import { ChartDataSchema, normalizeChart, renderChartSvg } from "@/lib/media/chart";
import { assetId, safeImageSrc, safeLinkUrl, toEmbed } from "@/lib/media/embeds";
import { useDeckContext } from "../DeckContext";
import { ChartDialog } from "./ChartDialog";
import { EmbedDialog } from "./EmbedDialog";
import { ImageDialog } from "./ImageDialog";

const chip = "rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-neutral-800 shadow-sm ring-1 ring-neutral-200 hover:ring-neutral-500";

function useImageUrl(src: string | null): string | null {
  const id = assetId(src);
  const [url, setUrl] = useState<string | null>(id ? null : src);
  useEffect(() => {
    if (!id) {
      setUrl(src);
      return;
    }
    let live = true;
    void browserAssetStore()
      .url(id)
      .then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id, src]);
  return url;
}

function FigureView({ node, updateAttributes, selected }: NodeViewProps) {
  const a = node.attrs as FigureAttrs;
  const src = safeImageSrc(a.src);
  const url = useImageUrl(src);
  const { deckId } = useDeckContext();
  const [picking, setPicking] = useState(false);

  return (
    <NodeViewWrapper as="figure" className="cl-figure relative" data-drag-handle>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user and stock images of unknown size
        url ? <img src={url} alt={a.alt} referrerPolicy="no-referrer" draggable={false} /> : <div className="cl-figure-pending">Loading image…</div>
      ) : (
        <div className="cl-figure-pending">
          <div className="flex flex-col items-center gap-2">
            <span>{a.query ? `Image: ${a.query}` : "No image yet"}</span>
            <button type="button" className={chip} onClick={() => setPicking(true)}>
              Choose image
            </button>
          </div>
        </div>
      )}
      {a.credit && <figcaption>{a.credit}</figcaption>}
      {src && (
        <div className={`absolute right-2 top-2 flex gap-1 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
          <button type="button" className={chip} onClick={() => setPicking(true)}>
            Replace
          </button>
          <button
            type="button"
            className={chip}
            onClick={() => {
              const next = window.prompt("Alt text (describe the image for screen readers)", a.alt);
              if (next !== null) updateAttributes({ alt: next.slice(0, 300) });
            }}
          >
            Alt text
          </button>
        </div>
      )}
      <ImageDialog
        open={picking}
        deckId={deckId}
        initialQuery={a.query ?? a.alt ?? ""}
        onClose={() => setPicking(false)}
        onPick={(attrs) => {
          updateAttributes(attrs);
          setPicking(false);
        }}
      />
    </NodeViewWrapper>
  );
}

function ChartView({ node, updateAttributes, selected }: NodeViewProps) {
  const parsed = ChartDataSchema.safeParse(node.attrs.data);
  const chart = parsed.success ? normalizeChart(parsed.data) : null;
  const { themeStyle } = useDeckContext();
  const [editing, setEditing] = useState(false);
  return (
    <NodeViewWrapper className="cl-chart relative" data-drag-handle>
      {chart?.title && <p className="cl-chart-title">{chart.title}</p>}
      {chart ? <div className="cl-chart-svg" dangerouslySetInnerHTML={{ __html: renderChartSvg(chart) }} /> : <div className="cl-figure-pending">Invalid chart data</div>}
      <div className={`absolute right-2 top-0 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <button type="button" className={chip} onClick={() => setEditing(true)}>
          Edit chart
        </button>
      </div>
      <ChartDialog
        open={editing}
        initial={chart}
        themeStyle={themeStyle}
        onClose={() => setEditing(false)}
        onSave={(data) => {
          updateAttributes({ data });
          setEditing(false);
        }}
      />
    </NodeViewWrapper>
  );
}

function EmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const url = String(node.attrs.url ?? "");
  const embed = toEmbed(url);
  const link = safeLinkUrl(url);
  const [editing, setEditing] = useState(false);
  return (
    <NodeViewWrapper className="cl-embed relative" data-drag-handle>
      {embed ? (
        <iframe
          src={embed.src}
          title={`${embed.provider} embed`}
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          // Clicks select the block while editing; select it first to interact.
          style={{ pointerEvents: selected ? "auto" : "none" }}
        />
      ) : (
        <p className="cl-embed-link">{link ?? "Invalid link"}</p>
      )}
      <div className={`absolute right-2 top-2 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <button type="button" className={chip} onClick={() => setEditing(true)}>
          Edit link
        </button>
      </div>
      <EmbedDialog
        open={editing}
        initial={url}
        onClose={() => setEditing(false)}
        onSave={(next) => {
          updateAttributes({ url: next });
          setEditing(false);
        }}
      />
    </NodeViewWrapper>
  );
}

export const editorExtensions = [
  ...cardExtensions.filter((e) => !["figure", "chart", "embed"].includes(e.name)),
  Figure.extend({ addNodeView: () => ReactNodeViewRenderer(FigureView) }),
  Chart.extend({ addNodeView: () => ReactNodeViewRenderer(ChartView) }),
  Embed.extend({ addNodeView: () => ReactNodeViewRenderer(EmbedView) }),
];
