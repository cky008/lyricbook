import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { getLocalized, type Song, type UiLocale } from "@domain/index";
import { useI18n } from "@app/lib/i18n";
import { lockBodyScroll } from "@app/lib/scrollLock";

interface ImmersiveReaderProps {
  song: Song;
  locale: UiLocale;
  selectedVersionId: string;
  previousSong?: Song;
  nextSong?: Song;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  sequence?: { current: number; total: number };
}

export function ImmersiveReader({
  song,
  locale,
  selectedVersionId,
  previousSong,
  nextSong,
  onPrevious,
  onNext,
  onClose,
  sequence,
}: ImmersiveReaderProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const version =
    song.lyricVersions.find((item) => item.id === selectedVersionId) ?? song.lyricVersions[0];
  const tracks = version?.tracks.filter((track) => track.text.trim()) ?? [];

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && previousSong) onPrevious();
      if (event.key === "ArrowRight" && nextSong) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextSong, onClose, onNext, onPrevious, previousSong]);

  return (
    <div
      className="immersive-shell"
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("immersive-mode")}
    >
      <header className="immersive-header">
        <div>
          <div className="reader-kicker">
            <span>{version ? getLocalized(version.label, locale) : t("lyrics")}</span>
            {sequence ? <span>{t("reader-progress", sequence)}</span> : null}
          </div>
          <strong>{getLocalized(song.titles, locale)}</strong>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
          <X size={19} />
        </button>
      </header>
      <main className="immersive-content">
        <h1 className="reader-title">{getLocalized(song.titles, locale)}</h1>
        <div className={`lyric-layout${tracks.length > 1 ? " bilingual" : ""}`}>
          {tracks.length ? (
            tracks.map((track, index) => (
              <section key={track.id ?? `${track.role}-${index}`}>
                {tracks.length > 1 ? (
                  <div className="lyric-track-heading">{t(track.role)}</div>
                ) : null}
                <pre className="lyric-text">{track.text}</pre>
              </section>
            ))
          ) : (
            <div className="lyric-placeholder">{t("empty-lyrics")}</div>
          )}
        </div>
        {nextSong ? (
          <button type="button" className="next-song-card" onClick={onNext}>
            <span className="next-song-copy">
              <small>{t("next-song")}</small>
              <strong>{getLocalized(nextSong.titles, locale)}</strong>
            </span>
            <ArrowRight size={26} />
          </button>
        ) : (
          <div className="notice" style={{ marginTop: 30 }}>
            {t("no-next-song")}
          </div>
        )}
      </main>
      <footer className="immersive-footer">
        <button type="button" className="button" onClick={onPrevious} disabled={!previousSong}>
          <ArrowLeft size={17} />{" "}
          {previousSong ? getLocalized(previousSong.titles, locale) : t("previous")}
        </button>
        <button type="button" className="button primary" onClick={onNext} disabled={!nextSong}>
          {nextSong ? getLocalized(nextSong.titles, locale) : t("next")} <ArrowRight size={17} />
        </button>
      </footer>
    </div>
  );
}
