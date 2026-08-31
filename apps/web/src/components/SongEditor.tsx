import { Check, Copy, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createId,
  getLocalized,
  type LyricTrack,
  type LyricTrackRole,
  type LyricVersion,
  type Song,
  type UiLocale,
} from "@domain/index";
import { useI18n } from "@app/lib/i18n";

interface SongEditorProps {
  song: Song;
  locale: UiLocale;
  selectedVersionId: string;
  onSelectVersion: (id: string) => void;
  onChange: (song: Song) => void;
  onRead: () => void;
  onDelete: () => void;
}

function replaceVersion(song: Song, version: LyricVersion): Song {
  return {
    ...song,
    lyricVersions: song.lyricVersions.map((item) => (item.id === version.id ? version : item)),
  };
}

export function SongEditor({
  song,
  locale,
  selectedVersionId,
  onSelectVersion,
  onChange,
  onRead,
  onDelete,
}: SongEditorProps) {
  const { t } = useI18n();
  const languageKey = locale === "zh-CN" ? "zh-Hans" : "en";
  const version =
    song.lyricVersions.find((item) => item.id === selectedVersionId) ?? song.lyricVersions[0];
  const [tagDraft, setTagDraft] = useState("");
  const knownRoles: LyricTrackRole[] = ["original", "translation", "transliteration", "adaptation"];
  const title = getLocalized(song.titles, locale);
  const aliases = song.aliases.join(", ");
  const allLanguages = useMemo(
    () => [
      ...new Set(song.lyricVersions.flatMap((item) => item.tracks.map((track) => track.language))),
    ],
    [song],
  );

  const updateVersion = (next: LyricVersion) => onChange(replaceVersion(song, next));
  const updateTrack = (index: number, next: LyricTrack) => {
    if (!version) return;
    updateVersion({
      ...version,
      tracks: version.tracks.map((track, trackIndex) => (trackIndex === index ? next : track)),
    });
  };

  const addVersion = () => {
    const id = createId("version", "new");
    const next: LyricVersion = {
      id,
      label: { [languageKey]: t("add-version") },
      kind: "custom",
      isDefault: song.lyricVersions.length === 0,
      tracks: [{ id: "original", language: languageKey, role: "original", text: "" }],
    };
    onChange({ ...song, lyricVersions: [...song.lyricVersions, next] });
    onSelectVersion(id);
  };

  const copyVersion = () => {
    if (!version) return;
    const id = createId("version", `${getLocalized(version.label, locale)} copy`);
    const next = structuredClone(version);
    next.id = id;
    next.isDefault = false;
    next.label = {
      ...next.label,
      [languageKey]: `${getLocalized(next.label, locale)} ${t("copy")}`,
    };
    onChange({ ...song, lyricVersions: [...song.lyricVersions, next] });
    onSelectVersion(id);
  };

  const removeVersion = () => {
    if (!version || song.lyricVersions.length <= 1) return;
    const remaining = song.lyricVersions.filter((item) => item.id !== version.id);
    if (version.isDefault && remaining[0]) remaining[0] = { ...remaining[0], isDefault: true };
    onChange({ ...song, lyricVersions: remaining });
    onSelectVersion(remaining[0]?.id ?? "");
  };

  const setDefault = () => {
    if (!version) return;
    onChange({
      ...song,
      lyricVersions: song.lyricVersions.map((item) => ({
        ...item,
        isDefault: item.id === version.id,
      })),
    });
  };

  const addTrack = (role: LyricTrackRole = "translation") => {
    if (!version) return;
    const language =
      role === "translation" ? (languageKey === "zh-Hans" ? "en" : "zh-Hans") : languageKey;
    updateVersion({
      ...version,
      tracks: [
        ...version.tracks,
        {
          id: createId("track", role),
          language,
          role,
          text: "",
          alignedTo:
            role === "translation"
              ? version.tracks.find((track) => track.role === "original")?.id
              : undefined,
        },
      ],
    });
  };

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || song.tags.includes(value)) return;
    onChange({ ...song, tags: [...song.tags, value] });
    setTagDraft("");
  };

  return (
    <article className="reader-card">
      <div className="reader-kicker">
        <span>{t("editor")}</span>
        <span>{t("saved-local")}</span>
      </div>
      <div className="stack" style={{ marginTop: 18 }}>
        <label className="field-label">
          {t("song-title")}
          <input
            className="field"
            value={title}
            onChange={(event) =>
              onChange({
                ...song,
                titles: { ...song.titles, [languageKey]: event.currentTarget.value },
              })
            }
          />
        </label>
        <label className="field-label">
          {t("aliases")}
          <input
            className="field"
            value={aliases}
            onChange={(event) =>
              onChange({
                ...song,
                aliases: event.currentTarget.value
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
          <span>{t("aliases-help")}</span>
        </label>
        <div className="field-label">
          {t("tags")}
          <div className="tag-editor">
            {song.tags.map((tag) => (
              <button
                type="button"
                className="chip-button"
                key={tag}
                onClick={() =>
                  onChange({ ...song, tags: song.tags.filter((item) => item !== tag) })
                }
              >
                {tag} ×
              </button>
            ))}
          </div>
          <div className="inline-actions">
            <input
              className="field"
              style={{ flex: 1, minWidth: 180 }}
              value={tagDraft}
              onChange={(event) => setTagDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder={t("tags-help")}
            />
            <button type="button" className="button" onClick={addTag}>
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="version-tabs" role="tablist" aria-label={t("versions")}>
        {song.lyricVersions.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={item.id === version?.id}
            className={`tab-button${item.id === version?.id ? " active" : ""}`}
            onClick={() => onSelectVersion(item.id)}
            key={item.id}
          >
            {item.isDefault ? (
              <Check size={12} style={{ display: "inline", marginRight: 4 }} />
            ) : null}
            {getLocalized(item.label, locale) || item.id}
          </button>
        ))}
        <button type="button" className="tab-button" onClick={addVersion}>
          <Plus size={12} /> {t("add-version")}
        </button>
      </div>
      {version ? (
        <div className="stack">
          <div className="two-columns">
            <label className="field-label">
              {t("version-name")}
              <input
                className="field"
                value={getLocalized(version.label, locale)}
                onChange={(event) =>
                  updateVersion({
                    ...version,
                    label: { ...version.label, [languageKey]: event.currentTarget.value },
                  })
                }
              />
            </label>
            <label className="field-label">
              {t("version-kind")}
              <input
                className="field"
                value={version.kind}
                onChange={(event) => updateVersion({ ...version, kind: event.currentTarget.value })}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button"
              onClick={setDefault}
              disabled={version.isDefault}
            >
              <Check size={15} /> {t("set-default")}
            </button>
            <button type="button" className="button" onClick={copyVersion}>
              <Copy size={15} /> {t("copy")}
            </button>
            <button type="button" className="button" onClick={() => addTrack("translation")}>
              <Plus size={15} /> {t("add-translation")}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={removeVersion}
              disabled={song.lyricVersions.length <= 1}
            >
              <Trash2 size={15} /> {t("remove")}
            </button>
          </div>
          {version.tracks.map((track, index) => (
            <section className="panel" key={track.id ?? `${track.role}-${index}`}>
              <div className="panel-heading">
                <h3>
                  {t("track")} {index + 1}
                </h3>
                <button
                  type="button"
                  className="mini-button"
                  disabled={version.tracks.length <= 1}
                  onClick={() =>
                    updateVersion({
                      ...version,
                      tracks: version.tracks.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                  aria-label={t("remove")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="two-columns" style={{ marginTop: 12 }}>
                <label className="field-label">
                  {t("track-language")}
                  <input
                    className="field"
                    list="language-options"
                    value={track.language}
                    onChange={(event) =>
                      updateTrack(index, { ...track, language: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="field-label">
                  {t("track-role")}
                  <select
                    className="select"
                    value={track.role}
                    onChange={(event) =>
                      updateTrack(index, {
                        ...track,
                        role: event.currentTarget.value as LyricTrackRole,
                      })
                    }
                  >
                    {knownRoles.map((role) => (
                      <option value={role} key={role}>
                        {t(role)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                className="textarea"
                style={{ marginTop: 12, minHeight: 280 }}
                value={track.text}
                onChange={(event) =>
                  updateTrack(index, { ...track, text: event.currentTarget.value })
                }
                placeholder={t("empty-lyrics")}
                spellCheck={false}
              />
            </section>
          ))}
          <datalist id="language-options">
            {[...new Set(["zh-Hans", "zh-Hant", "en", "ja", "ko", ...allLanguages])].map(
              (language) => (
                <option value={language} key={language} />
              ),
            )}
          </datalist>
        </div>
      ) : null}
      <div className="dialog-footer" style={{ justifyContent: "space-between" }}>
        <button type="button" className="button danger" onClick={onDelete}>
          <Trash2 size={15} /> {t("delete-song")}
        </button>
        <button type="button" className="button primary" onClick={onRead}>
          <Save size={15} /> {t("read")}
        </button>
      </div>
    </article>
  );
}
