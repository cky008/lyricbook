import { describe, expect, it } from "vitest";
import type { Theme } from "@domain/index";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  nextAppearance,
  resolveAppearance,
  storedAppearance,
} from "@app/lib/appearance";

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
  },
  print: {
    accent: "#694e98",
    paper: "#fffdf8",
    text: "#18161a",
  },
};

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

  it("applies safe light and dark tokens to the document", () => {
    const target = document.createElement("div");
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    expect(applyAppearance(theme, "light", false, target)).toBe("light");
    expect(target.dataset.appearance).toBe("light");
    expect(target.dataset.resolvedAppearance).toBe("light");
    expect(target.style.getPropertyValue("--lb-background")).toBe("#fffdf8");
    expect(target.style.getPropertyValue("--lb-text")).toBe("#18161a");
    expect(meta.content).toBe("#fffdf8");

    expect(applyAppearance(theme, "dark", false, target)).toBe("dark");
    expect(target.style.getPropertyValue("--lb-background")).toBe("#17132b");
    expect(target.style.getPropertyValue("--lb-text")).toBe("#f9f7ff");
    expect(meta.content).toBe("#17132b");

    meta.remove();
  });
});
