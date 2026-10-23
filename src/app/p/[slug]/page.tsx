import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeckViewer } from "@/components/share/DeckViewer";
import { presentSequence } from "@/lib/deck/ops";
import type { Deck } from "@/lib/deck/schema";
import { deckForViewer, shareStore } from "@/lib/share/server";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const store = await shareStore();
  const share = await store.getBySlug(slug).catch(() => null);
  if (!share || share.kind !== "site" || store.isExpired(share)) return null;
  return share;
}

function description(deck: Deck): string {
  const texts: string[] = [];
  const walk = (n: unknown) => {
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "heading") return;
    if (typeof node.text === "string") texts.push(node.text);
    node.content?.forEach(walk);
  };
  for (const { card } of presentSequence(deck)) {
    walk(card.content);
    if (texts.join(" ").length > 160) break;
  }
  return texts.join(" ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const share = await load((await params).slug);
  if (!share) return { title: "Not found" };
  const desc = description(share.deck);
  return {
    title: share.deck.title,
    description: desc,
    openGraph: { title: share.deck.title, description: desc, type: "website" },
    twitter: { card: "summary", title: share.deck.title, description: desc },
  };
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const share = await load((await params).slug);
  if (!share) notFound();
  return <DeckViewer deck={deckForViewer(share)} shareId={share.id} kind="site" />;
}
