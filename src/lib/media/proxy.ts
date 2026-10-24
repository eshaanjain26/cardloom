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

export type Pinned = { address: string; family: 4 | 6 };

export type PinnedResponse = { status: number; location: string | null; body: Uint8Array };

// Performs one GET to `url` over a connection to exactly `pinned`. The
// hostname still drives TLS certificate checks (SNI) and the Host header.
export type PinnedGet = (url: URL, pinned: Pinned, maxBytes: number) => Promise<PinnedResponse>;

type Deps = {
  lookup: (host: string) => Promise<{ address: string; family?: number }[]>;
  get?: PinnedGet;
};

// A dns.lookup replacement that always answers with the address that already
// passed the private-range check, so the socket cannot be rebound to another.
export function pinnedLookup(pinned: Pinned) {
  return (_host: string, opts: { all?: boolean } | number | undefined, cb: (...args: unknown[]) => void) => {
    if (typeof opts === "object" && opts?.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
    else cb(null, pinned.address, pinned.family);
  };
}

export const httpsGetPinned: PinnedGet = async (url, pinned, maxBytes) => {
  const https = await import("node:https");
  return new Promise<PinnedResponse>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup(pinned) as never,
        servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
        headers: { "user-agent": "Cardloom image proxy", accept: "image/*" },
        timeout: 10_000,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, body: new Uint8Array() });
          return;
        }
        if (Number(res.headers["content-length"] ?? 0) > maxBytes) {
          req.destroy(new Error("Image is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) req.destroy(new Error("Image is too large"));
          else chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location, body: new Uint8Array(Buffer.concat(chunks)) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Image fetch timed out")));
    req.on("error", reject);
    req.end();
  });
};

// Resolves once, rejects the host if any of its addresses is private, and
// returns the address the connection must use.
export async function checkHost(host: string, lookup: Deps["lookup"]): Promise<Pinned> {
  const literal = isIP(host);
  const addresses = literal ? [{ address: host, family: literal }] : await lookup(host);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not allowed");
  const first = addresses[0];
  return { address: first.address, family: (first.family ?? isIP(first.address)) === 6 ? 6 : 4 };
}

// Fetches a public https image, re-checking every redirect hop, and confirms
// the bytes really are an image before returning them.
export async function fetchPublicImage(raw: string, deps: Deps): Promise<{ bytes: Uint8Array; mime: string }> {
  const get = deps.get ?? httpsGetPinned;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new Error("Only https images can be fetched");
    if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
    const pinned = await checkHost(url.hostname.replace(/^\[|\]$/g, ""), deps.lookup);
    const res = await get(url, pinned, MAX_PROXY_BYTES);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error("Redirect without a location");
      url = new URL(res.location, url);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`Image fetch failed (${res.status})`);
    const mime = sniffImage(res.body);
    if (!mime) throw new Error("Not a supported image");
    return { bytes: res.body, mime };
  }
  throw new Error("Too many redirects");
}
