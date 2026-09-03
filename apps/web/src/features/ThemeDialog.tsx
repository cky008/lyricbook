import { DialogShell } from "@app/components/DialogShell";
import { type InterfaceStyle, themeColorPreview } from "@app/lib/appearance";
import { useI18n } from "@app/lib/i18n";
import {
  activateBuiltInTheme,
  BUILT_IN_THEMES,
  createId,
  getBuiltInTheme,
  getLocalized,
  isSafeThemeColorToken,
  isSafeThemeLengthToken,
  type LyricBookProject,
  resolveActiveTheme,
  sanitizeTheme,
  type Theme,
  themesEqual,
  type UiLocale,
} from "@domain/index";
import {
  Check,
  Copy,
  Flower2,
  LayoutPanelTop,
  Palette,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  onChange: (project: LyricBookProject) => void;
  interfaceStyle: InterfaceStyle;
  onInterfaceStyleChange: (style: InterfaceStyle) => void;
}

interface ColorFieldProps {
  errorMessage: string;
  label: string;
  pickerLabel: string;
  scopeKey: string;
  value: string;
  valueLabel: string;
  onChange: (value: string) => void;
}

function ColorField({
  errorMessage,
  label,
  pickerLabel,
  scopeKey,
  value,
  valueLabel,
  onChange,
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  const [showError, setShowError] = useState(false);
  const fieldId = useId();
  const pickerId = `${fieldId}-picker`;
  const valueId = `${fieldId}-value`;
  const errorId = `${fieldId}-error`;

  useEffect(() => {
    void scopeKey;
    setDraft(value);
    setShowError(false);
  }, [scopeKey, value]);

  const commit = () => {
    if (!isSafeThemeColorToken(draft)) {
      setShowError(true);
      return;
    }
    setShowError(false);
    if (draft !== value) onChange(draft.trim());
  };
  const preview = themeColorPreview(value) ?? "#888888";

  return (
    <div className="field-label theme-token-field">
      <span>{label}</span>
      <span className="color-field">
        <label className="visually-hidden" htmlFor={pickerId}>
          {pickerLabel}
        </label>
        <input
          id={pickerId}
          type="color"
          value={preview}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft(next);
            setShowError(false);
            onChange(next);
          }}
        />
        <label className="visually-hidden" htmlFor={valueId}>
          {valueLabel}
        </label>
        <input
          id={valueId}
          className="field"
          value={draft}
          aria-describedby={showError ? errorId : undefined}
          aria-invalid={showError ? "true" : undefined}
          onBlur={commit}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setShowError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              setShowError(false);
            }
          }}
        />
      </span>
      {showError ? (
        <span className="field-error" id={errorId} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}

interface TokenFieldProps {
  errorMessage: string;
  label: string;
  scopeKey: string;
  value: string;
  onChange: (value: string) => void;
}

function TokenField({ errorMessage, label, scopeKey, value, onChange }: TokenFieldProps) {
  const [draft, setDraft] = useState(value);
  const [showError, setShowError] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  useEffect(() => {
    void scopeKey;
    setDraft(value);
    setShowError(false);
  }, [scopeKey, value]);

  const commit = () => {
    if (!isSafeThemeLengthToken(draft)) {
      setShowError(true);
      return;
    }
    setShowError(false);
    if (draft !== value) onChange(draft.trim());
  };

  return (
    <label className="field-label">
      {label}
      <input
        className="field"
        value={draft}
        aria-describedby={showError ? errorId : undefined}
        aria-invalid={showError ? "true" : undefined}
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setShowError(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            setShowError(false);
          }
        }}
      />
      {showError ? (
        <span className="field-error" id={errorId} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </label>
  );
}

function densityPreset(value: number | undefined): "0.88" | "1" | "1.18" {
  if ((value ?? 1) <= 0.92) return "0.88";
  if ((value ?? 1) >= 1.12) return "1.18";
  return "1";
}

export function ThemeDialog({
  open,
  onOpenChange,
  project,
  locale,
  onChange,
  interfaceStyle,
  onInterfaceStyleChange,
}: ThemeDialogProps) {
  const { t } = useI18n();
  const languageKey = locale === "zh-CN" ? "zh-Hans" : "en";
  const theme =
    project.themes.find((item) => item.id === project.activeThemeId) ??
    project.themes[0] ??
    resolveActiveTheme(project);
  const catalogTheme = getBuiltInTheme(theme.id);
  const isCanonicalBuiltIn = Boolean(catalogTheme && themesEqual(theme, catalogTheme));
  const hasProjectTheme = project.themes.some((item) => item.id === theme.id);

  const updateTheme = (next: Theme) =>
    onChange({
      ...project,
      themes: project.themes.map((item) => (item.id === next.id ? sanitizeTheme(next) : item)),
    });

  const copyAsCustom = (source: Theme) => {
    const sourceName = getLocalized(source.name, locale);
    const id = createId("theme", `${sourceName} custom`);
    const next = sanitizeTheme(structuredClone(source));
    next.id = id;
    next.name = {
      ...next.name,
      [languageKey]: t("custom-theme-name", { name: sourceName }),
    };
    onChange({ ...project, themes: [...project.themes, next], activeThemeId: id });
  };

  const createTheme = () => {
    const source = BUILT_IN_THEMES[0] ?? theme;
    const id = createId("theme", "custom");
    const next = sanitizeTheme(structuredClone(source));
    next.id = id;
    next.name = { [languageKey]: t("new-custom-theme") };
    onChange({ ...project, themes: [...project.themes, next], activeThemeId: id });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("theme-editor")}
      description={t("theme-editor-description")}
      wide
      footer={
        <button type="button" className="button primary" onClick={() => onOpenChange(false)}>
          {t("close")}
        </button>
      }
    >
      <section
        className="modal-section interface-style-section"
        aria-labelledby="interface-style-heading"
      >
        <div className="theme-section-heading">
          <div>
            <h3 id="interface-style-heading">{t("interface-style")}</h3>
            <p id="interface-style-help">{t("interface-style-help")}</p>
          </div>
          <LayoutPanelTop size={18} aria-hidden="true" />
        </div>
        <div
          className="interface-style-options"
          role="radiogroup"
          aria-labelledby="interface-style-heading"
          aria-describedby="interface-style-help"
        >
          {(
            [
              {
                value: "studio",
                label: t("interface-style-studio"),
                help: t("interface-style-studio-help"),
                Icon: LayoutPanelTop,
              },
              {
                value: "garden",
                label: t("interface-style-garden"),
                help: t("interface-style-garden-help"),
                Icon: Flower2,
              },
            ] satisfies Array<{
              value: InterfaceStyle;
              label: string;
              help: string;
              Icon: typeof LayoutPanelTop;
            }>
          ).map(({ value, label, help, Icon }) => {
            const helpId = `interface-style-${value}-help`;
            const active = interfaceStyle === value;
            return (
              <label
                className="interface-style-card"
                data-active={active ? "true" : "false"}
                key={value}
              >
                <input
                  type="radio"
                  name="interface-style"
                  value={value}
                  checked={active}
                  aria-describedby={helpId}
                  onChange={() => onInterfaceStyleChange(value)}
                />
                <span
                  className={`interface-style-preview interface-style-preview-${value}`}
                  aria-hidden="true"
                >
                  <span className="interface-style-preview-copy" />
                </span>
                <span className="interface-style-card-copy">
                  <strong className="interface-style-card-title">
                    <Icon size={16} aria-hidden="true" /> {label}
                  </strong>
                  <span className="interface-style-card-description" id={helpId}>
                    {help}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="modal-section theme-catalog-section" aria-labelledby="built-in-themes">
        <div className="theme-section-heading">
          <div>
            <h3 id="built-in-themes">{t("built-in-themes")}</h3>
            <p>{t("built-in-themes-help")}</p>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="theme-gallery">
          {BUILT_IN_THEMES.map((builtIn) => {
            const installed = project.themes.some((item) => item.id === builtIn.id);
            const projectVersion = project.themes.find((item) => item.id === builtIn.id);
            const collision = Boolean(projectVersion && !themesEqual(projectVersion, builtIn));
            const active = project.activeThemeId === builtIn.id && !collision;
            const name = getLocalized(builtIn.name, locale);
            return (
              <article
                className="theme-card"
                data-active={active ? "true" : "false"}
                data-theme-id={builtIn.id}
                key={builtIn.id}
              >
                <button
                  type="button"
                  className="theme-card-select"
                  aria-label={`${t("use-theme")}: ${name}`}
                  aria-describedby={`theme-status-${builtIn.id}`}
                  aria-pressed={active}
                  disabled={collision}
                  onClick={() => onChange(activateBuiltInTheme(project, builtIn.id))}
                >
                  <span className="theme-swatches" aria-hidden="true">
                    <span style={{ background: builtIn.tokens.background }} />
                    <span style={{ background: builtIn.tokens.surface }} />
                    <span style={{ background: builtIn.tokens.accent }} />
                    <span style={{ background: builtIn.tokens.accent2 }} />
                    <span style={{ background: builtIn.print?.paper }} />
                  </span>
                  <span className="theme-card-title">
                    <strong>{name}</strong>
                    <span id={`theme-status-${builtIn.id}`}>
                      {active ? <Check size={14} aria-hidden="true" /> : null}
                      {active
                        ? t("theme-active")
                        : collision
                          ? t("theme-project-version")
                          : installed
                            ? t("theme-installed")
                            : t("use-theme")}
                    </span>
                  </span>
                  <span className="theme-card-meta">
                    <span>
                      {t(builtIn.tokens.headingFont === "sans" ? "font-sans" : "font-serif")}
                    </span>
                    <span>
                      {t(
                        (builtIn.tokens.density ?? 1) <= 0.92
                          ? "density-compact"
                          : (builtIn.tokens.density ?? 1) >= 1.12
                            ? "density-spacious"
                            : "density-comfortable",
                      )}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="button ghost theme-card-copy"
                  aria-label={`${t("copy-customize")}: ${name}`}
                  onClick={() => copyAsCustom(builtIn)}
                >
                  <Copy size={14} aria-hidden="true" /> {t("copy-customize")}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="modal-section" aria-labelledby="my-themes">
        <div className="theme-section-heading">
          <div>
            <h3 id="my-themes">{t("my-themes")}</h3>
            <p>{t("my-themes-help")}</p>
          </div>
          <Palette size={18} aria-hidden="true" />
        </div>
        <div className="theme-project-actions">
          <label className="field-label">
            {t("theme")}
            <select
              className="select"
              value={project.themes.some((item) => item.id === theme.id) ? theme.id : ""}
              onChange={(event) =>
                onChange({ ...project, activeThemeId: event.currentTarget.value })
              }
            >
              {project.themes.length === 0 ? (
                <option value="" disabled>
                  {t("no-project-themes")}
                </option>
              ) : null}
              {project.themes.map((item) => (
                <option value={item.id} key={item.id}>
                  {getLocalized(item.name, locale)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" onClick={createTheme}>
            <Plus size={15} aria-hidden="true" /> {t("create-theme")}
          </button>
          <button type="button" className="button" onClick={() => copyAsCustom(theme)}>
            <Copy size={15} aria-hidden="true" /> {t("copy-customize")}
          </button>
          {!isCanonicalBuiltIn && project.themes.length > 1 ? (
            <button
              type="button"
              className="button danger"
              onClick={() => {
                if (!window.confirm(t("remove-theme-confirm"))) return;
                const remaining = project.themes.filter((item) => item.id !== theme.id);
                onChange({
                  ...project,
                  themes: remaining,
                  activeThemeId: remaining[0]?.id,
                });
              }}
            >
              <Trash2 size={15} aria-hidden="true" /> {t("remove")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="modal-section stack" aria-labelledby="theme-settings">
        <div className="theme-section-heading">
          <div>
            <h3 id="theme-settings">{t("theme-settings")}</h3>
            <p>{t("theme-settings-help")}</p>
          </div>
        </div>
        {!hasProjectTheme ? (
          <div className="notice theme-empty-settings">
            <Palette size={15} aria-hidden="true" />
            <span>{t("no-theme-settings")}</span>
          </div>
        ) : isCanonicalBuiltIn ? (
          <div className="notice theme-readonly-note">
            <Palette size={15} aria-hidden="true" />
            <span>{t("built-in-readonly")}</span>
            <button type="button" className="button" onClick={() => copyAsCustom(theme)}>
              <Copy size={14} aria-hidden="true" /> {t("copy-customize")}
            </button>
          </div>
        ) : (
          <>
            <div className="theme-settings-grid">
              <label className="field-label theme-field-wide">
                {t("theme-name")}
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
              <label className="field-label">
                {t("heading-font")}
                <select
                  className="select"
                  value={theme.tokens.headingFont ?? "serif"}
                  onChange={(event) =>
                    updateTheme({
                      ...theme,
                      tokens: {
                        ...theme.tokens,
                        headingFont: event.currentTarget.value as "serif" | "sans",
                      },
                    })
                  }
                >
                  <option value="serif">{t("font-serif")}</option>
                  <option value="sans">{t("font-sans")}</option>
                </select>
              </label>
              <label className="field-label">
                {t("body-font")}
                <select
                  className="select"
                  value={theme.tokens.bodyFont ?? "sans"}
                  onChange={(event) =>
                    updateTheme({
                      ...theme,
                      tokens: {
                        ...theme.tokens,
                        bodyFont: event.currentTarget.value as "serif" | "sans",
                      },
                    })
                  }
                >
                  <option value="serif">{t("font-serif")}</option>
                  <option value="sans">{t("font-sans")}</option>
                </select>
              </label>
              <label className="field-label">
                {t("density")}
                <select
                  className="select"
                  value={densityPreset(theme.tokens.density)}
                  onChange={(event) =>
                    updateTheme({
                      ...theme,
                      tokens: { ...theme.tokens, density: Number(event.currentTarget.value) },
                    })
                  }
                >
                  <option value="0.88">{t("density-compact")}</option>
                  <option value="1">{t("density-comfortable")}</option>
                  <option value="1.18">{t("density-spacious")}</option>
                </select>
              </label>
              <label className="field-label">
                {t("surface-style")}
                <select
                  className="select"
                  value={theme.style?.surface ?? "glass"}
                  onChange={(event) =>
                    updateTheme({
                      ...theme,
                      style: {
                        surface: event.currentTarget.value as "solid" | "glass",
                        elevation: theme.style?.elevation ?? "soft",
                        ornament: theme.style?.ornament ?? "none",
                      },
                    })
                  }
                >
                  <option value="solid">{t("surface-solid")}</option>
                  <option value="glass">{t("surface-glass")}</option>
                </select>
              </label>
              <label className="field-label">
                {t("ornament")}
                <select
                  className="select"
                  value={theme.style?.ornament ?? "none"}
                  onChange={(event) =>
                    updateTheme({
                      ...theme,
                      style: {
                        surface: theme.style?.surface ?? "glass",
                        elevation: theme.style?.elevation ?? "soft",
                        ornament: event.currentTarget.value as
                          | "none"
                          | "ink-wash"
                          | "porcelain-line",
                      },
                    })
                  }
                >
                  <option value="none">{t("ornament-none")}</option>
                  <option value="ink-wash">{t("ornament-ink-wash")}</option>
                  <option value="porcelain-line">{t("ornament-porcelain-line")}</option>
                </select>
              </label>
              <TokenField
                errorMessage={t("invalid-theme-length")}
                label={t("radius")}
                scopeKey={theme.id}
                value={theme.tokens.radius}
                onChange={(value) =>
                  updateTheme({
                    ...theme,
                    tokens: { ...theme.tokens, radius: value },
                  })
                }
              />
            </div>

            <div className="theme-color-grid">
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
              ).map(([key, label]) => (
                <ColorField
                  errorMessage={t("invalid-theme-color")}
                  label={t(label)}
                  pickerLabel={t("theme-color-picker", { label: t(label) })}
                  scopeKey={theme.id}
                  value={theme.tokens[key] ?? "#888888"}
                  valueLabel={t("theme-color-value", { label: t(label) })}
                  key={key}
                  onChange={(value) =>
                    updateTheme({
                      ...theme,
                      tokens: { ...theme.tokens, [key]: value },
                    })
                  }
                />
              ))}
            </div>

            <div className="theme-print-settings">
              <h3>{t("print-settings")}</h3>
              <div className="theme-color-grid">
                <ColorField
                  errorMessage={t("invalid-theme-color")}
                  label={t("print-accent")}
                  pickerLabel={t("theme-color-picker", { label: t("print-accent") })}
                  scopeKey={theme.id}
                  value={theme.print?.accent ?? theme.tokens.accent}
                  valueLabel={t("theme-color-value", { label: t("print-accent") })}
                  onChange={(value) =>
                    updateTheme({ ...theme, print: { ...theme.print, accent: value } })
                  }
                />
                <ColorField
                  errorMessage={t("invalid-theme-color")}
                  label={t("print-paper")}
                  pickerLabel={t("theme-color-picker", { label: t("print-paper") })}
                  scopeKey={theme.id}
                  value={theme.print?.paper ?? "#fffdf8"}
                  valueLabel={t("theme-color-value", { label: t("print-paper") })}
                  onChange={(value) =>
                    updateTheme({ ...theme, print: { ...theme.print, paper: value } })
                  }
                />
                <ColorField
                  errorMessage={t("invalid-theme-color")}
                  label={t("print-text")}
                  pickerLabel={t("theme-color-picker", { label: t("print-text") })}
                  scopeKey={theme.id}
                  value={theme.print?.text ?? "#18161a"}
                  valueLabel={t("theme-color-value", { label: t("print-text") })}
                  onChange={(value) =>
                    updateTheme({ ...theme, print: { ...theme.print, text: value } })
                  }
                />
                <label className="field-label">
                  {t("heading-style")}
                  <select
                    className="select"
                    value={theme.print?.headingStyle ?? "editorial"}
                    onChange={(event) =>
                      updateTheme({
                        ...theme,
                        print: {
                          ...theme.print,
                          headingStyle: event.currentTarget.value as
                            | "editorial"
                            | "modern"
                            | "classic",
                        },
                      })
                    }
                  >
                    <option value="editorial">{t("heading-editorial")}</option>
                    <option value="modern">{t("heading-modern")}</option>
                    <option value="classic">{t("heading-classic")}</option>
                  </select>
                </label>
              </div>
            </div>
          </>
        )}
        <div className="notice theme-safety-note">
          <Palette size={15} aria-hidden="true" />
          <span>{t("theme-safety-note")}</span>
        </div>
      </section>
    </DialogShell>
  );
}
