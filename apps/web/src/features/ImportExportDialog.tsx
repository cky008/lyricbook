import { DialogShell } from "@app/components/DialogShell";
import { createProjectArchive, importHttpsUrl, importProjectFile } from "@app/lib/archive";
import { downloadBlob, downloadText } from "@app/lib/download";
import { useI18n } from "@app/lib/i18n";
import { loadPreset, loadPresetIndex } from "@app/lib/presets";
import {
  activateBuiltInTheme,
  createBlankProject,
  createExportFilename,
  createId,
  getBuiltInTheme,
  getLocalized,
  type LyricBookProject,
  mergeProjectLyrics,
  migrateLegacyGemV4Backup,
  type PresetIndexEntry,
  parseProject,
  parseSetlistText,
  parseTheme,
  sanitizeStandaloneTheme,
  themesEqual,
  touchProject,
  type UiLocale,
} from "@domain/index";
import { Download, FileJson, Link, PackageOpen, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  presets: PresetIndexEntry[];
  appVersion: string;
  onReplace: (project: LyricBookProject, reason: string) => Promise<void>;
  onChange: (project: LyricBookProject) => void;
}

type ImportMessage = { kind: "success" | "error" | "info"; text: string } | null;
type PendingImport = { source: LyricBookProject; sourceName: string };

function looksLikeTheme(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && "id" in value && "tokens" in value && "name" in value,
  );
}

