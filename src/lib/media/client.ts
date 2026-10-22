import { browserAiStore, callAi } from "../ai/client";
import { imageConfig } from "../ai/settings";
import { browserAssetStore } from "./assets";
import { firstResult, queryFallbacks, type ImageSource } from "./resolve";
import type { StockImage } from "./stock";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Re-encodes images to WebP at most 1600px wide so IndexedDB stays small.
export async function downscale(blob: Blob, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  return out ?? blob;
}

export async function storeImage(blob: Blob): Promise<string> {
  if (!blob.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Images must be under 15 MB.");
  const id = await browserAssetStore().put(await downscale(blob));
  return `asset:${id}`;
}

export async function searchStockImages(q: string, page = 1, size = 20): Promise<StockImage[]> {
  const res = await fetch(`/api/images/search?${new URLSearchParams({ q, page: String(page), size: String(size) })}`);
  const body = (await res.json().catch(() => ({}))) as { images?: StockImage[]; error?: string };
  if (!res.ok || !body.images) throw new Error(body.error ?? "Image search failed");
  return body.images;
}

export async function generateAiImage(prompt: string, deckId: string | null): Promise<string> {
  const res = await callAi<{ b64: string; mime: string }>(
    "image",
    { prompt, size: "1536x1024" },
    deckId,
    imageConfig(browserAiStore().settings()),
  );
  const bytes = Uint8Array.from(atob(res.data.b64), (c) => c.charCodeAt(0));
  const id = await browserAssetStore().put(new Blob([bytes], { type: res.data.mime }));
  return `asset:${id}`;
}

export function hasImageKey(): boolean {
  return Boolean(browserAiStore().settings().keys.openai?.trim());
}

export function imageSourceFor(mode: "stock" | "ai", deckId: string | null): ImageSource {
  if (mode === "ai") return async (p) => ({ src: await generateAiImage(p.query, deckId), credit: "", creditUrl: null, alt: p.alt || p.query });
  return async (p) => {
    const first = await firstResult(queryFallbacks(p.query), (q) => searchStockImages(q, 1, 5));
    return first ? { src: first.url, credit: first.credit, creditUrl: first.creditUrl, alt: first.alt } : null;
  };
}
