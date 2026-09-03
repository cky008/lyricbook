import { DEFAULT_THEME } from "./project";
import type {
  LyricBookProject,
  Theme,
  ThemePrintTokens,
  ThemeStyleTokens,
  ThemeTokens,
} from "./types";

const SAFE_HEX_COLOR = /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}(?:[0-9a-f]{2})?)$/i;
const SAFE_FUNCTION_COLOR = /^(?:rgba?|hsla?|oklch|color)\([0-9a-z.%+,\-/\s]+\)$/i;
const SAFE_LENGTH = /^\d+(?:\.\d+)?(?:px|rem|em|%)$/;
const SAFE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const SAFE_PERCENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%$/i;
const SAFE_ANGLE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:deg|grad|rad|turn)?$/i;
const SAFE_COLOR_PROFILES = new Set([
  "srgb",
  "srgb-linear",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz",
  "xyz-d50",
  "xyz-d65",
]);

function isNumberOrPercent(value: string, allowNone = false): boolean {
  return (
    (allowNone && value.toLowerCase() === "none") ||
    SAFE_NUMBER.test(value) ||
    SAFE_PERCENT.test(value)
  );
}

function splitColorFunction(body: string): { channels: string[]; alpha?: string } | undefined {
  const slashParts = body.trim().split("/");
  if (slashParts.length > 2) return undefined;
  const main = slashParts[0]?.trim() ?? "";
  const channels = (main.includes(",") ? main.split(",") : main.split(/\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
  const alpha = slashParts[1]?.trim();
  if (slashParts.length === 2 && (!alpha || alpha.includes(",") || alpha.includes(" "))) {
    return undefined;
  }
  return { channels, alpha };
}

function isStructuredFunctionColor(candidate: string): boolean {
  const match = /^(rgba?|hsla?|oklch|color)\((.*)\)$/i.exec(candidate);
  if (!match?.[1] || match[2] === undefined) return false;
  const name = match[1].toLowerCase();
  const components = splitColorFunction(match[2]);
  if (!components) return false;
  const channels = [...components.channels];
  let alpha = components.alpha;
  if (!alpha && (name === "rgba" || name === "hsla") && channels.length === 4) {
    alpha = channels.pop();
  }
  if (alpha && !isNumberOrPercent(alpha, true)) return false;

  if (name === "rgb" || name === "rgba") {
    return channels.length === 3 && channels.every((channel) => isNumberOrPercent(channel, true));
  }
  if (name === "hsl" || name === "hsla") {
    return (
      channels.length === 3 &&
      (channels[0]?.toLowerCase() === "none" || SAFE_ANGLE.test(channels[0] ?? "")) &&
      channels
        .slice(1)
        .every((channel) => SAFE_PERCENT.test(channel) || channel.toLowerCase() === "none")
    );
  }
  if (name === "oklch") {
    return (
      channels.length === 3 &&
      isNumberOrPercent(channels[0] ?? "", true) &&
      isNumberOrPercent(channels[1] ?? "", true) &&
      (channels[2]?.toLowerCase() === "none" || SAFE_ANGLE.test(channels[2] ?? ""))
    );
  }
  return (
    channels.length === 4 &&
    SAFE_COLOR_PROFILES.has(channels[0]?.toLowerCase() ?? "") &&
    channels.slice(1).every((channel) => isNumberOrPercent(channel, true))
  );
}

export function isSafeThemeColorToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  return (
    SAFE_HEX_COLOR.test(candidate) ||
    (SAFE_FUNCTION_COLOR.test(candidate) && isStructuredFunctionColor(candidate))
  );
}

export function isSafeThemeLengthToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_LENGTH.test(value.trim());
}

const SURFACE_STYLES = new Set<ThemeStyleTokens["surface"]>(["solid", "glass"]);
const ELEVATION_STYLES = new Set<ThemeStyleTokens["elevation"]>(["flat", "soft"]);
const ORNAMENT_STYLES = new Set<ThemeStyleTokens["ornament"]>([
  "none",
  "ink-wash",
  "porcelain-line",
]);
const HEADING_STYLES = new Set<NonNullable<ThemePrintTokens["headingStyle"]>>([
  "editorial",
  "modern",
  "classic",
]);

