import { describe, expect, it, vi } from "vitest";
import { fetchPublicImage, isPrivateAddress } from "./proxy";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const publicLookup = async () => [{ address: "93.184.216.34" }];

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("fetchPublicImage", () => {
  it("returns verified image bytes", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(PNG));
    expect(await fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, fetch: fetchMock })).toMatchObject({ mime: "image/png" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses http, private hosts, and private IP literals", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(fetchPublicImage("http://img.example/a.png", { lookup: publicLookup, fetch: fetchMock })).rejects.toThrow("https");
    await expect(fetchPublicImage("https://internal.example/a.png", { lookup: async () => [{ address: "10.0.0.5" }], fetch: fetchMock })).rejects.toThrow("not allowed");
    await expect(fetchPublicImage("https://[::1]/a.png", { lookup: publicLookup, fetch: fetchMock })).rejects.toThrow("not allowed");
    await expect(fetchPublicImage("https://169.254.169.254/latest", { lookup: publicLookup, fetch: fetchMock })).rejects.toThrow("not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks redirects", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }));
    await expect(fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, fetch: fetchMock })).rejects.toThrow("not allowed");
  });

  it("rejects non-images", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("<html>hi</html>"));
    await expect(fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, fetch: fetchMock })).rejects.toThrow("Not a supported image");
  });
});
