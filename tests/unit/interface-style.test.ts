import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyInterfaceStyle,
  INTERFACE_STYLE_STORAGE_KEY,
  initializeInterfaceStyle,
  type InterfaceStyle,
  persistInterfaceStyle,
  storedInterfaceStyle,
} from "@app/lib/appearance";
import { afterEach, describe, expect, it, vi } from "vitest";

const supportedStyles: InterfaceStyle[] = ["studio", "garden"];

afterEach(() => {
  document.documentElement.removeAttribute("data-interface-style");
});

describe("browser-local interface style", () => {
  it("uses a dedicated storage key and accepts only studio or garden", () => {
    const getItem = vi.fn<(key: string) => string | null>().mockReturnValue(null);

    expect(INTERFACE_STYLE_STORAGE_KEY).toBe("lyricbook-interface-style");
    expect(storedInterfaceStyle({ getItem })).toBe("studio");
    expect(getItem).toHaveBeenCalledWith(INTERFACE_STYLE_STORAGE_KEY);

    for (const style of supportedStyles) {
      expect(storedInterfaceStyle({ getItem: () => style })).toBe(style);
    }
    for (const invalid of ["", "dark", "default", "garden ", "javascript:alert(1)"]) {
      expect(storedInterfaceStyle({ getItem: () => invalid })).toBe("studio");
    }
  });

  it("falls back safely when browser storage cannot be read or written", () => {
    expect(
      storedInterfaceStyle({
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
      }),
    ).toBe("studio");

    expect(
      persistInterfaceStyle("garden", {
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      }),
    ).toBe(false);
  });

  it("persists the exact supported value without touching project data", () => {
    const setItem = vi.fn<(key: string, value: string) => void>();

    persistInterfaceStyle("garden", { setItem });

    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith(INTERFACE_STYLE_STORAGE_KEY, "garden");
    expect(persistInterfaceStyle("studio", { setItem })).toBe(true);
  });

  it("initializes a supplied root before React mounts", () => {
    const target = document.createElement("html");

    expect(initializeInterfaceStyle({ getItem: () => "garden" }, target)).toBe("garden");
    expect(target).toHaveAttribute("data-interface-style", "garden");
  });

  it("applies the sanitized choice to the document root data attribute", () => {
    expect(applyInterfaceStyle("garden")).toBe("garden");
    expect(document.documentElement).toHaveAttribute("data-interface-style", "garden");

    expect(applyInterfaceStyle("unknown" as InterfaceStyle)).toBe("studio");
    expect(document.documentElement).toHaveAttribute("data-interface-style", "studio");
  });

  it("keeps Garden Editorial CSS out of the print portal and print token namespace", () => {
    const css = readFileSync(
      path.join(process.cwd(), "apps/web/src/styles/interface-garden.css"),
      "utf8",
    );

    expect(css).toMatch(/:root\[data-interface-style=["']?garden["']?\]/);
    expect(css).not.toMatch(
      /\.print-|#print-portal|\[data-print-document|\.booklet-sheet|--print-/,
    );
  });
});