function safeColor(value: string | undefined, fallback: string): string {
  return isSafeThemeColorToken(value) ? value.trim() : fallback;
}

function safeFont(value: unknown): ThemeTokens["headingFont"] {
  return value === "serif" || value === "sans" ? value : undefined;
}

function safeDensity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1.3, Math.max(0.8, value))
    : 1;
}

function sanitizeStyle(style: Theme["style"]): ThemeStyleTokens | undefined {
  if (!style) return undefined;
  return {
    surface: SURFACE_STYLES.has(style.surface) ? style.surface : "solid",
    elevation: ELEVATION_STYLES.has(style.elevation) ? style.elevation : "soft",
    ornament: ORNAMENT_STYLES.has(style.ornament) ? style.ornament : "none",
  };
}

export function sanitizeTheme(theme: Theme): Theme {
  const safeRadius = isSafeThemeLengthToken(theme.tokens.radius)
    ? theme.tokens.radius.trim()
    : "22px";
  const headingStyle = theme.print?.headingStyle;

  const sanitized: Theme = {
    id: theme.id,
    name: { ...theme.name },
    tokens: {
      accent: safeColor(theme.tokens.accent, "#8f67ff"),
      accent2: safeColor(theme.tokens.accent2, "#e05ca7"),
      background: safeColor(theme.tokens.background, "#17132b"),
      surface: safeColor(theme.tokens.surface, "#25203a"),
      surfaceStrong: safeColor(theme.tokens.surfaceStrong, "#30294b"),
      text: safeColor(theme.tokens.text, "#f9f7ff"),
      muted: safeColor(theme.tokens.muted, "#bbb5cf"),
      radius: safeRadius,
      density: safeDensity(theme.tokens.density),
      headingFont: safeFont(theme.tokens.headingFont),
      bodyFont: safeFont(theme.tokens.bodyFont),
    },
    print: theme.print
      ? {
          accent: safeColor(theme.print.accent, "#694e98"),
          paper: safeColor(theme.print.paper, "#fffdf8"),
          text: safeColor(theme.print.text, "#18161a"),
          headingStyle: headingStyle && HEADING_STYLES.has(headingStyle) ? headingStyle : undefined,
        }
      : undefined,
  };

  const style = sanitizeStyle(theme.style);
  if (style) sanitized.style = style;
  if (theme.assets) sanitized.assets = { ...theme.assets };
  return sanitized;
}

function sortThemeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortThemeValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortThemeValue(item)]),
  );
}

/**
 * Compare sanitized theme data without depending on object insertion order.
 * Legacy asset declarations remain part of the comparison so a project-owned
 * reserved id cannot be mistaken for the catalog theme with the same id.
 */
export function themesEqual(left: Theme, right: Theme): boolean {
  return (
    JSON.stringify(sortThemeValue(sanitizeTheme(left))) ===
    JSON.stringify(sortThemeValue(sanitizeTheme(right)))
  );
}

/** Remove inert project-only legacy asset references at the standalone theme boundary. */
export function sanitizeStandaloneTheme(theme: Theme): Theme {
  const { assets: _legacyAssets, ...standalone } = sanitizeTheme(theme);
  return standalone;
}

const STUDIO_SLATE: Theme = DEFAULT_THEME;

const INK_JADE: Theme = {
  id: "builtin-ink-jade",
  name: { en: "Ink Jade", "zh-Hans": "墨玉" },
  tokens: {
    accent: "#7fae9d",
    accent2: "#c6a15b",
    background: "#0f1c1a",
    surface: "#172825",
    surfaceStrong: "#223a35",
    text: "#f3f0e7",
    muted: "#aebdb5",
    radius: "18px",
    density: 0.95,
    headingFont: "serif",
    bodyFont: "serif",
  },
  print: {
    accent: "#315f54",
    paper: "#f5f0e5",
    text: "#18201d",
    headingStyle: "classic",
  },
  style: { surface: "glass", elevation: "soft", ornament: "ink-wash" },
};

