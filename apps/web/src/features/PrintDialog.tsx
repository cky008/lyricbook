import { DialogShell } from "@app/components/DialogShell";
import { PrintDocument } from "@app/components/PrintDocument";
import { useI18n } from "@app/lib/i18n";
import { processLocalCoverImage } from "@app/lib/localCover";
import { STORAGE_WARNING_EVENT, type StorageWarningDetail } from "@app/lib/storage";
import {
  auditRenderedPlan,
  type MeasuredPrintPlan,
  resolveRenderedDraft,
  waitForStableLayout,
} from "@app/print/measurement";
import type { LyricBookProject, PrintOptions, UiLocale } from "@domain/index";
import { createPrintPlan, type PrintPlan } from "@print/index";
import {
  BookOpen,
  FileImage,
  FileText,
  LoaderCircle,
  Printer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  currentSongId?: string;
  filteredSongIds: string[];
  selectedVersionBySong: Record<string, string>;
  onOptionsChange: (options: PrintOptions) => void;
}

type PreviewState =
  | { status: "idle" }
  | { status: "measuring"; requestId: number; draft: PrintPlan }
  | { status: "ready"; requestId: number; result: MeasuredPrintPlan }
  | { status: "unsafe"; requestId: number; result: MeasuredPrintPlan };

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
  lineFlow: "auto",
  coverMode: "generated",
};

function pageStyle(format: PrintOptions["format"]): string {
  return format === "booklet"
    ? "@page { size: A4 landscape; margin: 0; }"
    : format === "a5"
      ? "@page { size: A5 portrait; margin: 0; }"
      : "@page { size: A4 portrait; margin: 0; }";
}

function unsafeResult(plan: PrintPlan): MeasuredPrintPlan {
  return {
    plan,
    report: {
      safe: false,
      pages: [],
      issues: [
        {
          pageId: "print-document",
          code: "missing-page",
          message: "The printable layout could not be measured safely",
        },
      ],
    },
  };
}

function PrintMeasurementRun({
  draft,
  requestId,
  onComplete,
}: {
  draft: PrintPlan;
  requestId: number;
  onComplete: (requestId: number, result: MeasuredPrintPlan) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [candidate, setCandidate] = useState(draft);
  const [phase, setPhase] = useState<"resolve" | "verify">("resolve");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        if (phase === "resolve") {
          const resolved = await resolveRenderedDraft(root, draft, controller.signal);
          if (controller.signal.aborted) return;
          setCandidate(resolved);
          setPhase("verify");
          return;
        }
        const report = await auditRenderedPlan(root, candidate, controller.signal);
        if (!controller.signal.aborted) onComplete(requestId, { plan: candidate, report });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Print layout measurement failed", error);
        onComplete(requestId, unsafeResult(candidate));
      }
    };
    void run();
    return () => controller.abort();
  }, [candidate, draft, onComplete, phase, requestId]);

  return (
    <div aria-hidden="true" data-print-measurement-root ref={rootRef}>
      <PrintDocument plan={candidate} />
    </div>
  );
}

