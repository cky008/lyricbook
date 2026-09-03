import { useI18n } from "@app/lib/i18n";
import { keyedLyricTracks } from "@app/lib/renderKeys";
import {
  getLocalized,
  type LyricVersion,
  languageDisplayName,
  type Song,
  type UiLocale,
} from "@domain/index";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ExternalLink,
  Music2,
  Pencil,
  Sparkles,
} from "lucide-react";

interface SongReaderProps {
  song: Song;
  locale: UiLocale;
  selectedVersionId: string;
  onSelectVersion: (id: string) => void;
  onEdit: () => void;
  onImmersive: () => void;
  previousSong?: Song;
  nextSong?: Song;
  onPrevious: () => void;
  onNext: () => void;
  sequence?: { current: number; total: number };
}

function activeVersion(song: Song, id: string): LyricVersion | undefined {
  return song.lyricVersions.find((version) => version.id === id) ?? song.lyricVersions[0];
}

export function SongReader({
  song,
  locale,
  selectedVersionId,
  onSelectVersion,
  onEdit,
  onImmersive,
  previousSong,
  nextSong,
  onPrevious,
  onNext,
  sequence,
}: SongReaderProps) {
  const { t } = useI18n();
  const version = activeVersion(song, selectedVersionId);
  const tracks = version?.tracks.filter((track) => track.text.trim()) ?? [];
  const renderedTracks = keyedLyricTracks(tracks);
  const title = getLocalized(song.titles, locale);
  const searchLinks = title
    ? {
        appleMusic: `https://music.apple.com/search?term=${encodeURIComponent(title)}`,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
      }
    : null;
  return (
    <article className="reader-card" id={`song-${song.id}`}>
      <div className="reader-kicker">
        <Sparkles size={13} />
        <span>{version ? getLocalized(version.label, locale) : t("lyrics")}</span>
        {sequence ? <span>{t("reader-progress", sequence)}</span> : null}
      </div>
      <h1 className="reader-title">{title || song.id}</h1>
      {song.aliases.length ? <div className="reader-alias">{song.aliases.join(" · ")}</div> : null}
      {song.tags.length ? (
        <div className="reader-tags">
          {song.tags.map((tag) => (
            <span className="badge" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="inline-actions reader-top-actions">
        <button type="button" className="button" onClick={onEdit}>
          <Pencil size={15} /> {t("edit")}
        </button>
        <button type="button" className="button primary" onClick={onImmersive}>
          <BookOpenText size={15} /> {t("immersive-mode")}
        </button>
        {searchLinks ? (
          <>
            <a
              className="button ghost"
              href={searchLinks.appleMusic}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              aria-label={t("search-apple-music", { title })}
            >
              <Music2 size={15} aria-hidden="true" /> Apple Music
            </a>
            <a
              className="button ghost"
              href={searchLinks.youtube}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              aria-label={t("search-youtube", { title })}
            >
              <ExternalLink size={15} aria-hidden="true" /> YouTube
            </a>
          </>
        ) : null}
      </div>
      {song.lyricVersions.length > 1 ? (
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
              {getLocalized(item.label, locale) || item.id}
            </button>
          ))}
        </div>
      ) : null}
      {tracks.length ? (
        <div className={`lyric-layout${tracks.length > 1 ? " bilingual" : ""}`}>
          {renderedTracks.map(({ track, key }) => (
            <section key={key}>
              {tracks.length > 1 ? (
                <div className="lyric-track-heading">
                  <span>{getLocalized(track.label, locale) || t(track.role)}</span>
                  <span>{languageDisplayName(track.language, locale)}</span>
                </div>
              ) : null}
              <pre className="lyric-text">{track.text}</pre>
            </section>
          ))}
        </div>
      ) : (
        <div className="lyric-placeholder">
          <div>
            <BookOpenText size={32} style={{ margin: "0 auto 12px" }} />
            <div>{t("empty-lyrics")}</div>
          </div>
        </div>
      )}
      {nextSong ? (
        <button type="button" className="next-song-card" onClick={onNext}>
          <span className="next-song-copy">
            <small>{t("next-song")}</small>
            <strong>{getLocalized(nextSong.titles, locale)}</strong>
          </span>
          <ArrowRight size={24} />
        </button>
      ) : (
        <div className="notice" style={{ marginTop: 26 }}>
          {t("no-next-song")}
        </div>
      )}
      <div className="inline-actions" style={{ justifyContent: "space-between", marginTop: 18 }}>
        <button
          type="button"
          className="button ghost"
          onClick={onPrevious}
          disabled={!previousSong}
        >
          <ArrowLeft size={15} /> {t("previous")}
        </button>
        <button type="button" className="button ghost" onClick={onNext} disabled={!nextSong}>
          {t("next")} <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}
