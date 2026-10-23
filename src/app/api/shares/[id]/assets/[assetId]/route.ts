import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookie, errorResponse, ownerToken, shareStore } from "@/lib/share/server";
import { MAX_ASSET_BYTES, ShareError } from "@/lib/share/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id, assetId } = await params;
    if (Number(request.headers.get("content-length") ?? 0) > MAX_ASSET_BYTES) throw new ShareError(413, "Each image must be under 5 MB.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    await (await shareStore()).putAsset(id, ownerToken(request), assetId, bytes);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, assetId } = await params;
    const store = await shareStore();
    const share = await store.get(id);
    if (store.isExpired(share)) throw new ShareError(410, "This link has expired.");
    if (!(await store.canView(id, (await cookies()).get(accessCookie(id))?.value))) throw new ShareError(401, "Password required.");
    const asset = await store.getAsset(id, assetId);
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: {
        "content-type": asset.mime,
        "cache-control": share.hasPassword ? "private, max-age=300" : "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
