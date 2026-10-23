import { NextResponse } from "next/server";
import { errorResponse, ownerToken, shareStore } from "@/lib/share/server";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await (await shareStore()).stats(id, ownerToken(request)), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