const PORCELAIN_BLUE: Theme = {
  id: "builtin-porcelain-blue",
  name: { en: "Porcelain Blue", "zh-Hans": "青花" },
  tokens: {
    accent: "#79aee3",
    accent2: "#d6b164",
    background: "#101a2a",
    surface: "#17253a",
    surfaceStrong: "#20334e",
    text: "#f4f6f4",
    muted: "#b3bfd0",
    radius: "16px",
    density: 1,
    headingFont: "serif",
    bodyFont: "sans",
  },
  print: {
    accent: "#245c9c",
    paper: "#fbfaf5",
    text: "#142033",
    headingStyle: "classic",
  },
  style: { surface: "solid", elevation: "soft", ornament: "porcelain-line" },
};

const CINNABAR_SILK: Theme = {
  id: "builtin-cinnabar-silk",
  name: { en: "Cinnabar Silk", "zh-Hans": "朱砂绢" },
  tokens: {
    accent: "#df705f",
    accent2: "#d4ad63",
    background: "#241311",
    surface: "#351b18",
    surfaceStrong: "#48231e",
    text: "#fff5ed",
    muted: "#d6b6a9",
    radius: "20px",
    density: 1.05,
    headingFont: "serif",
    bodyFont: "sans",
  },
  print: {
    accent: "#a83d30",
    paper: "#fff9f0",
    text: "#2b1714",
    headingStyle: "editorial",
  },
  style: { surface: "glass", elevation: "soft", ornament: "ink-wash" },
};

const MOONLIT_PAPER: Theme = {
  id: "builtin-moonlit-paper",
  name: { en: "Moonlit Paper", "zh-Hans": "月白宣纸" },
  tokens: {
    accent: "#aebfd5",
    accent2: "#c9a86a",
    background: "#161b24",
    surface: "#202733",
    surfaceStrong: "#2b3442",
    text: "#f2f0e9",
    muted: "#bbc0c8",
    radius: "12px",
    density: 0.9,
    headingFont: "serif",
    bodyFont: "serif",
  },
  print: {
    accent: "#667c9e",
    paper: "#f8f6ee",
    text: "#1b2028",
    headingStyle: "classic",
  },
  style: { surface: "solid", elevation: "flat", ornament: "none" },
};

function freezeTheme(theme: Theme): Theme {
  Object.freeze(theme.name);
  Object.freeze(theme.tokens);
  if (theme.print) Object.freeze(theme.print);
  if (theme.style) Object.freeze(theme.style);
  return Object.freeze(theme);
}

/**
 * A virtual catalog. A catalog theme is copied into a project when it becomes active.
 */
export const BUILT_IN_THEMES: readonly Theme[] = Object.freeze(
  [STUDIO_SLATE, INK_JADE, PORCELAIN_BLUE, CINNABAR_SILK, MOONLIT_PAPER].map((theme) =>
    freezeTheme(sanitizeTheme(theme)),
  ),
);

const BUILT_IN_THEME_BY_ID = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));

export function isBuiltInThemeId(id: string): boolean {
  return BUILT_IN_THEME_BY_ID.has(id);
}

export function getBuiltInTheme(id: string): Theme | undefined {
  const theme = BUILT_IN_THEME_BY_ID.get(id);
  return theme ? structuredClone(theme) : undefined;
}

const LEGACY_DEFAULT_MINIMAL: Theme = {
  id: "default",
  name: { "zh-Hans": "默认星夜", en: "Default Night" },
  tokens: {
    accent: "#8f67ff",
    background: "#17132b",
    surface: "#25203a",
    text: "#f9f7ff",
    radius: "22px",
  },
};

const LEGACY_DEFAULT_COMPLETE: Theme = {
  ...LEGACY_DEFAULT_MINIMAL,
  tokens: {
    ...LEGACY_DEFAULT_MINIMAL.tokens,
    accent2: "#e05ca7",
    surfaceStrong: "#30294b",
    muted: "#bbb5cf",
    density: 1,
    headingFont: "serif",
    bodyFont: "serif",
  },
  print: {
    accent: "#694e98",
    paper: "#fffdf8",
    text: "#18161a",
    headingStyle: "editorial",
  },
};

