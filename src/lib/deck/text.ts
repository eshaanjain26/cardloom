import type { Card } from "./schema";

export function cardLabel(card: Card): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (parts.join(" ").length > 60 || !node || typeof node !== "object") return;
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(card.content);
  const label = parts.join(" ").replace(/\s+/g, " ").trim();
  return label ? label.slice(0, 60) : "Untitled card";
}
