import { Copy, Palette, Plus, Trash2 } from "lucide-react";
import {
  createId,
  getLocalized,
  sanitizeTheme,
  type LyricBookProject,
  type Theme,
  type UiLocale,
} from "@domain/index";
import { DialogShell } from "@app/components/DialogShell";
import { useI18n } from "@app/lib/i18n";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  onChange: (project: LyricBookProject) => void;
}

export function ThemeDialog({ open, onOpenChange, project, locale, onChange }: ThemeDialogProps) {
  const { t } = useI18n();
  const languageKey = locale === "zh-CN" ? "zh-Hans" : "en";
  const theme =
    project.themes.find((item) => item.id === project.activeThemeId) ?? project.themes[0];
  const updateTheme = (next: Theme) =>
    onChange({
      ...project,
      themes: project.themes.map((item) => (item.id === next.id ? sanitizeTheme(next) : item)),
    });
  const copyTheme = () => {
    if (!theme) return;
    const id = createId("theme", `${getLocalized(theme.name, locale)} custom`);
    const next = structuredClone(theme);
    next.id = id;
    next.name = { ...next.name, [languageKey]: `${getLocalized(next.name, locale)} Custom` };
    onChange({ ...project, themes: [...project.themes, next], activeThemeId: id });
  };
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("theme-editor")}
      description={t("privacy")}
      footer={
        <button type="button" className="button primary" onClick={() => onOpenChange(false)}>
          {t("close")}
        </button>
      }
    >
      <section className="modal-section">
        <label className="field-label">
          {t("theme")}
          <select
            className="select"
            value={theme?.id ?? ""}
            onChange={(event) => onChange({ ...project, activeThemeId: event.currentTarget.value })}
          >
            {project.themes.map((item) => (
              <option value={item.id} key={item.id}>
                {getLocalized(item.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button type="button" className="button" onClick={copyTheme}>
            <Copy size={15} /> {t("copy")}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              const id = createId("theme", "custom");
              const next: Theme = {
                id,
                name: { [languageKey]: t("theme-editor") },
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
                },
                print: { accent: "#694e98", paper: "#fffdf8", text: "#18161a" },
              };
              onChange({ ...project, themes: [...project.themes, next], activeThemeId: id });
            }}
          >
            <Plus size={15} /> {t("create")}
          </button>
          {theme && project.themes.length > 1 ? (
            <button
              type="button"
              className="button danger"
              onClick={() => {
                const remaining = project.themes.filter((item) => item.id !== theme.id);
                onChange({ ...project, themes: remaining, activeThemeId: remaining[0]?.id });
              }}
            >
              <Trash2 size={15} /> {t("remove")}
            </button>
          ) : null}
        </div>
      </section>
      {theme ? (
        <section className="modal-section stack">
          <label className="field-label">
            {t("theme")}
            <input
              className="field"
              value={getLocalized(theme.name, locale)}
              onChange={(event) =>
                updateTheme({
                  ...theme,
                  name: { ...theme.name, [languageKey]: event.currentTarget.value },
                })
              }
            />
          </label>
          {(
            [
              ["accent", "accent"],
              ["accent2", "accent-two"],
              ["background", "background"],
              ["surface", "surface"],
              ["surfaceStrong", "surface-strong"],
              ["text", "text"],
              ["muted", "muted"],
            ] as const
          ).map(([key, label]) => {
            const value = theme.tokens[key] ?? "#888888";
            return (
              <label className="field-label" key={key}>
                {t(label)}
                <span className="color-field">
                  <input
                    type="color"
                    value={value.startsWith("#") ? value.slice(0, 7) : "#888888"}
                    onChange={(event) =>
                      updateTheme({
                        ...theme,
                        tokens: { ...theme.tokens, [key]: event.currentTarget.value },
                      })
                    }
                  />
                  <input
                    className="field"
                    value={value}
                    onChange={(event) =>
                      updateTheme({
                        ...theme,
                        tokens: { ...theme.tokens, [key]: event.currentTarget.value },
                      })
                    }
                  />
                </span>
              </label>
            );
          })}
          <label className="field-label">
            {t("radius")}
            <input
              className="field"
              value={theme.tokens.radius}
              onChange={(event) =>
                updateTheme({
                  ...theme,
                  tokens: { ...theme.tokens, radius: event.currentTarget.value },
                })
              }
            />
          </label>
          <div className="notice">
            <Palette size={15} style={{ display: "inline", marginRight: 7 }} />
            Themes accept safe design tokens only; JavaScript, arbitrary HTML, external CSS, and
            remote fonts are not allowed.
          </div>
        </section>
      ) : null}
    </DialogShell>
  );
}
