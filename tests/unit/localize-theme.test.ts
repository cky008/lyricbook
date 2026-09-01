import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  DEFAULT_THEME,
  detectUiLocale,
  getLocalized,
  languageDisplayName,
  sanitizeTheme,
  type Theme,
} from "@domain/index";

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("localization helpers", () => {
  it("uses locale fallbacks, arbitrary non-empty values, and empty defaults", () => {
    expect(getLocalized(undefined, "en-US")).toBe("");
    expect(getLocalized({ en: " English ", "zh-Hans": "中文" }, "en-US")).toBe("English");
    expect(getLocalized({ "zh-Hans": " 中文 ", en: "English" }, "zh-CN")).toBe("中文");
    expect(getLocalized({ fr: " Français ", en: "   " }, "en-US")).toBe("Français");
    expect(getLocalized({ en: "   " }, "en-US")).toBe("");
  });

  it("detects Chinese browser languages and defaults to English", () => {
    expect(detectUiLocale(["zh-Hant-TW", "en-US"])).toBe("zh-CN");
    expect(detectUiLocale(["fr-FR", "en-GB"])).toBe("en-US");
  });

  it("uses Intl.DisplayNames and falls back when the API throws", () => {
    expect(languageDisplayName("fr", "en-US").length).toBeGreaterThan(0);
    const original = Intl.DisplayNames;
    Object.defineProperty(Intl, "DisplayNames", {
      configurable: true,
      value: class {
        constructor() {
          throw new Error("unsupported");
        }
      },
    });
    expect(languageDisplayName("xx-private", "en-US")).toBe("xx-private");
    Object.defineProperty(Intl, "DisplayNames", { configurable: true, value: original });
  });
});

describe("theme safety and application", () => {
  it("accepts safe values, clamps density, and sanitizes optional print tokens", () => {
    const theme: Theme = {
      id: "custom",
      name: { en: "Custom" },
      tokens: {
        accent: " oklch(60% 0.2 20) ",
        accent2: "rgb(10 20 30)",
        background: "#123456",
        surface: "hsl(20 30% 40%)",
        surfaceStrong: "color(display-p3 1 0 0)",
        text: "#fff",
        muted: "#aaa",
        radius: "1.5rem",
        density: 2,
      },
      print: { accent: "#333", paper: "not-a-color", text: "#111" },
    };
    const safe = sanitizeTheme(theme);
    expect(safe.tokens.accent).toBe("oklch(60% 0.2 20)");
    expect(safe.tokens.density).toBe(1.3);
    expect(safe.print?.paper).toBe("#fffdf8");

    theme.tokens.density = 0.1;
    theme.tokens.radius = "calc(1px)";
    theme.tokens.accent2 = undefined;
    theme.tokens.surfaceStrong = undefined;
    theme.tokens.muted = undefined;
    theme.print = undefined;
    const fallback = sanitizeTheme(theme);
    expect(fallback.tokens.density).toBe(0.8);
    expect(fallback.tokens.radius).toBe("22px");
    expect(fallback.tokens.accent2).toBe("#e05ca7");
    expect(fallback.print).toBeUndefined();
  });

  it("writes safe CSS variables and updates an available theme-color meta tag", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    const target = document.createElement("section");
    applyTheme(DEFAULT_THEME, target);
    expect(target.style.getPropertyValue("--lb-accent")).toBe(DEFAULT_THEME.tokens.accent);
    expect(target.style.getPropertyValue("--print-paper")).toBe(DEFAULT_THEME.print?.paper);
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      DEFAULT_THEME.tokens.background,
    );

    document.head.innerHTML = "";
    expect(() => applyTheme(DEFAULT_THEME, target)).not.toThrow();
  });
});
