import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Lists models installed on the Ollama server this deployment is configured
// for. The base URL comes from the environment only, never from the client.
export async function GET() {
  const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `Ollama returned ${res.status}` }, { status: 502 });
    const body = (await res.json()) as { models?: { name: string }[] };
    return NextResponse.json({ models: (body.models ?? []).map((m) => m.name) });
  } catch {
    return NextResponse.json({ error: `Ollama is not reachable at ${base}` }, { status: 502 });
  }
}
