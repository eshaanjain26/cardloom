import { lookup } from "node:dns/promises";
import { NextResponse } from "next/server";
import { fetchPublicImage } from "@/lib/media/proxy";

export const runtime = "nodejs";

// Lets exports (PPTX, PNG) include remote photos whose hosts block
// cross-origin reads. Public https images only.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  try {
    const img = await fetchPublicImage(url, { lookup: (h) => lookup(h, { all: true }) });
    return new NextResponse(new Uint8Array(img.bytes), {
      headers: { "content-type": img.mime, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 400 });
  }
}