const LEGACY_GLORIA: Theme = {
  id: "gloria",
  name: { "zh-Hans": "GLORIA 紫粉星光", en: "GLORIA Violet Starlight" },
  tokens: {
    accent: "#d66cff",
    background: "#120c1c",
    surface: "#24152e",
    text: "#fbf6ff",
    radius: "24px",
  },
};

const LEGACY_KAMPUNG_GIRL_MINIMAL: Theme = {
  id: "kampung-girl",
  name: { "zh-Hans": "KAMPUNG GIRL 田野暖光", en: "KAMPUNG GIRL Field Glow" },
  tokens: {
    accent: "#e79a3b",
    background: "#13241f",
    surface: "#24382e",
    text: "#fff8e7",
    radius: "20px",
  },
};

const LEGACY_KAMPUNG_GIRL_COMPLETE: Theme = {
  ...LEGACY_KAMPUNG_GIRL_MINIMAL,
  tokens: {
    ...LEGACY_KAMPUNG_GIRL_MINIMAL.tokens,
    accent2: "#8fbd72",
    surfaceStrong: "#314c3d",
    muted: "#d8d1bd",
    density: 1,
    headingFont: "serif",
    bodyFont: "sans",
  },
  print: {
    accent: "#9b5b19",
    paper: "#fffaf0",
    text: "#28251f",
    headingStyle: "editorial",
  },
};

const LEGACY_THEME_MIGRATIONS: ReadonlyArray<{
  signatures: readonly Theme[];
  targetId: string;
}> = [
  {
    signatures: [LEGACY_DEFAULT_MINIMAL, LEGACY_DEFAULT_COMPLETE, LEGACY_GLORIA],
    targetId: "builtin-studio-slate",
  },
  {
    signatures: [LEGACY_KAMPUNG_GIRL_MINIMAL, LEGACY_KAMPUNG_GIRL_COMPLETE],
    targetId: "builtin-ink-jade",
  },
];

function legacyMigrationFor(theme: Theme): (typeof LEGACY_THEME_MIGRATIONS)[number] | undefined {
  return LEGACY_THEME_MIGRATIONS.find((migration) =>
    migration.signatures.some((signature) => themesEqual(theme, signature)),
  );
}

/**
 * Replace only byte-for-byte-equivalent published legacy theme data (after normal sanitization)
 * with its closest catalog theme. User edits and reserved-id collisions stay project-owned.
 */
export function migrateLegacyThemes(project: LyricBookProject): LyricBookProject {
  const sourceThemes = Array.isArray(project.themes) ? project.themes : [];
  let themes = sourceThemes;
  let activeThemeId = project.activeThemeId;
  let changed = false;

  for (const sourceTheme of sourceThemes) {
    const migration = legacyMigrationFor(sourceTheme);
    if (!migration) continue;
    const target = getBuiltInTheme(migration.targetId);
    if (!target) continue;

    const existingTarget = themes.find((theme) => theme.id === target.id);
    if (existingTarget && !themesEqual(existingTarget, target)) continue;

    if (!changed) themes = [...sourceThemes];
    const sourceIndex = themes.indexOf(sourceTheme);
    if (sourceIndex < 0) continue;

    if (existingTarget) themes.splice(sourceIndex, 1);
    else themes.splice(sourceIndex, 1, target);
    if (activeThemeId === sourceTheme.id) activeThemeId = target.id;
    changed = true;
  }

  return changed ? { ...project, themes, activeThemeId } : project;
}

export function activateBuiltInTheme(project: LyricBookProject, id: string): LyricBookProject {
  const builtIn = getBuiltInTheme(id);
  if (!builtIn) return project;

  const themes = Array.isArray(project.themes) ? project.themes : [];
  if (themes.some((theme) => theme.id === id)) {
    return project.activeThemeId === id ? project : { ...project, activeThemeId: id };
  }

  return {
    ...project,
    themes: [...themes, builtIn],
    activeThemeId: id,
  };
}

export function resolveActiveTheme(project: LyricBookProject): Theme {
  const themes = Array.isArray(project.themes) ? project.themes : [];
  const selected = themes.find((theme) => theme.id === project.activeThemeId) ?? themes[0];
  return selected ? sanitizeTheme(selected) : sanitizeTheme(DEFAULT_THEME);
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
