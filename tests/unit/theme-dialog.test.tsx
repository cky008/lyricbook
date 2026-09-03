import { ThemeDialog } from "@app/features/ThemeDialog";
import {
  createBlankProject,
  getBuiltInTheme,
  type LyricBookProject,
  type Theme,
} from "@domain/index";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/DialogShell", () => ({
  DialogShell: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <div aria-label={title} role="dialog">
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@app/lib/i18n", () => ({
  useI18n: () => ({
    t: (id: string, args?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        accent: "Accent",
        "body-font": "Reading type",
        "built-in-readonly": "Crafted themes are read-only.",
        "built-in-themes": "Crafted themes",
        "built-in-themes-help": "Five offline designs.",
        close: "Close",
        "copy-customize": "Copy and customize",
        "create-theme": "Create theme",
        "density-comfortable": "Comfortable",
        "density-compact": "Compact",
        "density-spacious": "Spacious",
        density: "Spacing",
        "font-sans": "Sans serif",
        "font-serif": "Serif",
        "heading-font": "Heading type",
        "heading-style": "Print heading",
        "my-themes": "Project themes",
        "my-themes-help": "Stored with this project.",
        "new-custom-theme": "New custom theme",
        "no-theme-settings": "Choose or create a theme to begin customizing.",
        ornament: "Ornament",
        "ornament-ink-wash": "Ink wash",
        "ornament-none": "None",
        "ornament-porcelain-line": "Porcelain line",
        "print-accent": "Print accent",
        "print-paper": "Paper",
        "print-settings": "Print palette",
        "print-text": "Print text",
        radius: "Radius",
        remove: "Remove",
        "remove-theme-confirm": "Remove this custom theme?",
        surface: "Surface",
        "surface-glass": "Translucent",
        "surface-solid": "Solid",
        "surface-strong": "Strong surface",
        "surface-style": "Surface style",
        text: "Text",
        theme: "Theme",
        "theme-active": "Active",
        "theme-color-picker": `${String(args?.label)} color picker`,
        "theme-color-value": `${String(args?.label)} value`,
        "theme-editor": "Theme editor",
        "theme-editor-description": "Choose a theme.",
        "theme-installed": "In project",
        "theme-name": "Theme name",
        "theme-project-version": "Project theme owns this ID",
        "theme-safety-note": "Safe local tokens only.",
        "theme-settings": "Theme settings",
        "theme-settings-help": "Edit the selected project copy.",
        "use-theme": "Use theme",
        "invalid-theme-color": "Enter a supported color.",
        "invalid-theme-length": "Enter a non-negative length.",
      };
      if (id === "custom-theme-name") return `${String(args?.name)} Custom`;
      return messages[id] ?? id;
    },
  }),
}));

