import type { Theme } from "./types";

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgb\(|hsl\(|oklch\(|color\()/i;
const SAFE_LENGTH = /^\d+(?:\.\d+)?(?:px|rem|em|%)$/;

export function sanitizeTheme(theme: Theme): Theme {
  const safeColor = (value: string | undefined, fallback: string) =>
    value && SAFE_COLOR.test(value.trim()) ? value.trim() : fallback;
  const safeRadius = SAFE_LENGTH.test(theme.tokens.radius.trim())
    ? theme.tokens.radius.trim()
    : "22px";
  return {
    ...theme,
    tokens: {
      ...theme.tokens,
      accent: safeColor(theme.tokens.accent, "#8f67ff"),
      accent2: safeColor(theme.tokens.accent2, "#e05ca7"),
      background: safeColor(theme.tokens.background, "#17132b"),
      surface: safeColor(theme.tokens.surface, "#25203a"),
      surfaceStrong: safeColor(theme.tokens.surfaceStrong, "#30294b"),
      text: safeColor(theme.tokens.text, "#f9f7ff"),
      muted: safeColor(theme.tokens.muted, "#bbb5cf"),
      radius: safeRadius,
      density: Math.min(1.3, Math.max(0.8, theme.tokens.density ?? 1)),
    },
    print: theme.print
      ? {
          ...theme.print,
          accent: safeColor(theme.print.accent, "#694e98"),
          paper: safeColor(theme.print.paper, "#fffdf8"),
          text: safeColor(theme.print.text, "#18161a"),
        }
      : undefined,
  };
}

export function applyTheme(theme: Theme, target: HTMLElement = document.documentElement): void {
  const safe = sanitizeTheme(theme);
  const values: Record<string, string> = {
    "--lb-accent": safe.tokens.accent,
    "--lb-accent-2": safe.tokens.accent2 ?? safe.tokens.accent,
    "--lb-background": safe.tokens.background,
    "--lb-surface": safe.tokens.surface,
    "--lb-surface-strong": safe.tokens.surfaceStrong ?? safe.tokens.surface,
    "--lb-text": safe.tokens.text,
    "--lb-muted": safe.tokens.muted ?? "#bbb5cf",
    "--lb-radius": safe.tokens.radius,
    "--lb-density": String(safe.tokens.density ?? 1),
    "--print-accent": safe.print?.accent ?? safe.tokens.accent,
    "--print-paper": safe.print?.paper ?? "#fffdf8",
  };
  for (const [key, value] of Object.entries(values)) target.style.setProperty(key, value);
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = safe.tokens.background;
}
