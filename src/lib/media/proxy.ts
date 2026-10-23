import { isIP } from "node:net";
import { sniffImage } from "../share/sniff";

export const MAX_PROXY_BYTES = 10_000_000;

// True for addresses a server-side fetch must never reach: loopback, private,
// link-local, carrier-grade NAT, multicast, and their IPv6 equivalents.
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

type Deps = {
  lookup: (host: string) => Promise<{ address: string }[]>;
  fetch: typeof fetch;
};

// Fetches a public https image, re-checking every redirect hop, and confirms
// the bytes really are an image before returning them.
export async function fetchPublicImage(raw: string, deps: Deps): Promise<{ bytes: Uint8Array; mime: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new Error("Only https images can be fetched");
    if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host }] : await deps.lookup(host);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not allowed");
    const res = await deps.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("Redirect without a location");
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_PROXY_BYTES) throw new Error("Image is too large");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_PROXY_BYTES) throw new Error("Image is too large");
    const mime = sniffImage(bytes);
    if (!mime) throw new Error("Not a supported image");
    return { bytes, mime };
  }
  throw new Error("Too many redirects");
}
