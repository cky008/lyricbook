import { DialogShell } from "@app/components/DialogShell";
import { useI18n } from "@app/lib/i18n";
import {
  applySetlistMarkdown,
  createId,
  getLocalized,
  type LyricBookProject,
  type Setlist,
  type SetlistItem,
  serializeSetlistMarkdown,
  type UiLocale,
} from "@domain/index";
import { ArrowDown, ArrowUp, Braces, ListTree, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface SetlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  onChange: (project: LyricBookProject) => void;
}

function itemIdentity(item: SetlistItem): string {
  if (item.type === "song") {
    return `song:${item.songId}:${item.optional ? "optional" : "required"}`;
  }
  if (item.type === "section") {
    return `section:${item.id ?? JSON.stringify(item.label)}`;
  }
  if (item.type === "note") return `note:${JSON.stringify(item.text)}`;
  return `break:${JSON.stringify(item.label ?? {})}`;
}

function keyedItems(items: SetlistItem[]): Array<{ item: SetlistItem; key: string }> {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const identity = itemIdentity(item);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { item, key: `${identity}:${occurrence}` };
  });
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [value] = next.splice(from, 1);
  if (value !== undefined) next.splice(to, 0, value);
  return next;
}

export function SetlistDialog({
  open,
  onOpenChange,
  project,
  locale,
  onChange,
}: SetlistDialogProps) {
  const { t } = useI18n();
  const languageKey = locale === "zh-CN" ? "zh-Hans" : "en";
  const [sectionDraft, setSectionDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [songDraft, setSongDraft] = useState("");
  const [setlistDraft, setSetlistDraft] = useState("");
  const [editorMode, setEditorMode] = useState<"structured" | "markdown">("structured");
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownSetlistId, setMarkdownSetlistId] = useState<string>();
  const [markdownDirty, setMarkdownDirty] = useState(false);
  const [markdownFeedback, setMarkdownFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();
  const setlist =
    project.setlists.find((item) => item.id === project.activeSetlistId) ?? project.setlists[0];
  const songMap = useMemo(
    () => new Map(project.songs.map((song) => [song.id, song])),
    [project.songs],
  );
  const setlistItems = useMemo(() => keyedItems(setlist?.items ?? []), [setlist?.items]);

  useEffect(() => {
    if (!open || !setlist || markdownSetlistId === setlist.id) return;
    setMarkdownDraft(serializeSetlistMarkdown(setlist, project, locale));
    setMarkdownSetlistId(setlist.id);
    setMarkdownDirty(false);
    setMarkdownFeedback(undefined);
  }, [locale, markdownSetlistId, open, project, setlist]);

  const updateSetlist = (updater: (setlist: Setlist) => Setlist) => {
    if (!setlist) return;
    onChange({
      ...project,
      setlists: project.setlists.map((item) => (item.id === setlist.id ? updater(item) : item)),
    });
  };

  const addItem = (item: SetlistItem) =>
    updateSetlist((current) => ({ ...current, items: [...current.items, item] }));
  const setItems = (items: SetlistItem[]) => updateSetlist((current) => ({ ...current, items }));

  const resetMarkdown = () => {
    if (!setlist) return;
    setMarkdownDraft(serializeSetlistMarkdown(setlist, project, locale));
    setMarkdownSetlistId(setlist.id);
    setMarkdownDirty(false);
    setMarkdownFeedback(undefined);
  };
  const discardMarkdown = (): boolean => {
    if (!markdownDirty || window.confirm(t("discard-markdown-confirm"))) {
      resetMarkdown();
      return true;
    }
    return false;
  };
  const chooseMode = (mode: "structured" | "markdown") => {
    if (mode === editorMode) return;
    if (editorMode === "markdown" && markdownDirty && !discardMarkdown()) return;
    if (mode === "markdown" && !markdownDirty) resetMarkdown();
    setEditorMode(mode);
  };
  const applyMarkdown = () => {
    if (!setlist) return;
    try {
      const result = applySetlistMarkdown(markdownDraft, project, setlist.id, locale);
      onChange(result.project);
      const updated = result.project.setlists.find((item) => item.id === setlist.id);
      if (updated) setMarkdownDraft(serializeSetlistMarkdown(updated, result.project, locale));
      setMarkdownDirty(false);
      setMarkdownFeedback({
        kind: "success",
        message: result.createdSongs.length
          ? t("markdown-applied-new-songs", { count: result.createdSongs.length })
          : t("markdown-applied"),
      });
    } catch (error) {
      setMarkdownFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const requestOpenChange = (value: boolean) => {
    if (!value && editorMode === "markdown" && markdownDirty && !discardMarkdown()) return;
    onOpenChange(value);
  };
  const changeActiveSetlist = (id: string) => {
    if (!id || id === setlist?.id) return;
    if (editorMode === "markdown" && markdownDirty && !discardMarkdown()) return;
    onChange({ ...project, activeSetlistId: id });
  };
  const createSetlist = () => {
    const title = setlistDraft.trim();
    if (!title) return;
    if (editorMode === "markdown" && markdownDirty && !discardMarkdown()) return;
    const id = createId("setlist", title);
    onChange({
      ...project,
      setlists: [
        ...project.setlists,
        { id, title: { [languageKey]: title }, status: "draft", items: [] },
      ],
      activeSetlistId: id,
    });
    setSetlistDraft("");
  };
  const removeActiveSetlist = () => {
    if (!setlist || project.setlists.length <= 1) return;
    if (editorMode === "markdown" && markdownDirty && !discardMarkdown()) return;
    const remaining = project.setlists.filter((item) => item.id !== setlist.id);
    onChange({ ...project, setlists: remaining, activeSetlistId: remaining[0]?.id });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={requestOpenChange}
      title={t("setlist-editor")}
      description={t("setlist-description")}
      wide
      footer={
        <button type="button" className="button primary" onClick={() => requestOpenChange(false)}>
          {t("close")}
        </button>
      }
    >
      <section className="modal-section">
        <div className="two-columns">
          <label className="field-label">
            {t("active-setlist")}
            <select
              className="select"
              value={setlist?.id ?? ""}
              onChange={(event) => changeActiveSetlist(event.currentTarget.value)}
            >
              {project.setlists.map((item) => (
                <option value={item.id} key={item.id}>
                  {getLocalized(item.title, locale) || item.id}
                </option>
              ))}
            </select>
          </label>
          {setlist ? (
            <label className="field-label">
              {t("status")}
              <select
                className="select"
                value={setlist.status}
                onChange={(event) => {
                  const status = event.currentTarget.value;
                  updateSetlist((current) => ({ ...current, status }));
                }}
              >
                {["official", "observed", "prediction", "rotation", "draft", "archive"].map(
                  (status) => (
                    <option value={status} key={status}>
                      {status}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : null}
        </div>
        {setlist ? (
          <label className="field-label" style={{ marginTop: 12 }}>
            {t("setlist-title")}
            <input
              className="field"
              value={getLocalized(setlist.title, locale)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateSetlist((current) => ({
                  ...current,
                  title: { ...current.title, [languageKey]: value },
                }));
              }}
            />
          </label>
        ) : null}
      </section>
      <section className="modal-section">
        <h3>{t("new-setlist")}</h3>
        <div className="inline-actions">
          <input
            className="field"
            style={{ flex: 1, minWidth: 190 }}
            value={setlistDraft}
            onChange={(event) => setSetlistDraft(event.currentTarget.value)}
            placeholder={t("setlist-title")}
          />
          <button type="button" className="button" onClick={createSetlist}>
            <Plus size={15} /> {t("create")}
          </button>
          {setlist && project.setlists.length > 1 ? (
            <button type="button" className="button danger" onClick={removeActiveSetlist}>
              <Trash2 size={15} /> {t("remove")}
            </button>
          ) : null}
        </div>
      </section>
      {setlist ? (
        <>
          <section className="modal-section">
            <div aria-label={t("setlist-editor-mode")} className="version-tabs" role="tablist">
              <button
                aria-controls="setlist-structured-panel"
                aria-selected={editorMode === "structured"}
                className={`tab-button${editorMode === "structured" ? " active" : ""}`}
                id="setlist-structured-tab"
                onClick={() => chooseMode("structured")}
                role="tab"
                type="button"
              >
                <ListTree size={14} /> {t("structured-editor")}
              </button>
              <button
                aria-controls="setlist-markdown-panel"
                aria-selected={editorMode === "markdown"}
                className={`tab-button${editorMode === "markdown" ? " active" : ""}`}
                id="setlist-markdown-tab"
                onClick={() => chooseMode("markdown")}
                role="tab"
                type="button"
              >
                <Braces size={14} /> {t("markdown-editor")}
              </button>
            </div>
          </section>
          {editorMode === "structured" ? (
            <div
              aria-labelledby="setlist-structured-tab"
              id="setlist-structured-panel"
              role="tabpanel"
            >
              <section className="modal-section">
                <h3>{t("setlist")}</h3>
                <div className="setlist-editor-list">
                  {setlistItems.map(({ item, key }, index) => {
                    const song = item.type === "song" ? songMap.get(item.songId) : undefined;
                    const label =
                      item.type === "song"
                        ? getLocalized(song?.titles, locale) || item.songId
                        : item.type === "section"
                          ? getLocalized(item.label, locale)
                          : item.type === "note"
                            ? getLocalized(item.text, locale)
                            : t("break");
                    return (
                      <div
                        className={`setlist-editor-row${item.type === "section" ? " section" : ""}`}
                        key={key}
                      >
                        <span className="song-number">{String(index + 1).padStart(2, "0")}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="song-title">{label}</div>
                          <div className="song-meta">
                            {item.type}
                            {item.type === "song" && item.optional ? ` · ${t("optional")}` : ""}
                          </div>
                          {item.type === "song" ? (
                            <label className="status-line" style={{ marginTop: 7 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(item.optional)}
                                onChange={(event) => {
                                  const optional = event.currentTarget.checked;
                                  setItems(
                                    setlist.items.map((value, itemIndex) =>
                                      itemIndex === index && value.type === "song"
                                        ? { ...value, optional }
                                        : value,
                                    ),
                                  );
                                }}
                              />
                              {t("optional")}
                            </label>
                          ) : null}
                        </div>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="mini-button"
                            onClick={() => setItems(move(setlist.items, index, index - 1))}
                            disabled={index === 0}
                            aria-label={t("move-up")}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="mini-button"
                            onClick={() => setItems(move(setlist.items, index, index + 1))}
                            disabled={index === setlist.items.length - 1}
                            aria-label={t("move-down")}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="mini-button"
                            onClick={() =>
                              setItems(setlist.items.filter((_, itemIndex) => itemIndex !== index))
                            }
                            aria-label={t("remove")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="modal-section">
                <div className="stack">
                  <div className="inline-actions">
                    <select
                      className="select"
                      style={{ flex: 1 }}
                      value={songDraft}
                      onChange={(event) => setSongDraft(event.currentTarget.value)}
                    >
                      <option value="">{t("select-song")}</option>
                      {project.songs.map((song) => (
                        <option value={song.id} key={song.id}>
                          {getLocalized(song.titles, locale)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button"
                      disabled={!songDraft}
                      onClick={() => {
                        if (!songDraft) return;
                        addItem({ type: "song", songId: songDraft });
                        setSongDraft("");
                      }}
                    >
                      <Plus size={15} /> {t("add-song")}
                    </button>
                  </div>
                  <div className="inline-actions">
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      value={sectionDraft}
                      onChange={(event) => setSectionDraft(event.currentTarget.value)}
                      placeholder={t("section-name")}
                    />
                    <button
                      type="button"
                      className="button"
                      disabled={!sectionDraft.trim()}
                      onClick={() => {
                        const value = sectionDraft.trim();
                        if (!value) return;
                        addItem({ type: "section", label: { [languageKey]: value } });
                        setSectionDraft("");
                      }}
                    >
                      <Plus size={15} /> {t("add-section")}
                    </button>
                  </div>
                  <div className="inline-actions">
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.currentTarget.value)}
                      placeholder={t("note")}
                    />
                    <button
                      type="button"
                      className="button"
                      disabled={!noteDraft.trim()}
                      onClick={() => {
                        const value = noteDraft.trim();
                        if (!value) return;
                        addItem({ type: "note", text: { [languageKey]: value } });
                        setNoteDraft("");
                      }}
                    >
                      <Plus size={15} /> {t("add-note")}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <section
              aria-labelledby="setlist-markdown-tab"
              className="modal-section stack"
              id="setlist-markdown-panel"
              role="tabpanel"
            >
              <p className="panel-copy" id="setlist-markdown-help">
                {t("markdown-help")}
              </p>
              <label className="field-label">
                {t("setlist-markdown")}
                <textarea
                  aria-describedby="setlist-markdown-help"
                  className="textarea setlist-markdown-editor"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMarkdownDraft(value);
                    setMarkdownDirty(value !== serializeSetlistMarkdown(setlist, project, locale));
                    setMarkdownFeedback(undefined);
                  }}
                  rows={18}
                  spellCheck={false}
                  value={markdownDraft}
                  wrap="off"
                />
              </label>
              <div className="inline-actions">
                <button
                  className="button primary"
                  disabled={!markdownDirty}
                  onClick={applyMarkdown}
                  type="button"
                >
                  <Braces size={15} /> {t("apply-markdown")}
                </button>
                <button
                  className="button"
                  disabled={!markdownDirty}
                  onClick={resetMarkdown}
                  type="button"
                >
                  <RotateCcw size={15} /> {t("reset-markdown")}
                </button>
                {markdownDirty ? (
                  <span aria-live="polite" className="panel-copy">
                    {t("markdown-unsaved")}
                  </span>
                ) : null}
              </div>
              {markdownFeedback ? (
                <div
                  aria-live="polite"
                  className={`notice${markdownFeedback.kind === "error" ? " error" : ""}`}
                  role={markdownFeedback.kind === "error" ? "alert" : "status"}
                >
                  {markdownFeedback.message}
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : (
        <div className="notice">{t("new-setlist")}</div>
      )}
    </DialogShell>
  );
}
