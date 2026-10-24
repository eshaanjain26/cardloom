import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { checkHost, fetchPublicImage, httpsGetPinned, isPrivateAddress, pinnedLookup, type PinnedGet } from "./proxy";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PUBLIC = "93.184.216.34";
const publicLookup = async () => [{ address: PUBLIC, family: 4 }];
const ok: PinnedGet = async () => ({ status: 200, location: null, body: PNG });

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("checkHost", () => {
  it("returns the address to pin, with its family", async () => {
    expect(await checkHost("img.example", publicLookup)).toEqual({ address: PUBLIC, family: 4 });
    expect(await checkHost("2606:4700::1111", publicLookup)).toEqual({ address: "2606:4700::1111", family: 6 });
  });

  it("rejects a host if any of its addresses is private", async () => {
    await expect(checkHost("mixed.example", async () => [{ address: PUBLIC }, { address: "10.0.0.1" }])).rejects.toThrow("not allowed");
    await expect(checkHost("empty.example", async () => [])).rejects.toThrow("not allowed");
  });
});

describe("pinnedLookup", () => {
  it("answers both dns.lookup call forms with the pinned address", () => {
    const lookup = pinnedLookup({ address: PUBLIC, family: 4 });
    const single = vi.fn();
    lookup("anything.example", {}, single);
    expect(single).toHaveBeenCalledWith(null, PUBLIC, 4);
    const many = vi.fn();
    lookup("anything.example", { all: true }, many);
    expect(many).toHaveBeenCalledWith(null, [{ address: PUBLIC, family: 4 }]);
  });
});

describe("fetchPublicImage", () => {
  it("returns verified image bytes", async () => {
    expect(await fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, get: ok })).toMatchObject({ mime: "image/png" });
  });

  it("connects to the address it checked, even if DNS answers differently later", async () => {
    // A rebinding DNS server: public on the first answer, loopback afterwards.
    let answers = 0;
    const lookup = vi.fn(async () => (answers++ === 0 ? [{ address: PUBLIC, family: 4 }] : [{ address: "127.0.0.1", family: 4 }]));
    const get = vi.fn<PinnedGet>(ok);
    await fetchPublicImage("https://rebind.example/a.png", { lookup, get });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(new URL("https://rebind.example/a.png"), { address: PUBLIC, family: 4 }, expect.any(Number));
  });

  it("refuses http, private hosts, and private IP literals without connecting", async () => {
    const get = vi.fn<PinnedGet>(ok);
    await expect(fetchPublicImage("http://img.example/a.png", { lookup: publicLookup, get })).rejects.toThrow("https");
    await expect(fetchPublicImage("https://internal.example/a.png", { lookup: async () => [{ address: "10.0.0.5" }], get })).rejects.toThrow("not allowed");
    await expect(fetchPublicImage("https://[::1]/a.png", { lookup: publicLookup, get })).rejects.toThrow("not allowed");
    await expect(fetchPublicImage("https://169.254.169.254/latest", { lookup: publicLookup, get })).rejects.toThrow("not allowed");
    expect(get).not.toHaveBeenCalled();
  });

  it("re-checks and re-pins every redirect hop", async () => {
    const get = vi.fn<PinnedGet>(async () => ({ status: 302, location: "https://127.0.0.1/secret", body: new Uint8Array() }));
    await expect(fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, get })).rejects.toThrow("not allowed");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("rejects non-images and failed responses", async () => {
    await expect(
      fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, get: async () => ({ status: 200, location: null, body: new TextEncoder().encode("<html>") }) }),
    ).rejects.toThrow("Not a supported image");
    await expect(
      fetchPublicImage("https://img.example/a.png", { lookup: publicLookup, get: async () => ({ status: 404, location: null, body: new Uint8Array() }) }),
    ).rejects.toThrow("404");
  });
});

describe("httpsGetPinned", () => {
  it("opens the socket to the pinned address without resolving the hostname, and sends the hostname for TLS", async () => {
    let hello = "";
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        hello = chunk.toString("latin1");
        socket.destroy();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      // ".invalid" can never resolve, so reaching the server proves no DNS lookup happened.
      await expect(httpsGetPinned(new URL(`https://rebind.invalid:${port}/a.png`), { address: "127.0.0.1", family: 4 }, 1000)).rejects.toThrow();
      expect(hello).toContain("rebind.invalid");
    } finally {
      server.close();
    }
  });
});
