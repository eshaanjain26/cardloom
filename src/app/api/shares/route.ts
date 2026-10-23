import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { errorResponse, readJsonBody, shareStore } from "@/lib/share/server";
import { MAX_DECK_BYTES, SHARE_KINDS, ShareError } from "@/lib/share/store";

export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(SHARE_KINDS),
  deck: z.unknown(),
  slug: z.string().max(48).nullish(),
  password: z.string().min(4).max(200).nullish(),
  expiresAt: z.string().nullish(),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await readJsonBody(request, MAX_DECK_BYTES + 10_000));
    if (!parsed.success) throw new ShareError(400, z.prettifyError(parsed.error));
    const { share, ownerToken } = await (await shareStore()).create(parsed.data);
    return NextResponse.json({ id: share.id, slug: share.slug, ownerToken, expiresAt: share.expiresAt, hasPassword: share.hasPassword }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
