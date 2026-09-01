import { BookOpen, FileText, Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import type { LyricBookProject, PrintOptions, UiLocale } from "@domain/index";
import { createPrintPlan, type PrintPlan } from "@print/index";
import { DialogShell } from "@app/components/DialogShell";
import { PrintDocument } from "@app/components/PrintDocument";
import { useI18n } from "@app/lib/i18n";

interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  currentSongId?: string;
  filteredSongIds: string[];
  selectedVersionBySong: Record<string, string>;
}

const DEFAULT_OPTIONS: PrintOptions = {
  format: "a4",
  scope: "active-setlist",
  versionMode: "default",
  languageMode: "original-translation",
  strategy: "balanced",
  includeOptional: true,
  includeEmptySongs: false,
  includeSources: false,
  includeTableOfContents: true,
  includeCover: true,
};

function pageStyle(format: PrintOptions["format"]): string {
  return format === "booklet"
    ? "@page { size: A4 landscape; margin: 0; }"
    : format === "a5"
      ? "@page { size: A5 portrait; margin: 0; }"
      : "@page { size: A4 portrait; margin: 0; }";
}

export function PrintDialog({
  open,
  onOpenChange,
  project,
  locale,
  currentSongId,
  filteredSongIds,
  selectedVersionBySong,
}: PrintDialogProps) {
  const { t } = useI18n();
  const [options, setOptions] = useState<PrintOptions>(() => ({
    ...DEFAULT_OPTIONS,
    ...project.preferences?.print,
  }));
  const [plan, setPlan] = useState<PrintPlan | null>(null);
  const portal = document.getElementById("print-portal");
  const estimate = useMemo(() => {
    if (!plan) return null;
    return {
      pages: plan.pages.length,
      sheets: plan.format === "booklet" ? plan.bookletSheets.length : 0,
    };
  }, [plan]);
  const update = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setPlan(null);
  };
  const build = () => {
    setPlan(
      createPrintPlan({
        project,
        options,
        locale,
        currentSongId,
        filteredSongIds,
        selectedVersionBySong,
      }),
    );
  };
  const print = () => {
    if (!plan) return;
    let style = document.getElementById("lyricbook-page-style") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "lyricbook-page-style";
      document.head.append(style);
    }
    style.textContent = pageStyle(plan.format);
    window.setTimeout(() => window.print(), 60);
  };

  return (
    <>
      <DialogShell
        open={open}
        onOpenChange={onOpenChange}
        title={t("print")}
        description={t("print-help")}
        wide
        footer={
          <>
            <button type="button" className="button" onClick={build}>
              <FileText size={15} /> {t("build-preview")}
            </button>
            <button type="button" className="button primary" onClick={print} disabled={!plan}>
              <Printer size={15} /> {t("open-print-dialog")}
            </button>
          </>
        }
      >
        <div className="two-columns">
          <section className="panel stack">
            <label className="field-label">
              {t("select-format")}
              <select
                className="select"
                value={options.format}
                onChange={(event) =>
                  update("format", event.currentTarget.value as PrintOptions["format"])
                }
              >
                <option value="a4">{t("format-a4")}</option>
                <option value="a5">{t("format-a5")}</option>
                <option value="booklet">{t("format-booklet")}</option>
              </select>
            </label>
            <label className="field-label">
              {t("print-scope")}
              <select
                className="select"
                value={options.scope}
                onChange={(event) =>
                  update("scope", event.currentTarget.value as PrintOptions["scope"])
                }
              >
                <option value="current-song">{t("current-song")}</option>
                <option value="active-setlist">{t("active-setlist")}</option>
                <option value="filtered">{t("current-filter")}</option>
                <option value="library">{t("complete-library")}</option>
              </select>
            </label>
            <label className="field-label">
              {t("version-output")}
              <select
                className="select"
                value={options.versionMode}
                onChange={(event) =>
                  update("versionMode", event.currentTarget.value as PrintOptions["versionMode"])
                }
              >
                <option value="default">{t("default-only")}</option>
                <option value="current">{t("current-version")}</option>
                <option value="all">{t("all-versions")}</option>
              </select>
            </label>
            <label className="field-label">
              {t("language-output")}
              <select
                className="select"
                value={options.languageMode}
                onChange={(event) =>
                  update("languageMode", event.currentTarget.value as PrintOptions["languageMode"])
                }
              >
                <option value="original">{t("original-only")}</option>
                <option value="original-translation">{t("original-translation")}</option>
                <option value="all-tracks">{t("all-tracks")}</option>
              </select>
            </label>
            <label className="field-label">
              {t("print-strategy")}
              <select
                className="select"
                value={options.strategy}
                onChange={(event) =>
                  update("strategy", event.currentTarget.value as PrintOptions["strategy"])
                }
              >
                <option value="balanced">{t("balanced")}</option>
                <option value="readable">{t("readable")}</option>
                <option value="compact">{t("compact")}</option>
                <option value="strict-page-limit">{t("strict-page-limit")}</option>
              </select>
            </label>
            {(
              [
                ["includeOptional", "include-optional"],
                ["includeEmptySongs", "include-empty"],
                ["includeTableOfContents", "include-toc"],
              ] as const
            ).map(([key, label]) => (
              <label className="status-line" key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(event) => update(key, event.currentTarget.checked)}
                />
                {t(label)}
              </label>
            ))}
            {options.format === "booklet" ? (
              <>
                <label className="status-line">
                  <input
                    type="checkbox"
                    checked={options.includeCover}
                    onChange={(event) => update("includeCover", event.currentTarget.checked)}
                  />
                  {t("include-cover")}
                </label>
                <div className="notice">
                  <BookOpen size={15} style={{ display: "inline", marginRight: 7 }} />
                  {t("booklet-help")}
                </div>
              </>
            ) : null}
            <div className="notice">{t("print-disclaimer")}</div>
          </section>
          <section className="panel stack">
            <div className="panel-heading">
              <h3>{t("layout")}</h3>
              <Printer size={17} />
            </div>
            {estimate ? (
              <>
                <div className="status-line">
                  <span className="status-dot" />
                  {t("page-count")}: {estimate.pages}
                </div>
                {plan?.format === "booklet" ? (
                  <div className="status-line">
                    <span className="status-dot" />
                    {t("sheet-count")}: {estimate.sheets}
                  </div>
                ) : null}
                {plan?.format === "booklet" && plan.bookletSheets[0] ? (
                  <div className="notice">
                    {t("booklet-preview")}: {plan.bookletSheets[0].front.join(" | ")} /{" "}
                    {plan.bookletSheets[0].back.join(" | ")}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="notice">{t("build-preview")}</div>
            )}
          </section>
        </div>
        {plan ? (
          <section className="modal-section">
            <div className="print-preview-shell">
              <PrintDocument plan={plan} />
            </div>
          </section>
        ) : null}
      </DialogShell>
      {portal && plan ? createPortal(<PrintDocument plan={plan} />, portal) : null}
    </>
  );
}
