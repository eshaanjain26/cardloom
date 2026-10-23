import { parseChartAttr } from "../editor/nodes";
import { browserAssetStore } from "./assets";
import { renderChartSvg } from "./chart";

// Static card HTML (present mode, thumbnails) carries chart data and asset ids;
// this fills in the SVGs and the stored image URLs once the HTML is on screen.
export function hydrateMedia(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-cl-chart]").forEach((el) => {
    const target = el.querySelector<HTMLElement>(".cl-chart-svg");
    const chart = parseChartAttr(el.getAttribute("data-cl-chart"));
    if (target && chart && !target.firstChild) target.innerHTML = renderChartSvg(chart);
  });
  root.querySelectorAll<HTMLImageElement>("img[data-asset-id]").forEach((img) => {
    if (img.src) return;
    void browserAssetStore()
      .url(img.dataset.assetId!)
      .then((url) => {
        if (url) img.src = url;
        else img.alt = img.alt || "Image not available in this browser";
      });
  });
}
