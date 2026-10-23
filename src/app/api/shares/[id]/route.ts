import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { errorResponse, ownerToken, readJsonBody, shareStore } from "@/lib/share/server";
import { MAX_DECK_BYTES, ShareError } from "@/lib/share/store";

export const runtime = "nodejs";

const Body = z.object({
  deck: z.unknown().optional(),
  slug: z.string().max(48).nullish(),
  password: z.string().min(4).max(200).nullish(),
  expiresAt: z.string().nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await readJsonBody(request, MAX_DECK_BYTES + 10_000));
    if (!parsed.success) throw new ShareError(400, z.prettifyError(parsed.error));
    const share = await (await shareStore()).update(id, ownerToken(request), parsed.data);
    return NextResponse.json({ id: share.id, slug: share.slug, expiresAt: share.expiresAt, hasPassword: share.hasPassword });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await (await shareStore()).remove(id, ownerToken(request));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