function renderDialog(project = createBlankProject("en-US")) {
  const onChange = vi.fn<(next: LyricBookProject) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(
    <ThemeDialog
      open
      onOpenChange={onOpenChange}
      project={project}
      locale="en-US"
      onChange={onChange}
    />,
  );
  return { ...view, onChange, onOpenChange, project };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ThemeDialog gallery", () => {
  it("shows every crafted theme without modifying the project", () => {
    const project = createBlankProject("en-US");
    const snapshot = structuredClone(project);
    renderDialog(project);

    expect(screen.getByRole("button", { name: "Use theme: Studio Slate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    for (const name of ["Ink Jade", "Porcelain Blue", "Cinnabar Silk", "Moonlit Paper"]) {
      expect(screen.getByRole("button", { name: `Use theme: ${name}` })).toBeInTheDocument();
    }
    expect(project).toEqual(snapshot);
    expect(screen.getByRole("textbox", { name: "Theme name" })).toHaveValue("Default Night");
    expect(screen.queryByText("Crafted themes are read-only.")).not.toBeInTheDocument();
  });

  it("activates and stores a catalog theme once", async () => {
    const user = userEvent.setup();
    const { onChange, rerender, project } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Use theme: Porcelain Blue" }));

    const activated = onChange.mock.calls[0]?.[0];
    expect(activated?.activeThemeId).toBe("builtin-porcelain-blue");
    expect(activated?.themes.map((theme) => theme.id)).toEqual([
      "default",
      "builtin-porcelain-blue",
    ]);

    if (!activated) throw new Error("Expected an activated project");
    onChange.mockClear();
    rerender(
      <ThemeDialog
        open
        onOpenChange={() => undefined}
        project={activated}
        locale="en-US"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use theme: Porcelain Blue" }));
    expect(onChange.mock.calls[0]?.[0].themes).toHaveLength(2);
    expect(project.themes).toHaveLength(1);
  });

  it("copies catalog data into an independently editable custom theme", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Copy and customize: Ink Jade" }));

    const next = onChange.mock.calls[0]?.[0];
    expect(next?.themes).toHaveLength(2);
    expect(next?.activeThemeId).not.toBe("builtin-ink-jade");
    const copy = next?.themes.at(-1);
    expect(copy?.name.en).toBe("Ink Jade Custom");
    expect(copy?.tokens).toEqual(getBuiltInTheme("builtin-ink-jade")?.tokens);
    if (copy) copy.tokens.accent = "#000000";
    expect(getBuiltInTheme("builtin-ink-jade")?.tokens.accent).not.toBe("#000000");
  });

  it("keeps incomplete color input local until the user commits a valid token", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const custom = { ...source, id: "theme-custom", name: { en: "Editable" } };
    project.themes = [custom];
    project.activeThemeId = custom.id;
    const { onChange } = renderDialog(project);

    const accent = screen.getByRole("textbox", { name: "Accent value" });
    await user.clear(accent);
    await user.type(accent, "#123456");
    expect(accent).toHaveValue("#123456");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].themes[0]?.tokens.accent).toBe("#123456");
  });

  it("keeps invalid token drafts visible without replacing the saved project values", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const custom = { ...source, id: "theme-custom", name: { en: "Editable" } };
    project.themes = [custom];
    project.activeThemeId = custom.id;
    const { onChange } = renderDialog(project);

    const accent = screen.getByRole("textbox", { name: "Accent value" });
    await user.clear(accent);
    await user.type(accent, "not-a-color");
    await user.tab();
    expect(accent).toHaveValue("not-a-color");
    expect(accent).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a supported color.");
    expect(onChange).not.toHaveBeenCalled();
    expect(project.themes[0]?.tokens.accent).toBe(source.tokens.accent);

    await user.click(accent);
    await user.keyboard("{Escape}");
    expect(accent).toHaveValue(source.tokens.accent);
    expect(accent).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps an incomplete radius token editable until blur", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const custom = { ...source, id: "theme-custom", name: { en: "Editable" } };
    project.themes = [custom];
    project.activeThemeId = custom.id;
    const { onChange } = renderDialog(project);

    const radius = screen.getByRole("textbox", { name: "Radius" });
    await user.clear(radius);
    await user.type(radius, "1.5rem");
    expect(radius).toHaveValue("1.5rem");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange.mock.calls[0]?.[0].themes[0]?.tokens.radius).toBe("1.5rem");
  });

  it("rejects invalid radius tokens and exposes a field-specific error", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const custom = { ...source, id: "theme-custom", name: { en: "Editable" } };
    project.themes = [custom];
    project.activeThemeId = custom.id;
    const { onChange } = renderDialog(project);

    const radius = screen.getByRole("textbox", { name: "Radius" });
    await user.clear(radius);
    await user.type(radius, "calc(100% - 1px)");
    await user.keyboard("{Enter}");
    expect(radius).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-negative length.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resets local token drafts when the selected theme changes with equal saved values", async () => {
    const user = userEvent.setup();
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const first = { ...structuredClone(source), id: "theme-first", name: { en: "First" } };
    const second = { ...structuredClone(source), id: "theme-second", name: { en: "Second" } };
    const project = createBlankProject("en-US");
    project.themes = [first, second];
    project.activeThemeId = first.id;
    const { onChange, rerender } = renderDialog(project);

    const accent = screen.getByRole("textbox", { name: "Accent value" });
    const radius = screen.getByRole("textbox", { name: "Radius" });
    await user.clear(accent);
    await user.type(accent, "invalid-color");
    await user.clear(radius);
    await user.type(radius, "invalid-radius");

    rerender(
      <ThemeDialog
        open
        onOpenChange={() => undefined}
        project={{ ...project, activeThemeId: second.id }}
        locale="en-US"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Accent value" })).toHaveValue(second.tokens.accent);
    expect(screen.getByRole("textbox", { name: "Radius" })).toHaveValue(second.tokens.radius);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives the picker and exact value separate names and previews short hex colors", () => {
    const project = createBlankProject("en-US");
    project.themes[0] = {
      ...project.themes[0],
      tokens: { ...project.themes[0]?.tokens, accent: "#abc" },
    } as Theme;
    renderDialog(project);

    expect(screen.getByLabelText("Accent color picker")).toHaveValue("#aabbcc");
    expect(screen.getByRole("textbox", { name: "Accent value" })).toHaveValue("#abc");
  });

  it("shows an actionable empty state instead of an editor that cannot persist", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    project.themes = [];
    project.activeThemeId = "missing";
    const { onChange } = renderDialog(project);

    expect(screen.getByText("Choose or create a theme to begin customizing.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Theme name" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create theme" }));
    expect(onChange.mock.calls[0]?.[0].themes).toHaveLength(1);
    expect(onChange.mock.calls[0]?.[0].activeThemeId).toMatch(/^theme-/);
  });

  it("maps catalog density values to a visible spacing preset", () => {
    const project = createBlankProject("en-US");
    const source = getBuiltInTheme("builtin-ink-jade");
    if (!source) throw new Error("Expected the Ink Jade theme");
    const custom = { ...source, id: "theme-custom", name: { en: "Editable" } };
    project.themes = [custom];
    project.activeThemeId = custom.id;
    renderDialog(project);

    expect(screen.getByRole("combobox", { name: "Spacing" })).toHaveValue("1");
  });

  it("shows and preserves the effective glass surface for legacy themes without style data", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog(createBlankProject("en-US"));

    expect(screen.getByRole("combobox", { name: "Surface style" })).toHaveValue("glass");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ornament" }), "ink-wash");

    expect(onChange.mock.calls[0]?.[0].themes[0]?.style).toEqual({
      surface: "glass",
      elevation: "soft",
      ornament: "ink-wash",
    });
  });

  it("treats a project-owned built-in id collision as editable and removable", async () => {
    const user = userEvent.setup();
    const project = createBlankProject("en-US");
    const builtIn = getBuiltInTheme("builtin-moonlit-paper");
    if (!builtIn) throw new Error("Expected the Moonlit Paper theme");
    const collision: Theme = {
      ...builtIn,
      name: { en: "Private Moon" },
      tokens: {
        ...builtIn.tokens,
        accent: "#345678",
      },
    };
    project.themes.push(collision);
    project.activeThemeId = collision.id;
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { onChange } = renderDialog(project);

    const catalogButton = screen.getByRole("button", { name: "Use theme: Moonlit Paper" });
    expect(catalogButton).toBeDisabled();
    expect(catalogButton).toHaveAttribute("aria-pressed", "false");
    expect(catalogButton).toHaveAccessibleDescription("Project theme owns this ID");
    expect(screen.getByText("Project theme owns this ID")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy and customize: Moonlit Paper" }));
    const copied = onChange.mock.calls[0]?.[0].themes.at(-1);
    expect(copied?.tokens).toEqual(builtIn.tokens);
    expect(copied?.tokens.accent).not.toBe(collision.tokens.accent);
    onChange.mockClear();

    expect(screen.getByRole("textbox", { name: "Theme name" })).toHaveValue("Private Moon");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(confirm).toHaveBeenCalledWith("Remove this custom theme?");
    expect(onChange.mock.calls[0]?.[0].themes.map((theme) => theme.id)).toEqual(["default"]);
    expect(onChange.mock.calls[0]?.[0].activeThemeId).toBe("default");
  });

  it("recognizes a catalog theme when localized keys arrive in a different order", () => {
    const project = createBlankProject("en-US");
    const builtIn = getBuiltInTheme("builtin-ink-jade");
    if (!builtIn) throw new Error("Expected the Ink Jade theme");
    const reordered: Theme = {
      ...builtIn,
      name: { "zh-Hans": builtIn.name["zh-Hans"] ?? "墨玉", en: builtIn.name.en ?? "Ink Jade" },
    };
    project.themes = [reordered];
    project.activeThemeId = reordered.id;
    renderDialog(project);

    expect(screen.getByRole("button", { name: "Use theme: Ink Jade" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use theme: Ink Jade" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Crafted themes are read-only.")).toBeInTheDocument();
  });
});
