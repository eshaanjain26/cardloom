import { NextResponse } from "next/server";
import { searchStock } from "@/lib/media/stock";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const page = Math.min(20, Math.max(1, Number(params.get("page")) || 1));
  const size = Math.min(20, Math.max(1, Number(params.get("size")) || 20));
  if (!q) return NextResponse.json({ error: "Enter a search term" }, { status: 400 });
  try {
    return NextResponse.json({ images: await searchStock(q, page, fetch, size) });
  } catch (err) {
    console.error("[images:search]", err);
    return NextResponse.json({ error: "Openverse did not answer in time. Try again in a moment." }, { status: 502 });
  }
}
