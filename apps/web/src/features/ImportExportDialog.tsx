import { Download, FileJson, Link, PackageOpen, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  createBlankProject,
  createExportFilename,
  migrateLegacyGemV4Backup,
  parseProject,
  parseSetlistText,
  sanitizeTheme,
  type LyricBookProject,
  type PresetIndexEntry,
  type Theme,
  type UiLocale,
} from "@domain/index";
import { DialogShell } from "@app/components/DialogShell";
import { createProjectArchive, importHttpsUrl, importProjectFile } from "@app/lib/archive";
import { downloadBlob, downloadText } from "@app/lib/download";
import { useI18n } from "@app/lib/i18n";
import { loadPreset, loadPresetIndex } from "@app/lib/presets";

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

function isTheme(value: unknown): value is Theme {
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

  const importUnknown = async (value: unknown, sourceName: string) => {
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
      await onReplace(migrated, `Legacy G.E.M. import: ${sourceName}`);
      setMessage({
        kind: "success",
        text: `${t("import-success")} ${t("song-count", { count: migrated.songs.length })}`,
      });
      return;
    }

    if (isTheme(value)) {
      const theme = sanitizeTheme(value);
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
    await onReplace(next, `Project import: ${sourceName}`);
    setMessage({ kind: "success", text: t("import-success") });
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      await importUnknown(await importProjectFile(file), file.name);
    } catch (error) {
      setMessage({
        kind: "error",
        text: `${t("import-failed")} ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await importUnknown(
        await importHttpsUrl(url.trim()),
        new URL(url.trim()).pathname.split("/").pop() || "remote",
      );
    } catch (error) {
      setMessage({
        kind: "error",
        text: `${t("import-failed")} ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setBusy(false);
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
    downloadText(`${JSON.stringify(theme, null, 2)}\n`, filename, "application/json;charset=utf-8");
    setMessage({ kind: "success", text: `${t("file-ready")}: ${filename}` });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("import")} / ${t("export")}`}
      description={t("privacy")}
      wide
      footer={
        <button type="button" className="button primary" onClick={() => onOpenChange(false)}>
          {t("close")}
        </button>
      }
    >
      {message ? (
        <div
          className={`notice${message.kind === "error" ? " error" : ""}`}
          style={{ marginBottom: 16 }}
        >
          {message.text}
        </div>
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
                setBusy(true);
                setMessage(null);
                try {
                  await onReplace(await loadPreset(entry), `Preset: ${entry.id}`);
                  setMessage({ kind: "success", text: t("load-preset-success") });
                } catch (error) {
                  setMessage({
                    kind: "error",
                    text: error instanceof Error ? error.message : String(error),
                  });
                } finally {
                  setBusy(false);
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
              await onReplace(createBlankProject(locale), "Blank project");
              setMessage({ kind: "success", text: t("load-preset-success") });
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
