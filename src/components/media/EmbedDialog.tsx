"use client";

import { useEffect, useState } from "react";
import { EMBED_PROVIDERS, safeLinkUrl, toEmbed } from "@/lib/media/embeds";
import { field, Modal, primaryBtn } from "./Modal";

type Props = { open: boolean; initial?: string; onClose: () => void; onSave: (url: string) => void };

export function EmbedDialog({ open, initial = "", onClose, onSave }: Props) {
  const [url, setUrl] = useState(initial);
  useEffect(() => {
    if (open) setUrl(initial);
  }, [open, initial]);
  const embed = toEmbed(url);
  const link = safeLinkUrl(url);

  return (
    <Modal open={open} title="Embed" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (link) onSave(url.trim());
        }}
      >
        <input aria-label="Link to embed" className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        <p className="text-sm text-neutral-600">
          {embed
            ? `Plays inline as a ${embed.provider} embed.`
            : link
              ? "Not an embeddable site, so it will show as a link."
              : `Supported: ${EMBED_PROVIDERS.join(", ")}. Other https links show as a link.`}
        </p>
        <button type="submit" className={`${primaryBtn} w-fit`} disabled={!link}>
          {initial ? "Save" : "Embed"}
        </button>
      </form>
    </Modal>
  );
}
