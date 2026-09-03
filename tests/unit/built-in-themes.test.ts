import {
  activateBuiltInTheme,
  BUILT_IN_THEMES,
  createBlankProject,
  DEFAULT_THEME,
  getBuiltInTheme,
  isBuiltInThemeId,
  isSafeThemeColorToken,
  isSafeThemeLengthToken,
  parseProject,
  parseTheme,
  resolveActiveTheme,
  sanitizeStandaloneTheme,
  sanitizeTheme,
  type Theme,
  themesEqual,
  validateProject,
} from "@domain/index";
import { describe, expect, it } from "vitest";

const EXPECTED_BUILT_INS = new Map([
  ["builtin-studio-slate", "Studio Slate"],
  ["builtin-ink-jade", "Ink Jade"],
  ["builtin-porcelain-blue", "Porcelain Blue"],
  ["builtin-cinnabar-silk", "Cinnabar Silk"],
  ["builtin-moonlit-paper", "Moonlit Paper"],
]);

function customTheme(id = "custom-theme"): Theme {
  return {
    id,
    name: { en: "My untouched theme", "zh-Hans": "我的原有主题" },
    tokens: {
      accent: "#336699",
      background: "#101820",
      surface: "#1d2a33",
      text: "#f8fafc",
      radius: "12px",
    },
  };
}

describe("built-in theme catalog", () => {
  it("publishes five stable, uniquely named built-in themes", () => {
    expect(BUILT_IN_THEMES).toHaveLength(5);
    expect(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size).toBe(BUILT_IN_THEMES.length);
    expect(new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme.name.en]))).toEqual(
      EXPECTED_BUILT_INS,
    );
    expect(BUILT_IN_THEMES.every((theme) => Boolean(theme.name["zh-Hans"]))).toBe(true);
    expect([...EXPECTED_BUILT_INS.keys()].every((id) => isBuiltInThemeId(id))).toBe(true);
    expect(isBuiltInThemeId(DEFAULT_THEME.id)).toBe(false);
    expect(isBuiltInThemeId("custom-theme")).toBe(false);
    expect(getBuiltInTheme(DEFAULT_THEME.id)).toBeUndefined();
    expect(getBuiltInTheme("builtin-studio-slate")).toMatchObject({
      tokens: { headingFont: "sans", bodyFont: "sans" },
      print: { headingStyle: "modern" },
    });
  });

  it("keeps the legacy default theme id, names, tokens, and shape unchanged", () => {
    expect(DEFAULT_THEME).toEqual({
      id: "default",
      name: { en: "Default Night", "zh-Hans": "默认星夜" },
      tokens: {
        accent: "#8f67ff",
        accent2: "#e05ca7",
        background: "#17132b",
        surface: "#25203a",
        surfaceStrong: "#30294b",
        text: "#f9f7ff",
        muted: "#bbb5cf",
        radius: "22px",
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
    });
    expect(DEFAULT_THEME).not.toHaveProperty("style");

    const project = createBlankProject("en-US");
    expect(project.activeThemeId).toBe("default");
    expect(project.themes).toEqual([DEFAULT_THEME]);
    expect(resolveActiveTheme(project)).toEqual(DEFAULT_THEME);
  });

  it("contains only fixed safe data tokens and sanitizes idempotently", () => {
    for (const theme of BUILT_IN_THEMES) {
      const serialized = JSON.stringify(theme).toLowerCase();
      expect(serialized).not.toMatch(/url\s*\(|javascript:|<\/?(?:svg|style|script)|data:/);
      expect(theme).not.toHaveProperty("assets");
      expect(theme.style).toEqual({
        surface: expect.stringMatching(/^(solid|glass)$/),
        elevation: expect.stringMatching(/^(flat|soft)$/),
        ornament: expect.stringMatching(/^(none|ink-wash|porcelain-line)$/),
      });
      expect(sanitizeTheme(theme)).toEqual(theme);
      expect(
        validateProject({
          ...createBlankProject("en-US"),
          themes: [structuredClone(theme)],
          activeThemeId: theme.id,
        }).ok,
      ).toBe(true);
    }
  });

  it("returns defensive deep copies instead of mutable catalog entries", () => {
    const first = getBuiltInTheme("builtin-ink-jade");
    const second = getBuiltInTheme("builtin-ink-jade");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first?.tokens).not.toBe(second?.tokens);
    expect(first?.style).not.toBe(second?.style);

    if (!first) throw new Error("Ink Jade must be available");
    first.name.en = "Changed locally";
    first.tokens.accent = "#000000";
    if (first.style) first.style.ornament = "none";

    expect(getBuiltInTheme("builtin-ink-jade")?.name.en).toBe("Ink Jade");
    expect(getBuiltInTheme("builtin-ink-jade")?.tokens.accent).not.toBe("#000000");
    expect(getBuiltInTheme("missing-theme")).toBeUndefined();
  });

  it("compares sanitized theme data independently of localized key insertion order", () => {
    const catalog = getBuiltInTheme("builtin-ink-jade");
    if (!catalog) throw new Error("Ink Jade must be available");
    const reordered: Theme = {
      ...structuredClone(catalog),
      name: { "zh-Hans": catalog.name["zh-Hans"] ?? "墨玉", en: catalog.name.en ?? "Ink Jade" },
    };

    expect(Object.keys(reordered.name)).toEqual(["zh-Hans", "en"]);
    expect(themesEqual(reordered, catalog)).toBe(true);
    expect(
      themesEqual({ ...reordered, assets: { cover: "https://example.com/inert.svg" } }, catalog),
    ).toBe(false);
  });
});

