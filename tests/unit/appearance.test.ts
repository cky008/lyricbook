import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  deriveAppearance,
  derivePrintPalette,
  nextAppearance,
  resolveAppearance,
  storedAppearance,
  THEME_FONT_STACKS,
  themeFontStack,
} from "@app/lib/appearance";
import { BUILT_IN_THEMES, type Theme } from "@domain/index";
import { describe, expect, it } from "vitest";

const theme: Theme = {
  id: "test",
  name: { en: "Test" },
  tokens: {
    accent: "#7c3aed",
    accent2: "#db2777",
    background: "#17132b",
    surface: "#25203a",
    surfaceStrong: "#30294b",
    text: "#f9f7ff",
    muted: "#bbb5cf",
    radius: "22px",
    density: 1,
    headingFont: "serif",
    bodyFont: "sans",
  },
  print: {
    accent: "#694e98",
    paper: "#fffdf8",
    text: "#18161a",
  },
};

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(hex: string): number {
  const channels = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("appearance mode", () => {
  it("defaults to system and follows the system color scheme", () => {
    expect(storedAppearance({ getItem: () => null })).toBe("system");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("system", true)).toBe("dark");
  });

  it("restores valid saved modes and cycles system, light, and dark", () => {
    expect(
      storedAppearance({
        getItem: (key) => (key === APPEARANCE_STORAGE_KEY ? "light" : null),
      }),
    ).toBe("light");
    expect(storedAppearance({ getItem: () => "invalid" })).toBe("system");
    expect(nextAppearance("system")).toBe("light");
    expect(nextAppearance("light")).toBe("dark");
    expect(nextAppearance("dark")).toBe("system");
  });

  it("derives accessible light and dark palettes while preserving theme identity", () => {
    const light = deriveAppearance(theme, "light", false);
    const dark = deriveAppearance(theme, "dark", false);
    const secondTheme: Theme = {
      ...theme,
      tokens: {
        ...theme.tokens,
        accent: "#a5332a",
        background: "#34120f",
        surface: "#51201a",
        surfaceStrong: "#693028",
      },
    };
    const secondLight = deriveAppearance(secondTheme, "light", false);

    expect(light.resolved).toBe("light");
    expect(dark.resolved).toBe("dark");
    expect(light.variables["--lb-background"]).not.toBe("#fffdf8");
    expect(light.variables["--lb-background"]).not.toBe(secondLight.variables["--lb-background"]);
    expect(light.variables["--lb-surface-strong"]).not.toBe(
      secondLight.variables["--lb-surface-strong"],
    );

    for (const appearance of [light, dark]) {
      for (const surface of ["--lb-background", "--lb-surface", "--lb-surface-strong"] as const) {
        expect(
          contrast(appearance.variables["--lb-text"], appearance.variables[surface]),
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(appearance.variables["--lb-muted"], appearance.variables[surface]),
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(appearance.variables["--lb-accent"], appearance.variables[surface]),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("chooses a black or white foreground that is accessible across every built-in accent", () => {
    for (const builtInTheme of BUILT_IN_THEMES) {
      for (const mode of ["light", "dark"] as const) {
        const appearance = deriveAppearance(builtInTheme, mode, false);
        const foreground = appearance.variables["--lb-on-accent"];
        const accents = [
          appearance.variables["--lb-accent"],
          appearance.variables["--lb-accent-2"],
        ];

        expect(["#000000", "#ffffff"]).toContain(foreground);
        for (const accent of accents) {
          expect(
            contrast(foreground, accent),
            `${builtInTheme.id} ${mode} ${foreground} on ${accent}`,
          ).toBeGreaterThanOrEqual(4.5);
        }

        const alternate = foreground === "#000000" ? "#ffffff" : "#000000";
        const foregroundMinimum = Math.min(
          ...accents.map((accent) => contrast(foreground, accent)),
        );
        const alternateMinimum = Math.min(...accents.map((accent) => contrast(alternate, accent)));
        expect(foregroundMinimum).toBeGreaterThanOrEqual(alternateMinimum);
      }
    }
  });

  it("maps font, density, radius, and fixed style enums to safe variables and data", () => {
    const styled = {
      ...theme,
      tokens: { ...theme.tokens, radius: "1.5rem", density: 1.2 },
      style: { surface: "glass", elevation: "flat", ornament: "porcelain-line" },
    } as Theme;
    const appearance = deriveAppearance(styled, "system", false);

    expect(appearance.variables["--lb-heading-font"]).toBe(THEME_FONT_STACKS.serif);
    expect(appearance.variables["--lb-body-font"]).toBe(THEME_FONT_STACKS.sans);
    expect(appearance.variables["--lb-radius"]).toBe("1.5rem");
    expect(appearance.variables["--lb-radius-sm"]).toBe("0.825rem");
    expect(appearance.variables["--lb-radius-md"]).toBe("1.5rem");
    expect(appearance.variables["--lb-radius-lg"]).toBe("2.025rem");
    expect(appearance.variables["--lb-density"]).toBe("1.2");
    expect(appearance.variables["--lb-accent-soft"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(appearance.variables["--print-text"]).toBe("#18161a");
    expect(appearance.dataset).toEqual({
      appearance: "system",
      resolvedAppearance: "light",
      density: "spacious",
      themeSurface: "glass",
      themeElevation: "flat",
      themeOrnament: "porcelain-line",
    });
    expect(themeFontStack(undefined, "sans")).toBe(THEME_FONT_STACKS.sans);
  });

  it("preserves the original translucent surface treatment when legacy themes omit style", () => {
    const appearance = deriveAppearance(theme, "dark", false);

    expect(theme).not.toHaveProperty("style");
    expect(appearance.dataset.themeSurface).toBe("glass");
    expect(appearance.dataset.themeElevation).toBe("soft");
    expect(appearance.dataset.themeOrnament).toBe("none");
  });

  it("falls back from invalid legacy values without emitting active CSS or remote URLs", () => {
    const unsafe = {
      ...theme,
      tokens: {
        ...theme.tokens,
        accent: "rgb(url(https://invalid.example/theme))",
        accent2: "var(--remote-color)",
        background: "color(url(https://invalid.example/background))",
        surface: "not-a-color",
        surfaceStrong: "image-set(url(https://invalid.example/image))",
        text: "attr(data-secret)",
        muted: "env(secret)",
        radius: "calc(2rem + url(https://invalid.example/radius))",
        density: Number.NaN,
        headingFont: "url(https://invalid.example/font)" as "serif",
        bodyFont: "remote" as "sans",
      },
      print: {
        ...theme.print,
        accent: "url(https://invalid.example/print-accent)",
        paper: "rgb(url(https://invalid.example/paper))",
        text: "var(--remote-text)",
      },
      style: { surface: "remote", elevation: "floating", ornament: "javascript" },
    } as unknown as Theme;

    const appearance = deriveAppearance(unsafe, "system", true);
    expect(appearance.resolved).toBe("dark");
    expect(appearance.variables["--lb-radius"]).toBe("22px");
    expect(appearance.variables["--lb-density"]).toBe("1");
    expect(appearance.variables["--lb-heading-font"]).toBe(THEME_FONT_STACKS.serif);
    expect(appearance.variables["--lb-body-font"]).toBe(THEME_FONT_STACKS.sans);
    expect(appearance.dataset.density).toBe("comfortable");
    expect(appearance.dataset.themeSurface).toBe("solid");
    expect(appearance.dataset.themeElevation).toBe("soft");
    expect(appearance.dataset.themeOrnament).toBe("none");
    expect(Object.values(appearance.variables).join(" ")).not.toMatch(
      /(?:url|var|env|attr|image-set|https?):/i,
    );
  });

  it("normalizes supported CSS color syntax to inert opaque values", () => {
    const cssColorTheme: Theme = {
      ...theme,
      tokens: {
        ...theme.tokens,
        accent: "rgb(30 90 70)",
        accent2: "hsl(18, 60%, 35%)",
        background: "#1234",
        surface: "rgba(31, 42, 53, 0.7)",
      },
    };
    const appearance = deriveAppearance(cssColorTheme, "dark", false);

    for (const value of Object.values(appearance.variables)) {
      expect(value).not.toMatch(/rgba?|hsla?\(|url\(/i);
    }
    expect(appearance.variables["--lb-background"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("derives an opaque contrast-safe print palette from transparent or matching colors", () => {
    const transparentTheme: Theme = {
      ...theme,
      print: {
        accent: "rgba(255 255 255 / 0%)",
        paper: "#ffffff00",
        text: "rgba(255, 253, 248, 0)",
      },
    };
    const matchingTheme: Theme = {
      ...theme,
      print: {
        accent: "#f4f1ea",
        paper: "#f4f1ea",
        text: "#f4f1ea",
      },
    };

    for (const palette of [
      derivePrintPalette(transparentTheme),
      derivePrintPalette(matchingTheme),
    ]) {
      expect(palette.paper).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.text).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.muted).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.text).not.toBe(palette.paper);
      expect(palette.accent).not.toBe(palette.paper);
      expect(palette.muted).not.toBe(palette.paper);
      expect(contrast(palette.text, palette.paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(palette.accent, palette.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.muted, palette.paper)).toBeGreaterThanOrEqual(7);
    }
  });

  it("preserves sanitized oklch and color theme identity when deriving opaque colors", () => {
    const modernCssTheme: Theme = {
      ...theme,
      tokens: {
        ...theme.tokens,
        accent: "oklch(62% 0.18 30)",
        accent2: "color(display-p3 0.18 0.64 0.32)",
        background: "color(srgb 0.06 0.09 0.12)",
      },
      print: {
        accent: "color(display-p3 0.42 0.12 0.08)",
        paper: "oklch(96% 0.025 85)",
        text: "color(srgb 0.08 0.06 0.04)",
      },
    };
    const alternateModernCssTheme: Theme = {
      ...modernCssTheme,
      print: {
        ...modernCssTheme.print,
        paper: "oklch(96% 0.025 240)",
      },
    };

    const appearance = deriveAppearance(modernCssTheme, "dark", false);
    const palette = derivePrintPalette(modernCssTheme);
    const alternatePalette = derivePrintPalette(alternateModernCssTheme);

    expect(appearance.variables["--lb-background"]).not.toBe("#17132b");
    expect(appearance.variables["--lb-accent-2"]).not.toBe("#8d6e63");
    expect(palette.paper).not.toBe("#fffdf8");
    expect(palette.paper).not.toBe(alternatePalette.paper);
    expect(palette.text).not.toBe("#18161a");
    expect(palette.accent).not.toBe("#795548");
    expect(contrast(palette.text, palette.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(palette.accent, palette.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.muted, palette.paper)).toBeGreaterThanOrEqual(7);
  });

  it("applies the pure result to the document without changing its public return value", () => {
    const target = document.createElement("div");
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    const light = deriveAppearance(theme, "light", false);

    expect(applyAppearance(theme, "light", false, target)).toBe("light");
    expect(target.dataset.appearance).toBe("light");
    expect(target.dataset.resolvedAppearance).toBe("light");
    expect(target.dataset.density).toBe("comfortable");
    expect(target.style.getPropertyValue("--lb-background")).toBe(
      light.variables["--lb-background"],
    );
    expect(target.style.getPropertyValue("--lb-heading-font")).toBe(THEME_FONT_STACKS.serif);
    expect(meta.content).toBe(light.variables["--lb-background"]);

    const dark = deriveAppearance(theme, "dark", false);
    expect(applyAppearance(theme, "dark", false, target)).toBe("dark");
    expect(target.style.getPropertyValue("--lb-background")).toBe(
      dark.variables["--lb-background"],
    );
    expect(target.style.getPropertyValue("--lb-text")).toBe(dark.variables["--lb-text"]);
    expect(meta.content).toBe(dark.variables["--lb-background"]);

    meta.remove();
  });
});
