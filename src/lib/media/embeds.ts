export type Embed = { src: string; provider: string };

const ID = /^[A-Za-z0-9_-]+$/;

// Only these hosts become iframes. Anything else renders as a plain link, so a
// pasted URL can never load an arbitrary page inside a deck.
export function toEmbed(raw: string): Embed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.pathname === "/watch" ? url.searchParams.get("v") : parts[0] === "shorts" || parts[0] === "embed" ? parts[1] : null;
    return id && ID.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}`, provider: "YouTube" } : null;
  }
  if (host === "youtu.be") {
    return parts[0] && ID.test(parts[0]) ? { src: `https://www.youtube-nocookie.com/embed/${parts[0]}`, provider: "YouTube" } : null;
  }
  if (host === "vimeo.com" && parts[0] && /^\d+$/.test(parts[0])) {
    return { src: `https://player.vimeo.com/video/${parts[0]}`, provider: "Vimeo" };
  }
  if (host === "loom.com" && parts[0] === "share" && parts[1] && ID.test(parts[1])) {
    return { src: `https://www.loom.com/embed/${parts[1]}`, provider: "Loom" };
  }
  if (host === "figma.com" && ["file", "design", "proto", "board"].includes(parts[0] ?? "") && parts[1] && ID.test(parts[1])) {
    return { src: `https://www.figma.com/embed?embed_host=cardloom&url=${encodeURIComponent(url.toString())}`, provider: "Figma" };
  }
  if (host === "docs.google.com" && parts[0] === "presentation" && parts[1] === "d" && parts[2] && ID.test(parts[2])) {
    return { src: `https://docs.google.com/presentation/d/${parts[2]}/embed`, provider: "Google Slides" };
  }
  if (host === "codepen.io" && parts[1] === "pen" && parts[0] && parts[2] && ID.test(parts[0]) && ID.test(parts[2])) {
    return { src: `https://codepen.io/${parts[0]}/embed/${parts[2]}?default-tab=result`, provider: "CodePen" };
  }
  if (host === "open.spotify.com" && ["track", "album", "playlist", "episode", "show"].includes(parts[0] ?? "") && parts[1] && ID.test(parts[1])) {
    return { src: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`, provider: "Spotify" };
  }
  return null;
}

export const EMBED_PROVIDERS = ["YouTube", "Vimeo", "Loom", "Figma", "Google Slides", "CodePen", "Spotify"];

export function safeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const ASSET = /^asset:[0-9a-f-]{36}$/;
// Remote images routed through this server's image proxy, used by PNG export.
const PROXIED = /^\/api\/image-proxy\?url=https%3A%2F%2F[^\s"'<>]+$/;
const SHARED_ASSET = /^\/api\/shares\/[A-Za-z0-9_-]{12}\/assets\/[0-9a-f-]{36}$/;

// Images may come from https URLs, this browser's asset store, or a published
// share's uploaded copies on this server.
export function safeImageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (ASSET.test(raw) || SHARED_ASSET.test(raw) || PROXIED.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const assetId = (src: string | null) => (src && src.startsWith("asset:") ? src.slice(6) : null);
