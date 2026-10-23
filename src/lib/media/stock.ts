import { z } from "zod/v4";

export type StockImage = {
  id: string;
  url: string;
  thumb: string;
  width: number | null;
  height: number | null;
  alt: string;
  credit: string;
  creditUrl: string | null;
};

const OpenverseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      url: z.string(),
      thumbnail: z.string().nullish(),
      creator: z.string().nullish(),
      license: z.string(),
      license_version: z.string().nullish(),
      foreign_landing_url: z.string().nullish(),
      width: z.number().nullish(),
      height: z.number().nullish(),
      mature: z.boolean().nullish(),
    }),
  ),
});

const LICENSES: Record<string, string> = {
  by: "CC BY",
  "by-sa": "CC BY-SA",
  "by-nd": "CC BY-ND",
  "by-nc": "CC BY-NC",
  "by-nc-sa": "CC BY-NC-SA",
  "by-nc-nd": "CC BY-NC-ND",
  cc0: "CC0",
  pdm: "Public domain",
};

const https = (u: string | null | undefined) => (u && u.startsWith("https://") ? u : null);

// Openverse indexes openly licensed images and needs no API key.
export async function searchStock(query: string, page: number, doFetch: typeof fetch = fetch, pageSize = 20): Promise<StockImage[]> {
  const params = new URLSearchParams({ q: query, page: String(page), page_size: String(pageSize), mature: "false" });
  const res = await doFetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "user-agent": "Cardloom (https://github.com/eshaanjain26/cardloom)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Image search failed (${res.status})`);
  const body = OpenverseSchema.parse(await res.json());
  return body.results.flatMap((r) => {
    const url = https(r.url);
    if (!url || r.mature) return [];
    const license = LICENSES[r.license] ?? r.license.toUpperCase();
    const version = r.license_version && !["cc0", "pdm"].includes(r.license) ? ` ${r.license_version}` : "";
    const who = r.creator ? ` by ${r.creator}` : "";
    return [
      {
        id: r.id,
        url,
        // The thumbnail endpoint returns the image itself without the format parameter.
        thumb: https(r.thumbnail?.split("?")[0]) ?? url,
        width: r.width ?? null,
        height: r.height ?? null,
        alt: (r.title ?? "").slice(0, 200),
        credit: `${r.title ? `"${r.title.slice(0, 80)}"` : "Photo"}${who}, ${license}${version}`,
        creditUrl: https(r.foreign_landing_url),
      },
    ];
  });
}
