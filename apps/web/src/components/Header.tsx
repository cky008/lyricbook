import { type AppearanceMode, nextAppearance } from "@app/lib/appearance";
import { useI18n } from "@app/lib/i18n";
import type { UiLocale } from "@domain/index";
import {
  BookOpenText,
  CodeXml,
  Download,
  Languages,
  Menu,
  MonitorCog,
  Moon,
  MoreHorizontal,
  Palette,
  Printer,
  Rows3,
  Sun,
  Upload,
} from "lucide-react";
import { DropdownMenu, Tooltip } from "radix-ui";
import type { ReactNode } from "react";

interface HeaderProps {
  projectTitle: string;
  onMenu: () => void;
  onSetlist: () => void;
  onTheme: () => void;
  onImport: () => void;
  onExport: () => void;
  onPrint: () => void;
  onImmersive: () => void;
  appearance: AppearanceMode;
  onAppearanceChange: (mode: AppearanceMode) => void;
  canRead: boolean;
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={8}
          style={{
            zIndex: 220,
            border: "1px solid var(--lb-border)",
            borderRadius: 10,
            padding: "7px 9px",
            background: "var(--lb-surface-strong)",
            color: "var(--lb-text)",
            fontSize: 11,
            boxShadow: "0 12px 35px rgba(0,0,0,.28)",
          }}
        >
          {label}
          <Tooltip.Arrow style={{ fill: "var(--lb-surface-strong)" }} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Header({
  projectTitle,
  onMenu,
  onSetlist,
  onTheme,
  onImport,
  onExport,
  onPrint,
  onImmersive,
  appearance,
  onAppearanceChange,
  canRead,
}: HeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const toggleLocale = () => setLocale((locale === "zh-CN" ? "en-US" : "zh-CN") as UiLocale);
  const appearanceLabel = t(`appearance-${appearance}`);
  const moreActionsLabel = t("more-actions");
  const AppearanceIcon = appearance === "system" ? MonitorCog : appearance === "light" ? Sun : Moon;
  return (
    <Tooltip.Provider delayDuration={260}>
      <header className="app-header">
        <Tip label={t("open-menu")}>
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={onMenu}
            aria-label={t("open-menu")}
          >
            <Menu size={19} />
          </button>
        </Tip>
        <a className="brand" href="./" aria-label="LyricBook home">
          <span className="brand-mark">L</span>
          <span className="brand-copy">
            <span className="brand-title">{projectTitle || t("app-name")}</span>
            <span className="brand-subtitle">{t("app-tagline")}</span>
          </span>
        </a>
        <div className="header-spacer" />
        <div className="header-actions header-actions-desktop">
          <Tip label={t("setlist-editor")}>
            <button
              type="button"
              className="icon-button"
              onClick={onSetlist}
              aria-label={t("setlist-editor")}
            >
              <Rows3 size={18} />
            </button>
          </Tip>
          <Tip label={t("theme-editor")}>
            <button
              type="button"
              className="icon-button"
              onClick={onTheme}
              aria-label={t("theme-editor")}
            >
              <Palette size={18} />
            </button>
          </Tip>
          <Tip label={t("import")}>
            <button
              type="button"
              className="icon-button"
              onClick={onImport}
              aria-label={t("import")}
            >
              <Upload size={18} />
            </button>
          </Tip>
          <Tip label={t("export")}>
            <button
              type="button"
              className="icon-button"
              onClick={onExport}
              aria-label={t("export")}
            >
              <Download size={18} />
            </button>
          </Tip>
          <Tip label={t("print")}>
            <button type="button" className="icon-button" onClick={onPrint} aria-label={t("print")}>
              <Printer size={18} />
            </button>
          </Tip>
          <Tip label={t("immersive-mode")}>
            <button
              type="button"
              className="icon-button"
              onClick={onImmersive}
              disabled={!canRead}
              aria-label={t("immersive-mode")}
            >
              <BookOpenText size={18} />
            </button>
          </Tip>
          <Tip label={appearanceLabel}>
            <button
              type="button"
              className="icon-button"
              onClick={() => onAppearanceChange(nextAppearance(appearance))}
              aria-label={appearanceLabel}
            >
              <AppearanceIcon size={18} />
            </button>
          </Tip>
          <Tip label={t("language")}>
            <button
              type="button"
              className="icon-button"
              onClick={toggleLocale}
              aria-label={t("language")}
            >
              <Languages size={18} />
            </button>
          </Tip>
          <Tip label={t("github-star")}>
            <a
              className="icon-button"
              href="https://github.com/cky008/lyricbook"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("github-star")}
            >
              <CodeXml size={18} />
            </a>
          </Tip>
        </div>
        <div className="header-actions header-actions-mobile">
          <Tip label={t("print")}>
            <button type="button" className="icon-button" onClick={onPrint} aria-label={t("print")}>
              <Printer size={18} />
            </button>
          </Tip>
          <Tip label={t("immersive-mode")}>
            <button
              type="button"
              className="icon-button"
              onClick={onImmersive}
              disabled={!canRead}
              aria-label={t("immersive-mode")}
            >
              <BookOpenText size={18} />
            </button>
          </Tip>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={moreActionsLabel}
                title={moreActionsLabel}
              >
                <MoreHorizontal size={19} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="header-more-menu"
                align="end"
                sideOffset={8}
                collisionPadding={12}
              >
                <DropdownMenu.Item className="header-more-menu-item" onSelect={() => onSetlist()}>
                  <Rows3 size={16} />
                  <span>{t("setlist-editor")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="header-more-menu-item" onSelect={() => onTheme()}>
                  <Palette size={16} />
                  <span>{t("theme-editor")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="header-more-menu-separator" />
                <DropdownMenu.Item className="header-more-menu-item" onSelect={() => onImport()}>
                  <Upload size={16} />
                  <span>{t("import")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="header-more-menu-item" onSelect={() => onExport()}>
                  <Download size={16} />
                  <span>{t("export")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="header-more-menu-separator" />
                <DropdownMenu.Item
                  className="header-more-menu-item"
                  onSelect={() => onAppearanceChange(nextAppearance(appearance))}
                >
                  <AppearanceIcon size={16} />
                  <span>{appearanceLabel}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="header-more-menu-item" onSelect={toggleLocale}>
                  <Languages size={16} />
                  <span>{t("language")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="header-more-menu-separator" />
                <DropdownMenu.Item className="header-more-menu-item" asChild>
                  <a
                    href="https://github.com/cky008/lyricbook"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("github-star")}
                  >
                    <CodeXml size={16} />
                    <span>{t("github-star")}</span>
                  </a>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>
    </Tooltip.Provider>
  );
}
