import { ArrowUpDown, Check, Menu, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { getLocalized, type Song, type UiLocale } from "@domain/index";
import { useI18n } from "@app/lib/i18n";
import { lockBodyScroll } from "@app/lib/scrollLock";

interface SongSidebarProps {
  songs: Song[];
  selectedSongId: string | undefined;
  locale: UiLocale;
  query: string;
  onQueryChange: (value: string) => void;
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onSelectSong: (id: string) => void;
  onAddSong: () => void;
  onTransfer: () => void;
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

function SidebarBody({
  songs,
  selectedSongId,
  locale,
  query,
  onQueryChange,
  activeTags,
  onToggleTag,
  onClearTags,
  onSelectSong,
  onAddSong,
  onTransfer,
}: Omit<SongSidebarProps, "mobile" | "open" | "onClose">) {
  const { t } = useI18n();
  const tags = useMemo(
    () => [...new Set(songs.flatMap((song) => song.tags))].sort((a, b) => a.localeCompare(b)),
    [songs],
  );
  return (
    <div className="sidebar-inner">
      <div className="sidebar-heading">
        <h2>{t("library")}</h2>
        <button
          type="button"
          className="mini-button"
          onClick={onAddSong}
          aria-label={t("add-song")}
        >
          <Plus size={15} />
        </button>
      </div>
      <button type="button" className="button sidebar-transfer-button" onClick={onTransfer}>
        <ArrowUpDown size={15} /> {t("transfer-data")}
      </button>
      <div className="search-wrap">
        <Search size={15} />
        <input
          className="field"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </div>
      {tags.length ? (
        <div className="reader-tags">
          {tags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                type="button"
                className={`chip-button${active ? " active" : ""}`}
                onClick={() => onToggleTag(tag)}
                key={tag}
                aria-pressed={active}
                style={
                  active ? { borderColor: "var(--lb-accent)", color: "var(--lb-text)" } : undefined
                }
              >
                {active ? <Check size={12} /> : null}
                {tag}
              </button>
            );
          })}
          {activeTags.length ? (
            <button type="button" className="chip-button" onClick={onClearTags}>
              <X size={12} /> {t("clear-filter")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="song-list">
        {songs.length ? (
          songs.map((song, index) => {
            const original = song.lyricVersions
              .flatMap((version) => version.tracks)
              .find((track) => track.role === "original");
            const hasLyrics = Boolean(original?.text.trim());
            return (
              <button
                type="button"
                key={song.id}
                className={`song-row${song.id === selectedSongId ? " active" : ""}`}
                onClick={() => onSelectSong(song.id)}
              >
                <span className="song-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="song-row-copy">
                  <span className="song-title">{getLocalized(song.titles, locale) || song.id}</span>
                  <span className="song-meta">
                    <span>
                      {song.lyricVersions.length} {t("versions")}
                    </span>
                    {(song.tags.length ? song.tags.slice(0, 2) : [t("local-first")]).map((tag) => (
                      <span className="song-meta-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </span>
                </span>
                {hasLyrics ? <span className="tag-dot" title={t("lyrics")} /> : null}
              </button>
            );
          })
        ) : (
          <div className="notice">{t("no-songs")}</div>
        )}
      </div>
    </div>
  );
}

export function SongSidebar(props: SongSidebarProps) {
  const { t } = useI18n();
  const { mobile = false, open = false, onClose, ...bodyProps } = props;
  useEffect(() => {
    if (!mobile || !open) return;
    return lockBodyScroll();
  }, [mobile, open]);
  if (!mobile) {
    return (
      <aside className="sidebar desktop">
        <SidebarBody {...bodyProps} />
      </aside>
    );
  }
  if (!open) return null;

  return (
    <>
      <button type="button" className="overlay" onClick={onClose} aria-label={t("close-menu")} />
      <aside className="mobile-sidebar open">
        <div className="mobile-sidebar-header">
          <div className="brand">
            <span className="brand-mark">
              <Menu size={18} />
            </span>
            <span className="brand-title">{t("library")}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("close-menu")}
          >
            <X size={18} />
          </button>
        </div>
        <SidebarBody {...bodyProps} />
      </aside>
    </>
  );
}