export function ImportExportDialog({
  open,
  onOpenChange,
  project,
  locale,
  presets,
  appVersion,
  onReplace,
  onChange,
}: ImportExportDialogProps) {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<ImportMessage>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const request = useRef(0);
  const latestProject = useRef(project);

  useEffect(() => {
    latestProject.current = project;
  }, [project]);

  useEffect(() => {
    if (!open) {
      request.current += 1;
      setPending(null);
      setBusy(false);
      setMessage(null);
    }
    return () => {
      request.current += 1;
    };
  }, [open]);

  const preview = useMemo(() => {
    if (!pending) return null;
    try {
      return mergeProjectLyrics(project, pending.source);
    } catch {
      return null;
    }
  }, [project, pending]);

  const close = (value: boolean) => {
    if (!value && applying) return;
    if (!value) request.current += 1;
    onOpenChange(value);
  };

  const importUnknown = async (value: unknown, sourceName: string, token: number) => {
    if (request.current !== token) return;
    if (typeof value === "string") {
      const parsed = parseSetlistText(value, project, locale, sourceName.replace(/\.[^.]+$/, ""));
      const next: LyricBookProject = {
        ...project,
        songs: [...project.songs, ...parsed.createdSongs],
        setlists: [...project.setlists, parsed.setlist],
        activeSetlistId: parsed.setlist.id,
      };
      onChange(next);
      setMessage({
        kind: "success",
        text: `${t("import-success")} ${t("new-songs")}: ${parsed.createdSongs.length}.`,
      });
      return;
    }

    const legacy = value as { format?: string };
    if (legacy?.format === "gem-lyricbook-backup-v4") {
      const availablePresets = presets.length ? presets : await loadPresetIndex();
      const gemEntry = availablePresets.find((entry) => entry.id === "gem-gloria");
      if (!gemEntry) throw new Error("G.E.M. metadata preset is unavailable");
      const migrated = migrateLegacyGemV4Backup(value, await loadPreset(gemEntry));
      if (!migrated) throw new Error("Unable to migrate the G.E.M. backup");
      if (request.current !== token) return;
      setPending({ source: parseProject(migrated), sourceName });
      return;
    }

    if (looksLikeTheme(value)) {
      let theme = parseTheme(value);
      const catalogTheme = getBuiltInTheme(theme.id);
      if (catalogTheme) {
        const projectVersion = project.themes.find((item) => item.id === theme.id);
        const projectHasCanonicalVersion = Boolean(
          projectVersion && themesEqual(projectVersion, catalogTheme),
        );
        if (themesEqual(theme, catalogTheme) && (!projectVersion || projectHasCanonicalVersion)) {
          onChange(activateBuiltInTheme(project, theme.id));
          setMessage({ kind: "success", text: t("import-success") });
          return;
        }
        theme = {
          ...theme,
          id: createId("theme", `${getLocalized(theme.name, locale)} custom`),
        };
      }
      const exists = project.themes.some((item) => item.id === theme.id);
      onChange({
        ...project,
        themes: exists
          ? project.themes.map((item) => (item.id === theme.id ? theme : item))
          : [...project.themes, theme],
        activeThemeId: theme.id,
      });
      setMessage({ kind: "success", text: t("import-success") });
      return;
    }

    const next = parseProject(value);
    setPending({ source: next, sourceName });
  };

  const applyImport = async (mode: "lyrics" | "replace") => {
    if (!pending || busy) return;
    if (mode === "replace" && !window.confirm(t("import-replace-confirm"))) return;
    const token = ++request.current;
    setBusy(true);
    setApplying(true);
    setMessage(null);
    try {
      const merged =
        mode === "lyrics" ? mergeProjectLyrics(latestProject.current, pending.source) : null;
      const next = merged ? touchProject(merged.project) : pending.source;
      await onReplace(
        next,
        `${mode === "lyrics" ? "Lyric merge" : "Project import"}: ${pending.sourceName}`,
      );
      if (request.current !== token) return;
      setPending(null);
      setMessage({
        kind: "success",
        text: merged
          ? t("import-merge-success", {
              updated: merged.report.updatedSongs,
              added: merged.report.addedSongs,
              skipped: merged.report.ambiguousSongs.length,
            })
          : t("import-success"),
      });
    } catch {
      if (request.current === token) setMessage({ kind: "error", text: t("import-failed") });
    } finally {
      setApplying(false);
      if (request.current === token) setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    const token = ++request.current;
    setBusy(true);
    setMessage(null);
    setPending(null);
    try {
      await importUnknown(await importProjectFile(file), file.name, token);
    } catch {
      if (request.current === token) setMessage({ kind: "error", text: t("import-failed") });
    } finally {
      if (request.current === token) {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    const token = ++request.current;
    setBusy(true);
    setMessage(null);
    setPending(null);
    try {
      await importUnknown(
        await importHttpsUrl(url.trim()),
        new URL(url.trim()).pathname.split("/").pop() || "remote",
        token,
      );
    } catch {
      if (request.current === token) setMessage({ kind: "error", text: t("import-failed") });
    } finally {
      if (request.current === token) setBusy(false);
    }
  };

  const exportArchive = () => {
    const archive = createProjectArchive(project, appVersion);
    downloadBlob(archive.blob, archive.filename);
    setMessage({ kind: "success", text: `${t("file-ready")}: ${archive.filename}` });
  };
  const exportJson = () => {
    const filename = createExportFilename(project.id, "json");
    downloadText(
      `${JSON.stringify(project, null, 2)}\n`,
      filename,
      "application/json;charset=utf-8",
    );
    setMessage({ kind: "success", text: `${t("file-ready")}: ${filename}` });
  };
  const exportTheme = () => {
    const theme = project.themes.find((item) => item.id === project.activeThemeId);
    if (!theme) return;
    const filename = createExportFilename(`${project.id}-${theme.id}`, "theme.json");
    downloadText(
      `${JSON.stringify(sanitizeStandaloneTheme(theme), null, 2)}\n`,
      filename,
      "application/json;charset=utf-8",
    );
    setMessage({ kind: "success", text: `${t("file-ready")}: ${filename}` });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={close}
      title={`${t("import")} / ${t("export")}`}
      description={t("privacy")}
      wide
      dismissible={!applying}
      footer={
        <button
          type="button"
          className="button primary"
          disabled={applying}
          onClick={() => close(false)}
        >
          {t("close")}
        </button>
      }
    >
      {applying ? (
        <p role="status" className="notice">
          {t("import-saving")}
        </p>
      ) : null}
      {message ? (
        <div
          role={message.kind === "error" ? "alert" : "status"}
          className={`notice${message.kind === "error" ? " error" : ""}`}
          style={{ marginBottom: 16 }}
        >
          {message.text}
        </div>
      ) : null}
      {pending ? (
        <section
          className="panel stack"
          aria-label={t("import-summary")}
          style={{ marginBottom: 16, overflowWrap: "anywhere" }}
        >
          <h3>{t("import-summary")}</h3>
          <p className="panel-copy">
            {getLocalized(pending.source.title, locale)} · {pending.sourceName}
          </p>
          <p className="panel-copy">{t("import-merge-help")}</p>
          {preview ? (
            <p role="status" className="notice">
              {t("import-merge-summary", {
                matched: preview.report.matchedSongs,
                updated: preview.report.updatedSongs,
                added: preview.report.addedSongs,
                skipped: preview.report.ambiguousSongs.length,
              })}
            </p>
          ) : (
            <p role="alert" className="notice error">
              {t("import-merge-unavailable")}
            </p>
          )}
          {preview?.report.ambiguousSongs.length ? (
            <details>
              <summary>{t("import-ambiguous-songs")}</summary>
              <ul>
                {preview.report.ambiguousSongs.map((id) => (
                  <li key={id}>
                    {getLocalized(
                      pending.source.songs.find((song) => song.id === id)?.titles,
                      locale,
                    ) || id}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <button
            type="button"
            className="button primary"
            disabled={busy || !preview}
            onClick={() => void applyImport("lyrics")}
          >
            {t("import-merge-lyrics")}
          </button>
          <p className="panel-copy">{t("import-replace-help")}</p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void applyImport("replace")}
          >
            {t("import-replace-project")}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => {
              setPending(null);
              setMessage(null);
            }}
          >
            {t("cancel")}
          </button>
        </section>
      ) : null}
      <div className="two-columns">
        <section className="panel stack">
          <div className="panel-heading">
            <h3>{t("preset")}</h3>
            <PackageOpen size={17} />
          </div>
          <p className="panel-copy">{t("built-in-presets-note")}</p>
          {presets.map((entry) => (
            <button
              type="button"
              className="button"
              key={entry.id}
              disabled={busy}
              onClick={async () => {
                const token = ++request.current;
                setBusy(true);
                setMessage(null);
                setPending(null);
                try {
                  const preset = await loadPreset(entry);
                  if (request.current !== token) return;
                  const merged = mergeProjectLyrics(preset, latestProject.current);
                  if (merged.report.ambiguousSongs.length) {
                    setMessage({
                      kind: "error",
                      text: t("load-preset-ambiguous", {
                        count: merged.report.ambiguousSongs.length,
                        songs: merged.report.ambiguousSongs
                          .map(
                            (id) =>
                              getLocalized(
                                latestProject.current.songs.find((song) => song.id === id)?.titles,
                                locale,
                              ) || id,
                          )
                          .join(" · "),
                      }),
                    });
                    return;
                  }
                  setApplying(true);
                  await onReplace(
                    touchProject(merged.project),
                    `Preset with retained lyrics: ${entry.id}`,
                  );
                  if (request.current === token)
                    setMessage({ kind: "success", text: t("load-preset-success") });
                } catch {
                  if (request.current === token)
                    setMessage({ kind: "error", text: t("import-failed") });
                } finally {
                  setApplying(false);
                  if (request.current === token) setBusy(false);
                }
              }}
            >
              {entry.title[locale === "zh-CN" ? "zh-Hans" : "en"] ??
                Object.values(entry.title)[0] ??
                entry.id}
            </button>
          ))}
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(t("confirm-clear"))) return;
              setBusy(true);
              setApplying(true);
              setMessage(null);
              setPending(null);
              try {
                await onReplace(createBlankProject(locale), "Blank project");
                setMessage({ kind: "success", text: t("blank-project-success") });
              } catch (error) {
                setMessage({
                  kind: "error",
                  text: error instanceof Error ? error.message : String(error),
                });
              } finally {
                setApplying(false);
                setBusy(false);
              }
            }}
          >
            <RotateCcw size={15} /> {t("blank-project")}
          </button>
        </section>
        <section className="panel stack">
          <div className="panel-heading">
            <h3>{t("import")}</h3>
            <Upload size={17} />
          </div>
          <p className="panel-copy">{t("upload-help")}</p>
          <div className="notice">{t("legacy-gem-import-note")}</div>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".lyricbook,.json,.md,.txt,application/json,text/plain,application/zip"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} /> {t("choose-file")}
          </button>
          <label className="field-label">
            {t("import-https-url")}
            <input
              className="field"
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              placeholder={t("url-placeholder")}
              inputMode="url"
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !url.trim()}
            onClick={() => void handleUrl()}
          >
            <Link size={15} /> {t("import-url")}
          </button>
          <div className="notice">{t("url-security")}</div>
        </section>
        <section className="panel stack">
          <div className="panel-heading">
            <h3>{t("export")}</h3>
            <Download size={17} />
          </div>
          <p className="panel-copy">{t("export-help")}</p>
          <button type="button" className="button primary" onClick={exportArchive}>
            <PackageOpen size={15} /> {t("export-project")}
          </button>
          <button type="button" className="button" onClick={exportJson}>
            <FileJson size={15} /> {t("export-json")}
          </button>
          <button type="button" className="button" onClick={exportTheme}>
            <Download size={15} /> {t("export-theme")}
          </button>
        </section>
        <section className="panel stack">
          <div className="panel-heading">
            <h3>{t("current-project")}</h3>
            <FileJson size={17} />
          </div>
          <div className="status-line">
            <span className="status-dot" /> {project.id}
          </div>
          <div className="panel-copy">{t("song-count", { count: project.songs.length })}</div>
          <div className="panel-copy">{t("setlist-count", { count: project.setlists.length })}</div>
          <div className="panel-copy">
            {t("source-count", { count: project.sources?.length ?? 0 })}
          </div>
          <div className="notice">{t("replace-warning")}</div>
        </section>
      </div>
    </DialogShell>
  );
}
