import { describe, expect, it, vi } from "vitest";
import { searchStock } from "./stock";

const result = (over: Record<string, unknown> = {}) => ({
  id: "56e0",
  title: "Joe's DIY Solar Panel Install",
  url: "https://live.staticflickr.com/2491/x.jpg",
  thumbnail: "https://api.openverse.org/v1/images/56e0/thumb/?format=json",
  creator: "Dave Dugdale",
  license: "by-sa",
  license_version: "2.0",
  foreign_landing_url: "https://www.flickr.com/photos/1/2",
  width: 500,
  height: 375,
  mature: false,
  ...over,
});

describe("searchStock", () => {
  it("queries Openverse and builds credits", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: [result()] })));
    const [img] = await searchStock("solar panels", 2, fetchMock);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.openverse.org/v1/images/?q=solar+panels&page=2&page_size=20&mature=false");
    expect(img).toEqual({
      id: "56e0",
      url: "https://live.staticflickr.com/2491/x.jpg",
      thumb: "https://api.openverse.org/v1/images/56e0/thumb/",
      width: 500,
      height: 375,
      alt: "Joe's DIY Solar Panel Install",
      credit: '"Joe\'s DIY Solar Panel Install" by Dave Dugdale, CC BY-SA 2.0',
      creditUrl: "https://www.flickr.com/photos/1/2",
    });
  });

  it("drops non-https and mature results and handles public domain", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            results: [result({ url: "http://insecure/x.jpg" }), result({ mature: true }), result({ license: "cc0", creator: null, title: null })],
          }),
        ),
    );
    const imgs = await searchStock("x", 1, fetchMock);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].credit).toBe("Photo, CC0");
  });

  it("can ask for fewer results", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: [] })));
    await searchStock("x", 1, fetchMock, 5);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page_size=5");
  });

  it("throws on API errors", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("busy", { status: 429 }));
    await expect(searchStock("x", 1, fetchMock)).rejects.toThrow("429");
  });
});