export function PrintDialog({
  open,
  onOpenChange,
  project,
  locale,
  currentSongId,
  filteredSongIds,
  selectedVersionBySong,
  onOptionsChange,
}: PrintDialogProps) {
  const { t } = useI18n();
  const [options, setOptions] = useState<PrintOptions>(() => ({
    ...DEFAULT_OPTIONS,
    ...project.preferences?.print,
  }));
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [printing, setPrinting] = useState(false);
  const [coverProcessing, setCoverProcessing] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverStorageWarning, setCoverStorageWarning] = useState(false);
  const requestIdRef = useRef(0);
  const coverRequestIdRef = useRef(0);
  const optionsVersionRef = useRef(0);
  const optionsRef = useRef(options);
  const projectRef = useRef(project);
  const openRef = useRef(open);
  optionsRef.current = options;
  projectRef.current = project;
  openRef.current = open;
  const portal = document.getElementById("print-portal");
  const result = preview.status === "ready" || preview.status === "unsafe" ? preview.result : null;
  const plan = result?.plan ?? null;
  const estimate = useMemo(() => {
    if (!plan) return null;
    return {
      pages: plan.pages.length,
      sheets: plan.format === "booklet" ? plan.bookletSheets.length : 0,
    };
  }, [plan]);
  const resetPreview = useCallback(() => {
    requestIdRef.current += 1;
    setPreview({ status: "idle" });
    setPrinting(false);
  }, []);

  useEffect(() => {
    if (open) return;
    requestIdRef.current += 1;
    coverRequestIdRef.current += 1;
    setPreview({ status: "idle" });
    setPrinting(false);
    setCoverProcessing(false);
  }, [open]);

  useEffect(() => {
    const onStorageWarning = (event: Event) => {
      const detail = (event as CustomEvent<StorageWarningDetail>).detail;
      if (detail?.code === "cover-omitted") setCoverStorageWarning(true);
    };
    window.addEventListener(STORAGE_WARNING_EVENT, onStorageWarning);
    return () => window.removeEventListener(STORAGE_WARNING_EVENT, onStorageWarning);
  }, []);

  useEffect(() => {
    const next = { ...DEFAULT_OPTIONS, ...project.preferences?.print };
    optionsRef.current = next;
    setOptions(next);
    setCoverError(null);
    setCoverStorageWarning(false);
    resetPreview();
  }, [project, resetPreview]);

  const replaceOptions = (next: PrintOptions, keepCoverRequest = false) => {
    if (!keepCoverRequest) {
      coverRequestIdRef.current += 1;
      setCoverProcessing(false);
    }
    optionsVersionRef.current += 1;
    optionsRef.current = next;
    setOptions(next);
    onOptionsChange(next);
    resetPreview();
  };
  const update = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    replaceOptions({ ...options, [key]: value });
  };
  const chooseCoverImage = async (file: File) => {
    const coverRequestId = coverRequestIdRef.current + 1;
    coverRequestIdRef.current = coverRequestId;
    const optionsVersion = optionsVersionRef.current;
    const startingProject = projectRef.current;
    const startingProjectId = startingProject.id;
    const isCurrentRequest = () =>
      coverRequestIdRef.current === coverRequestId &&
      optionsVersionRef.current === optionsVersion &&
      openRef.current &&
      projectRef.current === startingProject &&
      projectRef.current.id === startingProjectId;
    setCoverProcessing(true);
    setCoverError(null);
    setCoverStorageWarning(false);
    try {
      const coverImage = await processLocalCoverImage(file);
      if (!isCurrentRequest()) return;
      replaceOptions({ ...optionsRef.current, coverImage, coverMode: "image-with-text" }, true);
    } catch (error) {
      if (isCurrentRequest()) {
        setCoverError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (coverRequestIdRef.current === coverRequestId) setCoverProcessing(false);
    }
  };
  const build = () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const draft = createPrintPlan({
      project,
      options,
      locale,
      currentSongId,
      filteredSongIds,
      selectedVersionBySong,
    });
    setPreview({ status: "measuring", requestId, draft });
  };
  const completeMeasurement = useCallback((requestId: number, measured: MeasuredPrintPlan) => {
    setPreview((current) => {
      if (current.status !== "measuring" || current.requestId !== requestId) return current;
      return measured.report.safe
        ? { status: "ready", requestId, result: measured }
        : { status: "unsafe", requestId, result: measured };
    });
  }, []);
  const print = async () => {
    if (preview.status !== "ready" || !portal || printing) return;
    setPrinting(true);
    const controller = new AbortController();
    try {
      const report = await auditRenderedPlan(portal, preview.result.plan, controller.signal);
      if (!report.safe) {
        setPreview({
          status: "unsafe",
          requestId: preview.requestId,
          result: { plan: preview.result.plan, report },
        });
        return;
      }
      let style = document.getElementById("lyricbook-page-style") as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = "lyricbook-page-style";
        document.head.append(style);
      }
      style.textContent = pageStyle(preview.result.plan.format);
      await waitForStableLayout(portal, controller.signal);
      window.print();
    } catch (error) {
      console.error("Final print validation failed", error);
      setPreview({
        status: "unsafe",
        requestId: preview.requestId,
        result: unsafeResult(preview.result.plan),
      });
    } finally {
      setPrinting(false);
    }
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
            <button
              type="button"
              className="button"
              onClick={build}
              disabled={preview.status === "measuring" || printing}
            >
              <FileText size={15} />
              {preview.status === "measuring" ? t("measuring-preview") : t("build-preview")}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void print()}
              disabled={preview.status !== "ready" || printing}
            >
              <Printer size={15} /> {printing ? t("validating-print") : t("open-print-dialog")}
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
            <label className="field-label">
              {t("line-flow")}
              <select
                className="select"
                value={options.lineFlow}
                onChange={(event) =>
                  update("lineFlow", event.currentTarget.value as PrintOptions["lineFlow"])
                }
              >
                <option value="auto">{t("line-flow-auto")}</option>
                <option value="preserve">{t("line-flow-preserve")}</option>
                <option value="slash">{t("line-flow-slash")}</option>
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
                {options.includeCover ? (
                  <fieldset className="cover-settings">
                    <legend>{t("cover-style")}</legend>
                    <div className="cover-mode-grid">
                      {(
                        [
                          ["generated", "cover-generated"],
                          ["image", "cover-image-only"],
                          ["image-with-text", "cover-image-with-text"],
                        ] as const
                      ).map(([mode, label]) => (
                        <label className="cover-mode-option" key={mode}>
                          <input
                            type="radio"
                            name="cover-mode"
                            value={mode}
                            checked={options.coverMode === mode}
                            disabled={mode !== "generated" && !options.coverImage}
                            onChange={() => update("coverMode", mode)}
                          />
                          <span>{t(label)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="inline-actions">
                      <label className="button" aria-disabled={coverProcessing}>
                        {coverProcessing ? (
                          <LoaderCircle className="spin" size={15} aria-hidden="true" />
                        ) : (
                          <FileImage size={15} aria-hidden="true" />
                        )}
                        {coverProcessing ? t("cover-processing") : t("choose-cover-image")}
                        <input
                          className="visually-hidden"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={coverProcessing}
                          aria-label={t("choose-cover-image")}
                          onChange={(event) => {
                            const input = event.currentTarget;
                            const file = input.files?.[0];
                            input.value = "";
                            if (file) void chooseCoverImage(file);
                          }}
                        />
                      </label>
                      {options.coverImage ? (
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            replaceOptions({
                              ...options,
                              coverMode: "generated",
                              coverImage: undefined,
                            })
                          }
                        >
                          <Trash2 size={15} aria-hidden="true" /> {t("remove-cover-image")}
                        </button>
                      ) : null}
                    </div>
                    {options.coverImage ? (
                      <div className="status-line" role="status">
                        <span className="status-dot" />
                        {t("cover-ready")} · {options.coverImage.width} ×{" "}
                        {options.coverImage.height}
                      </div>
                    ) : (
                      <p className="panel-copy">{t("cover-local-help")}</p>
                    )}
                    {coverError ? (
                      <div className="notice error" role="alert">
                        {t("cover-invalid")}: {coverError}
                      </div>
                    ) : null}
                    {coverStorageWarning ? (
                      <div className="notice" role="status">
                        {t("cover-storage-fallback")}
                      </div>
                    ) : null}
                  </fieldset>
                ) : null}
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
            {preview.status === "idle" ? (
              <div className="print-preview-empty" role="status">
                <div>
                  <div className="print-preview-empty-page" aria-hidden="true">
                    <FileText size={34} strokeWidth={1.4} />
                  </div>
                  <h4>{t("preview-not-generated")}</h4>
                  <p>{t("preview-not-generated-help")}</p>
                </div>
              </div>
            ) : preview.status === "measuring" ? (
              <div
                className="print-preview-status"
                role="status"
                aria-busy="true"
                aria-live="polite"
              >
                <LoaderCircle className="spin" size={32} aria-hidden="true" />
                <strong>{t("measuring-preview")}</strong>
                <span className="panel-copy">{t("measuring-preview-help")}</span>
              </div>
            ) : (
              <>
                <div
                  className={preview.status === "unsafe" ? "notice error" : "status-line"}
                  role="status"
                  aria-live={preview.status === "unsafe" ? "assertive" : "polite"}
                >
                  {preview.status === "unsafe" ? (
                    <TriangleAlert size={16} aria-hidden="true" />
                  ) : (
                    <span className="status-dot" />
                  )}
                  <span>
                    {preview.status === "unsafe" ? t("preview-unsafe") : t("preview-ready")}
                    {preview.status === "unsafe" && preview.result.report.issues.length ? (
                      <span className="print-safety-issues">
                        {preview.result.report.issues.slice(0, 3).map((issue) => (
                          <span key={`${issue.pageId}:${issue.code}`}>
                            {issue.pageId}: {issue.message}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
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
                ) : null}
              </>
            )}
          </section>
        </div>
        {plan ? (
          <section className="modal-section">
            <div className="print-preview-shell">
              <PrintDocument plan={plan} idPrefix="preview" />
            </div>
          </section>
        ) : null}
      </DialogShell>
      {portal && open && preview.status === "measuring"
        ? createPortal(
            <PrintMeasurementRun
              draft={preview.draft}
              requestId={preview.requestId}
              onComplete={completeMeasurement}
            />,
            portal,
          )
        : null}
      {portal && open && plan ? createPortal(<PrintDocument plan={plan} />, portal) : null}
    </>
  );
}
