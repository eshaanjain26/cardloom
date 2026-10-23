import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html";
import { cardExtensions } from "./extensions";

const doc = (...content: object[]) => ({ type: "doc", content });
const chart = { type: "bar", title: "Visits", labels: ["Q1", "Q2"], series: [{ name: "Elm", values: [1, 2] }] };

describe("media nodes", () => {
  it("renders a remote image with a linked credit", () => {
    const html = generateHTML(
      doc({ type: "figure", attrs: { src: "https://img.example/a.jpg", alt: "Panels", credit: "by Dave, CC BY", creditUrl: "https://flickr.com/x" } }),
      cardExtensions,
    );
    expect(html).toContain('src="https://img.example/a.jpg"');
    expect(html).toContain('alt="Panels"');
    expect(html).toContain('<a href="https://flickr.com/x" target="_blank" rel="noopener noreferrer nofollow">by Dave, CC BY</a>');
  });

  it("renders stored assets by id and never as src", () => {
    const html = generateHTML(doc({ type: "figure", attrs: { src: "asset:0f8fad5b-d9cb-469f-a165-70867728950e", alt: "" } }), cardExtensions);
    expect(html).toContain('data-asset-id="0f8fad5b-d9cb-469f-a165-70867728950e"');
    expect(html).not.toContain("src=");
  });

  it("shows a placeholder for unsafe or pending images", () => {
    const html = generateHTML(doc({ type: "figure", attrs: { src: "javascript:alert(1)", query: "solar roof" } }), cardExtensions);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Image: solar roof");
  });

  it("renders charts with data and an accessible table", () => {
    const html = generateHTML(doc({ type: "chart", attrs: { data: chart } }), cardExtensions);
    expect(html).toContain("data-cl-chart=");
    expect(html).toContain('<table class="sr-only">');
    expect(html).toContain("<td>2</td>");
  });

  it("renders allowlisted embeds as sandboxed iframes and others as links", () => {
    const yt = generateHTML(doc({ type: "embed", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } }), cardExtensions);
    expect(yt).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(yt).toContain("sandbox=");
    const other = generateHTML(doc({ type: "embed", attrs: { url: "https://example.com/page" } }), cardExtensions);
    expect(other).not.toContain("<iframe");
    expect(other).toContain('href="https://example.com/page"');
  });

  it("parses rendered HTML back to the same attributes", () => {
    const original = doc(
      { type: "figure", attrs: { src: "https://img.example/a.jpg", alt: "Panels", credit: "by Dave", creditUrl: "https://flickr.com/x", query: null } },
      { type: "chart", attrs: { data: chart } },
      { type: "embed", attrs: { url: "https://vimeo.com/76979871" } },
    );
    const back = generateJSON(generateHTML(original, cardExtensions), cardExtensions);
    expect(back).toEqual(original);
  });
});
