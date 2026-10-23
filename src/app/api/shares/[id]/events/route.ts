import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { accessCookie, errorResponse, readJsonBody, shareStore } from "@/lib/share/server";
import { ShareError } from "@/lib/share/store";

export const runtime = "nodejs";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), visitor: z.string().min(8).max(64) }),
  z.object({ type: z.literal("dwell"), visitor: z.string().min(8).max(64), cardId: z.string().max(100), ms: z.number().int().min(0) }),
]);

// Anonymous view analytics: a random per-browser id (hashed with the server
// secret before storage), view counts, and time per card. No IPs are stored.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = z.array(Event).max(50).safeParse(await readJsonBody(request, 20_000));
    if (!parsed.success) throw new ShareError(400, "Invalid events.");
    const store = await shareStore();
    const share = await store.get(id);
    if (store.isExpired(share)) throw new ShareError(410, "This link has expired.");
    if (!(await store.canView(id, (await cookies()).get(accessCookie(id))?.value))) throw new ShareError(401, "Password required.");
    for (const event of parsed.data) await store.recordEvent(id, event);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
