import { NextResponse } from "next/server";
import { handleAiTask } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const res = await handleAiTask(task, body, { env: process.env });
  return NextResponse.json(res.body, { status: res.status, headers: { "cache-control": "no-store" } });
}
