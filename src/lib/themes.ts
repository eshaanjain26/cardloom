export type Theme = {
  id: string;
  name: string;
  colors: { background: string; surface: string; text: string; muted: string; accent: string };
  fonts: { heading: string; body: string };
};

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = 'ui-serif, Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

export const THEMES: Theme[] = [
  {
    id: "default",
    name: "Default",
    colors: { background: "#f4f4f5", surface: "#ffffff", text: "#18181b", muted: "#52525b", accent: "#4f46e5" },
    fonts: { heading: SANS, body: SANS },
  },
  {
    id: "midnight",
    name: "Midnight",
    colors: { background: "#09090b", surface: "#18181b", text: "#fafafa", muted: "#a1a1aa", accent: "#818cf8" },
    fonts: { heading: SANS, body: SANS },
  },
  {
    id: "paper",
    name: "Paper",
    colors: { background: "#ede6d8", surface: "#faf6ee", text: "#2b2118", muted: "#5f5244", accent: "#9a3412" },
    fonts: { heading: SERIF, body: SERIF },
  },
  {
    id: "forest",
    name: "Forest",
    colors: { background: "#0f1f17", surface: "#163024", text: "#ecfdf5", muted: "#a7c4b5", accent: "#6ee7b7" },
    fonts: { heading: SERIF, body: SANS },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    colors: { background: "#0b2545", surface: "#13315c", text: "#f0f6ff", muted: "#b6c8e3", accent: "#7dd3fc" },
    fonts: { heading: MONO, body: SANS },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: { background: "#fff1e6", surface: "#ffffff", text: "#3b1d0f", muted: "#6b4a3a", accent: "#c2410c" },
    fonts: { heading: SANS, body: SANS },
  },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function themeVars(theme: Theme): Record<string, string> {
  return {
    "--cl-bg": theme.colors.background,
    "--cl-surface": theme.colors.surface,
    "--cl-text": theme.colors.text,
    "--cl-muted": theme.colors.muted,
    "--cl-accent": theme.colors.accent,
    "--cl-font-heading": theme.fonts.heading,
    "--cl-font-body": theme.fonts.body,
  };
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
