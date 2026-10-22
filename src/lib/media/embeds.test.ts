import { describe, expect, it } from "vitest";
import { assetId, safeImageSrc, safeLinkUrl, toEmbed } from "./embeds";

describe("toEmbed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=3", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/abc_DEF-1", "https://www.youtube-nocookie.com/embed/abc_DEF-1"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://www.loom.com/share/0123abcd", "https://www.loom.com/embed/0123abcd"],
    ["https://docs.google.com/presentation/d/1AbC_d/edit#slide=1", "https://docs.google.com/presentation/d/1AbC_d/embed"],
    ["https://codepen.io/someone/pen/xyzAB", "https://codepen.io/someone/embed/xyzAB?default-tab=result"],
    ["https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk", "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk"],
  ])("embeds %s", (url, src) => {
    expect(toEmbed(url)?.src).toBe(src);
  });

  it("wraps Figma links in the official embed URL", () => {
    expect(toEmbed("https://www.figma.com/design/AbC123/My-File")?.src).toBe(
      "https://www.figma.com/embed?embed_host=cardloom&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbC123%2FMy-File",
    );
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example/watch?v=x",
    "https://youtube.com.evil.example/watch?v=x",
    "https://www.youtube.com/watch?v=<script>",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (url) => {
    expect(toEmbed(url)).toBeNull();
  });
});

describe("url safety", () => {
  it("allows https and asset images only", () => {
    expect(safeImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(safeImageSrc("asset:0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("asset:0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(safeImageSrc("http://example.com/a.png")).toBeNull();
    expect(safeImageSrc("data:image/png;base64,AAA")).toBeNull();
    expect(safeImageSrc("asset:../../etc")).toBeNull();
    expect(safeImageSrc(42)).toBeNull();
    expect(assetId("asset:0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  });

  it("allows only http(s) links", () => {
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("https://ok.example/x")).toBe("https://ok.example/x");
  });
});
