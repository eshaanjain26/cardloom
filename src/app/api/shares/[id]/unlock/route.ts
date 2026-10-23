import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { accessCookie, allowAttempt, errorResponse, readJsonBody, shareStore } from "@/lib/share/server";
import { ShareError } from "@/lib/share/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!allowAttempt(`${id}:${client}`)) throw new ShareError(429, "Too many attempts. Try again in 10 minutes.");
    const body = z.object({ password: z.string().max(200) }).safeParse(await readJsonBody(request, 1000));
    if (!body.success) throw new ShareError(400, "Enter the password.");
    const store = await shareStore();
    if (!(await store.checkPassword(id, body.data.password))) throw new ShareError(403, "Wrong password.");
    const res = new NextResponse(null, { status: 204 });
    res.cookies.set(accessCookie(id), (await store.accessToken(id))!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && !request.url.startsWith("http://localhost"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