describe("built-in theme activation", () => {
  it("does not alter an imported project until a built-in theme is explicitly activated", () => {
    const project = createBlankProject("en-US");
    project.themes = [customTheme()];
    project.activeThemeId = "custom-theme";
    const snapshot = structuredClone(project);

    expect(getBuiltInTheme("builtin-porcelain-blue")?.name.en).toBe("Porcelain Blue");
    expect(resolveActiveTheme(project).id).toBe("custom-theme");
    expect(project).toEqual(snapshot);

    const activated = activateBuiltInTheme(project, "builtin-porcelain-blue");
    expect(project).toEqual(snapshot);
    expect(activated.activeThemeId).toBe("builtin-porcelain-blue");
    expect(activated.themes.map((theme) => theme.id)).toEqual([
      "custom-theme",
      "builtin-porcelain-blue",
    ]);
    expect(activated.themes[1]).not.toBe(getBuiltInTheme("builtin-porcelain-blue"));
  });

  it("appends a built-in once and keeps the catalog isolated from project edits", () => {
    const project = createBlankProject("en-US");
    expect(activateBuiltInTheme(project, "missing-built-in")).toBe(project);
    const activated = activateBuiltInTheme(project, "builtin-cinnabar-silk");
    const installed = activated.themes.find((theme) => theme.id === "builtin-cinnabar-silk");
    if (!installed) throw new Error("Activated theme must be stored in the project");
    activated.themes = [
      {
        style: installed.style,
        print: installed.print,
        tokens: installed.tokens,
        name: installed.name,
        id: installed.id,
      },
      ...activated.themes.filter((theme) => theme.id !== installed.id),
    ];
    const activatedAgain = activateBuiltInTheme(activated, "builtin-cinnabar-silk");

    expect(activatedAgain).toBe(activated);
    expect(
      activatedAgain.themes.filter((theme) => theme.id === "builtin-cinnabar-silk"),
    ).toHaveLength(1);
    const stored = activatedAgain.themes.find((theme) => theme.id === "builtin-cinnabar-silk");
    if (!stored) throw new Error("Activated theme must be stored in the project");
    stored.tokens.accent = "#000000";
    expect(getBuiltInTheme("builtin-cinnabar-silk")?.tokens.accent).not.toBe("#000000");
  });

  it("keeps project-owned reserved-id collisions unchanged and selects the project version", () => {
    for (const catalogTheme of BUILT_IN_THEMES) {
      const collision = customTheme(catalogTheme.id);
      collision.name.en = "Private impersonator";
      collision.assets = {
        cover: "https://example.com/untrusted.svg",
        background: "url(javascript:alert(1))",
      };
      const untouched = customTheme(`custom-${catalogTheme.id}`);
      const project = createBlankProject("en-US");
      project.themes = [collision, untouched];
      project.activeThemeId = untouched.id;
      const snapshot = structuredClone(project);

      const activated = activateBuiltInTheme(project, catalogTheme.id);
      expect(project).toEqual(snapshot);
      expect(activated.activeThemeId).toBe(catalogTheme.id);
      expect(activated.themes).toBe(project.themes);
      expect(activated.themes[0]).toBe(collision);
      expect(activated.themes[1]).toBe(untouched);
      expect(activated.themes.filter((theme) => theme.id === catalogTheme.id)).toHaveLength(1);
      expect(activated.themes[0]).toEqual(collision);
      expect(activated.themes[0]).not.toEqual(catalogTheme);
      expect(resolveActiveTheme(activated)).toEqual(sanitizeTheme(collision));
    }
  });

  it("preserves the legacy default project theme when Studio Slate is activated", () => {
    const project = createBlankProject("en-US");
    const snapshot = structuredClone(project);

    const activated = activateBuiltInTheme(project, "builtin-studio-slate");
    expect(project).toEqual(snapshot);
    expect(activated.activeThemeId).toBe("builtin-studio-slate");
    expect(activated.themes.map((theme) => theme.id)).toEqual(["default", "builtin-studio-slate"]);
    expect(activated.themes[0]).toEqual(DEFAULT_THEME);
    expect(activated.themes[1]).toEqual(getBuiltInTheme("builtin-studio-slate"));
  });

  it("resolves missing active themes and empty projects without mutating them", () => {
    const project = createBlankProject("en-US");
    project.themes = [customTheme("first-project-theme")];
    project.activeThemeId = "missing";
    const snapshot = structuredClone(project);

    expect(resolveActiveTheme(project).id).toBe("first-project-theme");
    expect(project).toEqual(snapshot);

    const empty = { ...project, themes: [], activeThemeId: "missing" };
    expect(resolveActiveTheme(empty)).toEqual(DEFAULT_THEME);
    expect(empty.themes).toEqual([]);
  });
});

