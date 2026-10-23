import JSZip from "jszip";
import { emptyCard, newId, presentSequence } from "../deck/ops";
import type { Deck } from "../deck/schema";
import { browserAssetStore } from "../media/assets";
import { storeImage } from "../media/client";
import { assetId } from "../media/embeds";
import { sniffImage } from "../share/sniff";
import { deckToMarkdown, markdownToDeck } from "./markdown";
import { pageToContent, type PdfTextItem } from "./pdf-text";
import { pptxToDeck } from "./pptx-import";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileBase(title: string) {
  return title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "deck";
}

export function exportMarkdown(deck: Deck) {
  download(new Blob([deckToMarkdown(deck)], { type: "text/markdown" }), `${fileBase(deck.title)}.md`);
}

// Same-origin URL for any image a card can show; remote images go through the
// proxy because most hosts block cross-origin reads.
export function fetchableImageUrl(src: string): string {
  return src.startsWith("https://") ? `/api/image-proxy?url=${encodeURIComponent(src)}` : src;
}

async function imageBlob(src: string): Promise<Blob | null> {
  const id = assetId(src);
  if (id) return browserAssetStore().get(id);
  const res = await fetch(fetchableImageUrl(src));
  return res.ok ? res.blob() : null;
}

// PowerPoint versions differ on WebP support, so slides get PNG.
async function toPngDataUrl(blob: Blob, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export async function exportPptx(deck: Deck): Promise<{ skippedImages: number }> {
  const { deckToPptx } = await import("./pptx-export");
  const { pptx, skippedImages } = await deckToPptx(deck, async (src) => {
    const blob = await imageBlob(src);
    return blob ? (await toPngDataUrl(blob)).replace(/^data:/, "") : null;
  });
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  download(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), `${fileBase(deck.title)}.pptx`);
  return { skippedImages };
}

export async function exportPngs(deck: Deck, renderCard: (cardId: string) => Promise<Blob | null>): Promise<{ failed: number }> {
  const steps = presentSequence(deck);
  const base = fileBase(deck.title);
  let failed = 0;
  if (steps.length === 1) {
    const png = await renderCard(steps[0].card.id);
    if (png) download(png, `${base}.png`);
    return { failed: png ? 0 : 1 };
  }
  const zip = new JSZip();
  for (const [i, { card }] of steps.entries()) {
    const png = await renderCard(card.id).catch(() => null);
    if (png) zip.file(`${base}-${String(i + 1).padStart(2, "0")}.png`, png);
    else failed++;
  }
  download(await zip.generateAsync({ type: "blob" }), `${base}-png.zip`);
  return { failed };
}

async function storeImageBytes(bytes: Uint8Array): Promise<string | null> {
  const mime = sniffImage(bytes);
  if (!mime) return null;
  return storeImage(new Blob([bytes as BlobPart], { type: mime }));
}

async function pdfToDeck(data: ArrayBuffer, now: string, title: string): Promise<{ deck: Deck; warnings: string[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data }).promise;
  const warnings: string[] = [];
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  if (doc.numPages > MAX_PDF_PAGES) warnings.push(`Only the first ${MAX_PDF_PAGES} of ${doc.numPages} pages were imported.`);

  const cards: Deck["cards"] = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    const text = await page.getTextContent();
    const items: PdfTextItem[] = text.items.flatMap((it) =>
      "str" in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], height: Math.abs(it.transform[3]) || it.height }] : [],
    );
    let content: unknown[] = pageToContent(items, n === 1 ? 1 : 2);
    if (!content.length) {
      // No text layer (a scan or a picture slide): keep the page as an image.
      const viewport = page.getViewport({ scale: 1600 / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
      const src = blob ? await storeImage(blob) : null;
      if (src) content = [{ type: "figure", attrs: { src, alt: `Page ${n}`, credit: "", creditUrl: null, query: null } }];
      else warnings.push(`Page ${n} could not be imported.`);
    }
    if (content.length) {
      cards.push({ ...emptyCard(n === 1 ? "title" : "blank"), content: { type: "doc", content: content as Deck["cards"][number]["content"]["content"] } });
    }
  }
  const fallback = markdownToDeck("", now, title);
  const first = cards[0]?.content.content?.[0] as { type?: string; content?: { text?: string }[] } | undefined;
  const heading = first?.type === "heading" ? (first.content ?? []).map((t) => t.text ?? "").join("") : "";
  return {
    deck: { ...fallback, id: newId(), title: (heading || title).slice(0, 200), cards: cards.length ? cards : fallback.cards },
    warnings,
  };
}

export async function importFile(file: File): Promise<{ deck: Deck; warnings: string[] }> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Files must be under 50 MB.");
  const now = new Date().toISOString();
  const title = file.name.replace(/\.[^.]+$/, "");
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "md" || ext === "markdown" || ext === "txt") return { deck: markdownToDeck(await file.text(), now, title), warnings: [] };
  if (ext === "pptx") {
    const { deck, skippedImages } = await pptxToDeck(await file.arrayBuffer(), {
      parse: (xml) => new DOMParser().parseFromString(xml, "application/xml"),
      storeImage: (bytes) => storeImageBytes(bytes),
      now,
      fallbackTitle: title,
    });
    return { deck, warnings: skippedImages ? [`${skippedImages} image(s) in unsupported formats were skipped.`] : [] };
  }
  if (ext === "pdf") return pdfToDeck(await file.arrayBuffer(), now, title);
  throw new Error("Import .md, .txt, .pptx, or .pdf files.");
}
