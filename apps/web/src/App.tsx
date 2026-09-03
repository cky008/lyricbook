import { DialogShell } from "@app/components/DialogShell";
import { Header } from "@app/components/Header";
import { ImmersiveReader } from "@app/components/ImmersiveReader";
import { SongEditor } from "@app/components/SongEditor";
import { SongReader } from "@app/components/SongReader";
import { SongSidebar } from "@app/components/SongSidebar";
import { ImportExportDialog } from "@app/features/ImportExportDialog";
import { PrintDialog } from "@app/features/PrintDialog";
import { SetlistDialog } from "@app/features/SetlistDialog";
import { ThemeDialog } from "@app/features/ThemeDialog";
import { useLyricBookProject } from "@app/hooks/useLyricBookProject";
import {
  APPEARANCE_STORAGE_KEY,
  type AppearanceMode,
  applyAppearance,
  storedAppearance,
} from "@app/lib/appearance";
import { useI18n } from "@app/lib/i18n";
import { loadPresetIndex } from "@app/lib/presets";
import {
  activeSetlist,
  currentVersionId,
  orderedSongIds,
  songTitle,
} from "@app/lib/projectHelpers";
import { forceReleaseScrollLocks } from "@app/lib/scrollLock";
import {
  createEmptySong,
  getLocalized,
  type LyricBookProject,
  type PresetIndexEntry,
  resolveActiveTheme,
  type Song,
  setlistSongIds,
} from "@domain/index";
import {
  BookOpenText,
  CheckCircle2,
  CodeXml,
  FileText,
  Info,
  ListMusic,
  Pencil,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import packageJson from "../../../package.json";

type DialogName = "setlist" | "theme" | "transfer" | "print" | "about" | null;

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function loadingView() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
      <div
        className="reader-card"
        style={{ minHeight: 0, width: "min(420px, calc(100vw - 32px))", textAlign: "center" }}
      >
        <span className="brand-mark" style={{ margin: "0 auto 18px" }}>
          L
        </span>
        <h1 className="reader-title" style={{ fontSize: 42 }}>
          LyricBook
        </h1>
        <p className="panel-copy">Loading your private project…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { locale, t } = useI18n();
  const projectState = useLyricBookProject(locale);
  const project = projectState.project;
  const [presets, setPresets] = useState<PresetIndexEntry[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>();
  const [readerMode, setReaderMode] = useState<"read" | "edit">("read");
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>(() => storedAppearance());

  useEffect(() => {
    loadPresetIndex()
      .then(setPresets)
      .catch((error) => console.error(error));
  }, []);

  const activeTheme = useMemo(() => {
    if (!project) return undefined;
    return resolveActiveTheme(project);
  }, [project]);

  useEffect(() => {
    if (!activeTheme) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyAppearance(activeTheme, appearance, media.matches);
    apply();
    if (appearance !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [activeTheme, appearance]);

  useEffect(() => {
    if (!project) return;
    if (selectedSongId && project.songs.some((song) => song.id === selectedSongId)) return;
    const preferred = project.preferences?.activeSongId;
    const first =
      preferred && project.songs.some((song) => song.id === preferred)
        ? preferred
        : (orderedSongIds(project)[0] ?? project.songs[0]?.id);
    setSelectedSongId(first);
  }, [project, selectedSongId]);

  useEffect(() => {
    if (!selectedSongId || !project || project.preferences?.activeSongId === selectedSongId) return;
    projectState.updateProject((current) => ({
      ...current,
      preferences: { ...current.preferences, activeSongId: selectedSongId },
    }));
  }, [project, projectState.updateProject, selectedSongId]);

  if (projectState.loading || !project) return loadingView();

  const orderedIds = orderedSongIds(project);
  const songIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const filteredSongs = project.songs
    .filter((song) => {
      const text = normalize([songTitle(song, locale), ...song.aliases, ...song.tags].join(" "));
      const queryMatches = !query.trim() || text.includes(normalize(query));
      const tagMatches =
        activeTags.length === 0 || activeTags.every((tag) => song.tags.includes(tag));
      return queryMatches && tagMatches;
    })
    .sort(
      (left, right) =>
        (songIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (songIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  const selectedSong = project.songs.find((song) => song.id === selectedSongId);
  const selectedVersion = selectedSong ? currentVersionId(project, selectedSong) : "";
  const liveSetlist = activeSetlist(project);
  const setlistIds = setlistSongIds(liveSetlist, true).filter((id) =>
    project.songs.some((song) => song.id === id),
  );
  const readingIds = setlistIds.length ? setlistIds : orderedIds;
  const readingIndex = selectedSongId ? readingIds.indexOf(selectedSongId) : -1;
  const previousSong =
    readingIndex > 0
      ? project.songs.find((song) => song.id === readingIds[readingIndex - 1])
      : undefined;
  const nextSong =
    readingIndex >= 0
      ? project.songs.find((song) => song.id === readingIds[readingIndex + 1])
      : undefined;
  const sequence =
    readingIndex >= 0 ? { current: readingIndex + 1, total: readingIds.length } : undefined;

  const update = (next: LyricBookProject) => projectState.updateProject(() => next);
  const updateSong = (nextSongValue: Song) =>
    projectState.updateProject((current) => ({
      ...current,
      songs: current.songs.map((song) => (song.id === nextSongValue.id ? nextSongValue : song)),
    }));
  const selectVersion = (id: string) => {
    if (!selectedSong) return;
    projectState.updateProject((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        activeVersionBySong: {
          ...current.preferences?.activeVersionBySong,
          [selectedSong.id]: id,
        },
      },
    }));
  };
  const selectSong = (id: string) => {
    setSelectedSongId(id);
    setReaderMode("read");
    setSidebarOpen(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const goPrevious = () => previousSong && selectSong(previousSong.id);
  const goNext = () => nextSong && selectSong(nextSong.id);
  const openDialog = (name: Exclude<DialogName, null>) => {
    setSidebarOpen(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setDialog(name)));
  };
  const closeDialog = () => {
    setDialog(null);
    window.requestAnimationFrame(() => window.requestAnimationFrame(forceReleaseScrollLocks));
  };
  const addSong = () => {
    const title = locale === "zh-CN" ? "新歌曲" : "New song";
    const song = createEmptySong(title, locale === "zh-CN" ? "zh-Hans" : "en");
    projectState.updateProject((current) => ({ ...current, songs: [...current.songs, song] }));
    setSelectedSongId(song.id);
    setReaderMode("edit");
    setSidebarOpen(false);
  };
  const deleteSelectedSong = () => {
    if (!selectedSong || !window.confirm(t("confirm-delete-song"))) return;
    projectState.updateProject((current) => ({
      ...current,
      songs: current.songs.filter((song) => song.id !== selectedSong.id),
      setlists: current.setlists.map((setlist) => ({
        ...setlist,
        items: setlist.items.filter(
          (item) => item.type !== "song" || item.songId !== selectedSong.id,
        ),
      })),
    }));
    setSelectedSongId(project.songs.find((song) => song.id !== selectedSong.id)?.id);
    setReaderMode("read");
  };

  const sidebarProps = {
    songs: filteredSongs,
    selectedSongId,
    locale,
    query,
    onQueryChange: setQuery,
    activeTags,
    onToggleTag: (tag: string) =>
      setActiveTags((current) =>
        current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
      ),
    onClearTags: () => setActiveTags([]),
    onSelectSong: selectSong,
    onAddSong: addSong,
    onTransfer: () => openDialog("transfer"),
  };

  return (
    <div className="app-shell">
      <Header
        projectTitle={getLocalized(project.title, locale)}
        onMenu={() => setSidebarOpen(true)}
        onSetlist={() => openDialog("setlist")}
        onTheme={() => openDialog("theme")}
        onImport={() => openDialog("transfer")}
        onExport={() => openDialog("transfer")}
        onPrint={() => openDialog("print")}
        onImmersive={() => setImmersive(true)}
        appearance={appearance}
        onAppearanceChange={(mode) => {
          localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
          setAppearance(mode);
        }}
        canRead={Boolean(selectedSong)}
      />
      <div className="app-grid">
        <SongSidebar {...sidebarProps} />
        <main className="main-content">
          <div className="workspace">
            <section style={{ minWidth: 0 }}>
              {projectState.error ? (
                <div className="notice error" style={{ marginBottom: 14 }}>
                  {projectState.error}
                </div>
              ) : null}
              {selectedSong ? (
                readerMode === "read" ? (
                  <SongReader
                    song={selectedSong}
                    locale={locale}
                    selectedVersionId={selectedVersion}
                    onSelectVersion={selectVersion}
                    onEdit={() => setReaderMode("edit")}
                    onImmersive={() => setImmersive(true)}
                    previousSong={previousSong}
                    nextSong={nextSong}
                    onPrevious={goPrevious}
                    onNext={goNext}
                    sequence={sequence}
                  />
                ) : (
                  <SongEditor
                    song={selectedSong}
                    locale={locale}
                    selectedVersionId={selectedVersion}
                    onSelectVersion={selectVersion}
                    onChange={updateSong}
                    onRead={() => setReaderMode("read")}
                    onDelete={deleteSelectedSong}
                  />
                )
              ) : (
                <div className="empty-card" style={{ padding: 36, textAlign: "center" }}>
                  <BookOpenText size={42} style={{ margin: "0 auto 14px" }} />
                  <h1>{t("no-songs")}</h1>
                  <button type="button" className="button primary" onClick={addSong}>
                    {t("add-song")}
                  </button>
                </div>
              )}
            </section>
            <aside className="side-panels">
              <section className="panel stack">
                <div className="panel-heading">
                  <h2>{t("active-setlist")}</h2>
                  <ListMusic size={17} />
                </div>
                <strong>{getLocalized(liveSetlist?.title, locale) || t("new-setlist")}</strong>
                <div className="panel-copy">
                  {liveSetlist?.status ?? "draft"} · {setlistIds.length} {t("all-songs")}
                </div>
                <div className="setlist-mini">
                  {readingIds
                    .slice(Math.max(0, readingIndex - 2), Math.max(0, readingIndex - 2) + 7)
                    .map((id, index) => {
                      const song = project.songs.find((item) => item.id === id);
                      if (!song) return null;
                      return (
                        <button
                          type="button"
                          className={`setlist-mini-row${id === selectedSongId ? " current" : ""}`}
                          onClick={() => selectSong(id)}
                          key={id}
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <span>{songTitle(song, locale)}</span>
                        </button>
                      );
                    })}
                </div>
                <button type="button" className="button" onClick={() => openDialog("setlist")}>
                  <Pencil size={15} /> {t("setlist-editor")}
                </button>
              </section>
              <section className="panel stack">
                <div className="panel-heading">
                  <h2>{t("project")}</h2>
                  <FileText size={17} />
                </div>
                <label className="field-label">
                  {t("project-title")}
                  <input
                    className="field"
                    value={getLocalized(project.title, locale)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      const language = locale === "zh-CN" ? "zh-Hans" : "en";
                      projectState.updateProject((current) => ({
                        ...current,
                        title: {
                          ...current.title,
                          [language]: value,
                        },
                      }));
                    }}
                  />
                </label>
                <label className="field-label">
                  {t("project-description")}
                  <textarea
                    className="textarea"
                    style={{ minHeight: 100 }}
                    value={getLocalized(project.description, locale)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      const language = locale === "zh-CN" ? "zh-Hans" : "en";
                      projectState.updateProject((current) => ({
                        ...current,
                        description: {
                          ...current.description,
                          [language]: value,
                        },
                      }));
                    }}
                  />
                </label>
                <div className="status-line">
                  <span className="status-dot" />
                  {projectState.saving ? t("saving") : t("saved-local")}
                </div>
              </section>
              <section className="panel stack">
                <div className="panel-heading">
                  <h2>{t("privacy")}</h2>
                  <ShieldCheck size={17} />
                </div>
                <div className="panel-copy">{t("privacy")}</div>
                <div className="inline-actions">
                  <span className="badge">
                    <CheckCircle2 size={12} /> {t("local-first")}
                  </span>
                  <span className="badge">
                    <CheckCircle2 size={12} /> {t("no-backend")}
                  </span>
                  <span className="badge">
                    <CheckCircle2 size={12} /> {t("offline-ready")}
                  </span>
                </div>
              </section>
              <section className="panel stack">
                <div className="panel-heading">
                  <h2>{t("about")}</h2>
                  <Info size={17} />
                </div>
                <p className="panel-copy">{t("about-copy")}</p>
                <button type="button" className="button" onClick={() => openDialog("about")}>
                  <Sparkles size={15} /> {t("about")}
                </button>
                <a
                  className="button"
                  href="https://github.com/cky008/lyricbook"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CodeXml size={15} /> {t("github-star")}
                </a>
              </section>
            </aside>
          </div>
        </main>
      </div>
      <SongSidebar
        {...sidebarProps}
        mobile
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {selectedSong && immersive ? (
        <ImmersiveReader
          song={selectedSong}
          locale={locale}
          selectedVersionId={selectedVersion}
          previousSong={previousSong}
          nextSong={nextSong}
          onPrevious={goPrevious}
          onNext={goNext}
          onClose={() => setImmersive(false)}
          sequence={sequence}
        />
      ) : null}
      <SetlistDialog
        open={dialog === "setlist"}
        onOpenChange={(value) => (value ? setDialog("setlist") : closeDialog())}
        project={project}
        locale={locale}
        onChange={update}
      />
      <ThemeDialog
        open={dialog === "theme"}
        onOpenChange={(value) => (value ? setDialog("theme") : closeDialog())}
        project={project}
        locale={locale}
        onChange={update}
      />
      <ImportExportDialog
        open={dialog === "transfer"}
        onOpenChange={(value) => (value ? setDialog("transfer") : closeDialog())}
        project={project}
        locale={locale}
        presets={presets}
        appVersion={packageJson.version}
        onReplace={projectState.replaceProject}
        onChange={update}
      />
      <PrintDialog
        open={dialog === "print"}
        onOpenChange={(value) => (value ? setDialog("print") : closeDialog())}
        project={project}
        locale={locale}
        currentSongId={selectedSongId}
        filteredSongIds={filteredSongs.map((song) => song.id)}
        selectedVersionBySong={project.preferences?.activeVersionBySong ?? {}}
        onOptionsChange={(print) =>
          projectState.updateProject((current) => ({
            ...current,
            preferences: { ...current.preferences, print },
          }))
        }
      />
      <DialogShell
        open={dialog === "about"}
        onOpenChange={(value) => (value ? setDialog("about") : closeDialog())}
        title="LyricBook"
        description={`v${packageJson.version}`}
        footer={
          <button type="button" className="button primary" onClick={closeDialog}>
            {t("close")}
          </button>
        }
      >
        <div className="stack">
          <p className="panel-copy">{t("about-copy")}</p>
          <div className="notice">{t("copyright-note")}</div>
          <a
            className="button"
            href="https://github.com/cky008/lyricbook"
            target="_blank"
            rel="noopener noreferrer"
          >
            <CodeXml size={15} /> {t("open-repository")}
          </a>
          <a
            className="button"
            href="https://github.com/cky008/lyricbook/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Info size={15} /> {t("report-issue")}
          </a>
        </div>
      </DialogShell>
    </div>
  );
}
