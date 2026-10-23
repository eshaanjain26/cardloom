import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DeckViewer } from "@/components/share/DeckViewer";
import { UnlockForm } from "@/components/share/UnlockForm";
import { accessCookie, deckForViewer, shareStore } from "@/lib/share/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await shareStore();
  const share = await store.get(id).catch(() => null);
  if (!share || share.kind !== "link") notFound();
  if (store.isExpired(share)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 px-4 text-center font-sans">
        <h1 className="text-2xl font-semibold">This link has expired</h1>
        <p className="text-neutral-500">Ask the person who shared it for a new link.</p>
      </main>
    );
  }
  if (!(await store.canView(id, (await cookies()).get(accessCookie(id))?.value))) return <UnlockForm id={id} />;
  return <DeckViewer deck={deckForViewer(share)} shareId={id} kind="link" />;
}
