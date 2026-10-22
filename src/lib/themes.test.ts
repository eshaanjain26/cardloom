import { describe, expect, it } from "vitest";
import { THEMES, contrastRatio, getTheme, themeVars } from "./themes";

describe("themes", () => {
  it("has unique ids", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("falls back to the default theme", () => {
    expect(getTheme("missing").id).toBe("default");
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it.each(THEMES)("$name meets WCAG AA on its card surface", (theme) => {
    const { surface, text, muted, accent } = theme.colors;
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(3);
  });

  it("exposes every token and four chart colors as CSS variables", () => {
    const vars = themeVars(THEMES[0]);
    expect(Object.keys(vars)).toHaveLength(11);
    expect(vars["--cl-series-1"]).toBe("#2a78d6");
    expect(themeVars(THEMES.find((t) => t.dark)!)["--cl-series-1"]).toBe("#3987e5");
  });
});
