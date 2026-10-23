"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UnlockForm({ id }: { id: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 font-sans">
      <h1 className="text-2xl font-semibold">This deck is password protected</h1>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/shares/${id}/unlock`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
          });
          setBusy(false);
          if (res.ok) router.refresh();
          else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not unlock.");
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !password} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Checking…" : "View deck"}
        </button>
      </form>
    </main>
  );
}
