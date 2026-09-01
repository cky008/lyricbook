import { sanitizeTheme, type Theme } from "@domain/index";

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "lyricbook-appearance";

export function storedAppearance(storage: Pick<Storage, "getItem"> = localStorage): AppearanceMode {
  const value = storage.getItem(APPEARANCE_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveAppearance(mode: AppearanceMode, systemDark: boolean): ResolvedAppearance {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

export function nextAppearance(mode: AppearanceMode): AppearanceMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

export function applyAppearance(
  theme: Theme,
  mode: AppearanceMode,
  systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
  target: HTMLElement = document.documentElement,
): ResolvedAppearance {
  const safe = sanitizeTheme(theme);
  const resolved = resolveAppearance(mode, systemDark);
  const dark = resolved === "dark";
  const values: Record<string, string> = {
    "--lb-accent": safe.tokens.accent,
    "--lb-accent-2": safe.tokens.accent2 ?? safe.tokens.accent,
    "--lb-background": dark ? safe.tokens.background : (safe.print?.paper ?? "#f7f3ec"),
    "--lb-surface": dark ? safe.tokens.surface : "#fffdf8",
    "--lb-surface-strong": dark ? (safe.tokens.surfaceStrong ?? safe.tokens.surface) : "#f0e9df",
    "--lb-text": dark ? safe.tokens.text : (safe.print?.text ?? "#1d1921"),
    "--lb-muted": dark ? (safe.tokens.muted ?? "#bbb5cf") : "#6f6875",
    "--lb-radius": safe.tokens.radius,
    "--lb-density": String(safe.tokens.density ?? 1),
    "--print-accent": safe.print?.accent ?? safe.tokens.accent,
    "--print-paper": safe.print?.paper ?? "#fffdf8",
  };

  for (const [key, value] of Object.entries(values)) {
    target.style.setProperty(key, value);
  }

  target.dataset.appearance = mode;
  target.dataset.resolvedAppearance = resolved;
  target.style.colorScheme = resolved;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = values["--lb-background"] ?? safe.tokens.background;
  }

  return resolved;
}