describe("theme sanitization boundaries", () => {
  it("exports the exact color and length token validation rules used by sanitization", () => {
    for (const value of [
      " #abc ",
      "#abcd",
      "#123456",
      "#12345678",
      "rgb(10 20 30 / 50%)",
      "hsl(20 30% 40%)",
      "oklch(60% 0.2 20)",
      "color(display-p3 1 0 0)",
    ]) {
      expect(isSafeThemeColorToken(value)).toBe(true);
    }
    for (const value of [
      undefined,
      123,
      "red",
      "#12",
      "#12345",
      "rgb(foo)",
      "color(nonsense 0.1 0.2 0.3)",
      "url(javascript:alert(1))",
      "#fff; background: red",
    ]) {
      expect(isSafeThemeColorToken(value)).toBe(false);
    }

    for (const value of [" 0px ", "1.5rem", "2em", "100%"]) {
      expect(isSafeThemeLengthToken(value)).toBe(true);
    }
    for (const value of [undefined, 12, "-1px", "1vh", "calc(1rem)", "1rem; color: red"]) {
      expect(isSafeThemeLengthToken(value)).toBe(false);
    }
  });

  it("validates standalone theme imports before returning a sanitized theme", () => {
    const projectTheme = {
      ...customTheme("standalone"),
      unknown: "discard me",
      assets: { cover: "https://example.com/untrusted.svg" },
    } as Theme;
    const parsed = parseTheme(projectTheme);
    expect(parsed.id).toBe("standalone");
    expect(parsed).not.toHaveProperty("unknown");
    expect(parsed).not.toHaveProperty("assets");
    expect(sanitizeStandaloneTheme(projectTheme)).not.toHaveProperty("assets");
    expect(projectTheme.assets).toEqual({ cover: "https://example.com/untrusted.svg" });
    expect(() => parseTheme({ id: "incomplete" })).toThrow();
  });

  it("sanitizes project themes while preserving inert legacy assets and non-theme data", () => {
    const project = createBlankProject("zh-CN");
    const unsafeTheme = {
      ...customTheme("imported-theme"),
      unknown: "discard me",
      assets: {
        cover: "https://example.com/untrusted.svg",
        background: "url(javascript:alert(1))",
      },
      tokens: {
        ...customTheme().tokens,
        accent: "url(javascript:alert(1))",
        arbitraryCss: "position:fixed",
      },
      print: {
        accent: "#315f54",
        paper: "#f5f0e5",
        text: "#18201d",
        headingStyle: "classic",
        backgroundImage: "url(https://example.com/image.png)",
      },
      style: {
        surface: "glass",
        elevation: "soft",
        ornament: "ink-wash",
        css: "display:none",
      },
    };
    const input = { ...project, themes: [unsafeTheme], activeThemeId: unsafeTheme.id };
    const { themes: inputThemes, ...inputNonTheme } = input;

    const parsed = parseProject(input);
    const { themes: parsedThemes, ...parsedNonTheme } = parsed;

    expect(inputThemes).toEqual([unsafeTheme]);
    expect(parsedNonTheme).toEqual(inputNonTheme);
    expect(parsedThemes).toEqual([sanitizeTheme(unsafeTheme as unknown as Theme)]);
    expect(parsedThemes[0]?.assets).toEqual(unsafeTheme.assets);
    expect(parsedThemes[0]).not.toHaveProperty("unknown");
    expect(parsedThemes[0]?.tokens).not.toHaveProperty("arbitraryCss");
    expect(parsedThemes[0]?.print).not.toHaveProperty("backgroundImage");
    expect(parsedThemes[0]?.style).not.toHaveProperty("css");
  });

  it("strips unknown fields, preserves inert assets, and constrains every style enum", () => {
    const unsafe = {
      ...customTheme("unsafe-theme"),
      injected: "<script>alert(1)</script>",
      assets: {
        cover: "https://example.com/cover.svg",
        background: "url(javascript:alert(1))",
      },
      tokens: {
        ...customTheme().tokens,
        accent: "#fff; background: url(javascript:alert(1))",
        headingFont: "url(https://example.com/font.woff2)",
        arbitraryCss: "position:fixed",
      },
      print: {
        accent: "#123456; color: red",
        paper: "#fffdf8",
        text: "#18161a",
        headingStyle: "<svg/onload=alert(1)>",
        backgroundImage: "url(https://example.com/image.png)",
      },
      style: {
        surface: "url(https://example.com/style.css)",
        elevation: "raised",
        ornament: "<svg/onload=alert(1)>",
        css: "display:none",
      },
    } as unknown as Theme;

    const sanitized = sanitizeTheme(unsafe);
    expect(Object.keys(sanitized).sort()).toEqual([
      "assets",
      "id",
      "name",
      "print",
      "style",
      "tokens",
    ]);
    expect(sanitized.assets).toEqual(unsafe.assets);
    expect(sanitized).not.toHaveProperty("injected");
    expect(sanitized.tokens).not.toHaveProperty("arbitraryCss");
    expect(sanitized.tokens.accent).toBe("#8f67ff");
    expect(sanitized.tokens.headingFont).toBeUndefined();
    expect(sanitized.print).toEqual({
      accent: "#694e98",
      paper: "#fffdf8",
      text: "#18161a",
      headingStyle: undefined,
    });
    expect(sanitized.style).toEqual({
      surface: "solid",
      elevation: "soft",
      ornament: "none",
    });
    expect(sanitizeTheme(sanitized)).toEqual(sanitized);
  });
});
