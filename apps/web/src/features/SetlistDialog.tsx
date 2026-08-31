import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createId,
  getLocalized,
  type LyricBookProject,
  type Setlist,
  type SetlistItem,
  type UiLocale,
} from "@domain/index";
import { DialogShell } from "@app/components/DialogShell";
import { useI18n } from "@app/lib/i18n";

interface SetlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: LyricBookProject;
  locale: UiLocale;
  onChange: (project: LyricBookProject) => void;
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
  const setlist =
    project.setlists.find((item) => item.id === project.activeSetlistId) ?? project.setlists[0];
  const songMap = useMemo(
    () => new Map(project.songs.map((song) => [song.id, song])),
    [project.songs],
  );

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

  const createSetlist = () => {
    const title = setlistDraft.trim();
    if (!title) return;
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

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("setlist-editor")}
      description={t("setlist-description")}
      wide
      footer={
        <button type="button" className="button primary" onClick={() => onOpenChange(false)}>
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
              onChange={(event) =>
                onChange({ ...project, activeSetlistId: event.currentTarget.value })
              }
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
                onChange={(event) =>
                  updateSetlist((current) => ({ ...current, status: event.currentTarget.value }))
                }
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
              onChange={(event) =>
                updateSetlist((current) => ({
                  ...current,
                  title: { ...current.title, [languageKey]: event.currentTarget.value },
                }))
              }
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
            <button
              type="button"
              className="button danger"
              onClick={() => {
                const remaining = project.setlists.filter((item) => item.id !== setlist.id);
                onChange({ ...project, setlists: remaining, activeSetlistId: remaining[0]?.id });
              }}
            >
              <Trash2 size={15} /> {t("remove")}
            </button>
          ) : null}
        </div>
      </section>
      {setlist ? (
        <>
          <section className="modal-section">
            <h3>{t("setlist")}</h3>
            <div className="setlist-editor-list">
              {setlist.items.map((item, index) => {
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
                    key={`${item.type}-${index}-${label}`}
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
                            onChange={(event) =>
                              setItems(
                                setlist.items.map((value, itemIndex) =>
                                  itemIndex === index && value.type === "song"
                                    ? { ...value, optional: event.currentTarget.checked }
                                    : value,
                                ),
                              )
                            }
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
        </>
      ) : (
        <div className="notice">{t("new-setlist")}</div>
      )}
    </DialogShell>
  );
}
