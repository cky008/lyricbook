import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import type { CoverPage, LogicalPrintPage, PrintPlan, SongPage, TocPage } from "@print/index";

interface PrintDocumentProps {
  plan: PrintPlan;
}

function fitContent(container: HTMLElement, initial: number, minimum: number): void {
  let size = initial;
  container.style.setProperty("--print-font-size", `${size}pt`);
  container.removeAttribute("data-overflow");
  let guard = 0;
  while (container.scrollHeight > container.clientHeight + 1 && size > minimum && guard < 60) {
    size -= 0.25;
    container.style.setProperty("--print-font-size", `${size}pt`);
    guard += 1;
  }
  if (container.scrollHeight > container.clientHeight + 2) container.dataset.overflow = "true";
}

function SongPageContent({ page }: { page: SongPage }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    fitContent(contentRef.current, page.fontSize, 7);
  }, [page]);
  return (
    <div
      ref={contentRef}
      className="print-page-content"
      style={
        {
          "--print-font-size": `${page.fontSize}pt`,
          "--print-title-size": `${page.titleSize}pt`,
          "--print-columns": String(page.columns),
          "--print-line-height": page.compact ? "1.32" : "1.46",
        } as CSSProperties
      }
    >
      <h1 className="print-song-title">
        {page.title}
        {page.pageCountForSong > 1 ? ` · ${page.pageInSong}/${page.pageCountForSong}` : ""}
      </h1>
      {page.versionLabel ? <div className="print-version-title">{page.versionLabel}</div> : null}
      {page.tracks.length ? (
        <div className="print-lyric-grid">
          {page.tracks.map((track) => (
            <section className="print-track" key={track.id}>
              {page.tracks.length > 1 ? (
                <div className="print-track-label">
                  {track.label} · {track.language}
                </div>
              ) : null}
              <pre className="print-lyrics">{track.text}</pre>
            </section>
          ))}
        </div>
      ) : (
        <div style={{ color: "#817985", fontSize: "11pt" }}>Lyrics not imported</div>
      )}
    </div>
  );
}

function TocContent({ page }: { page: TocPage }) {
  return (
    <div className="print-page-content">
      <h1 className="print-toc-title">{page.title}</h1>
      <div className="print-toc-columns" style={{ "--toc-columns": page.columns } as CSSProperties}>
        {page.sections.map((section) => (
          <section className="print-toc-section" key={section.label}>
            <h3>{section.label}</h3>
            {section.entries.map((entry) => (
              <a
                className="print-toc-entry"
                href={`#print-song-${entry.songId}`}
                key={entry.songId}
              >
                <span>{String(entry.sequence).padStart(2, "0")}</span>
                <span>{entry.title}</span>
                <span>{entry.pageNumber}</span>
              </a>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function CoverContent({ page }: { page: CoverPage }) {
  return (
    <div className="print-page-content print-cover">
      <div className="print-cover-rule" aria-hidden="true" />
      <div className="print-cover-kicker">{page.kicker}</div>
      <div className="print-cover-copy">
        <h1>{page.title}</h1>
        {page.subtitle ? <p className="print-cover-subtitle">{page.subtitle}</p> : null}
      </div>
      <div className="print-cover-details">
        {page.setlistTitle ? <span>{page.setlistTitle}</span> : null}
        <span>{page.songCountLabel}</span>
      </div>
      <div className="print-cover-mark" aria-hidden="true">
        LB
      </div>
    </div>
  );
}

function PageBody({ page }: { page: LogicalPrintPage }) {
  if (page.kind === "cover") return <CoverContent page={page} />;
  if (page.kind === "song") return <SongPageContent page={page} />;
  if (page.kind === "toc") return <TocContent page={page} />;
  if (page.kind === "info") {
    return (
      <div
        className="print-page-content"
        style={{ display: "grid", placeContent: "center", gap: "8mm" }}
      >
        <h1 className="print-song-title">{page.title}</h1>
        <p
          style={{
            maxWidth: "120mm",
            fontFamily: "Georgia, serif",
            fontSize: "12pt",
            lineHeight: 1.8,
          }}
        >
          {page.body}
        </p>
        <p style={{ color: "#766a79", fontSize: "8pt" }}>Copyright © 2026 iocky.com · Apache-2.0</p>
      </div>
    );
  }
  return <div className="print-page-content" />;
}

function requiredPage(plan: PrintPlan, pageNumber: number): LogicalPrintPage {
  const page = plan.pages[pageNumber - 1];
  if (!page) {
    throw new RangeError(`Print plan is missing logical page ${pageNumber}`);
  }
  return page;
}

function LogicalPage({
  page,
  number,
  format,
  logical = false,
}: {
  page: LogicalPrintPage;
  number: number;
  format: "a4" | "a5";
  logical?: boolean;
}) {
  const firstSongPage = page.kind === "song" && page.pageInSong === 1;
  return (
    <article
      id={firstSongPage ? `print-song-${page.songId}` : page.id}
      className={`${logical ? "print-logical-page" : `print-page ${format}`}${
        page.kind === "cover" ? " cover" : ""
      }`}
      data-page-kind={page.kind}
      data-page-number={number}
    >
      <div className="print-page-inner">
        <PageBody page={page} />
        {page.kind === "cover" ? null : (
          <footer className="print-page-footer">
            <span>LYRICBOOK · IOCKY.COM</span>
            <span>{number}</span>
          </footer>
        )}
      </div>
    </article>
  );
}

export function PrintDocument({ plan }: PrintDocumentProps) {
  const format = plan.format;
  const themeStyle = {
    "--print-accent": plan.theme?.print?.accent ?? plan.theme?.tokens.accent ?? "#694e98",
    "--print-paper": plan.theme?.print?.paper ?? "#fffdf8",
  } as CSSProperties;
  if (format !== "booklet") {
    return (
      <div className="print-preview-pages" style={themeStyle}>
        {plan.pages.map((page, index) => (
          <LogicalPage page={page} number={index + 1} format={format} key={page.id} />
        ))}
      </div>
    );
  }
  return (
    <div className="print-preview-pages" style={themeStyle}>
      {plan.bookletSheets.flatMap((sheet) => [
        <section
          className="booklet-sheet"
          data-sheet={sheet.index + 1}
          data-side="front"
          key={`sheet-${sheet.index}-front`}
        >
          <LogicalPage
            page={requiredPage(plan, sheet.front[0])}
            number={sheet.front[0]}
            format="a5"
            logical
          />
          <LogicalPage
            page={requiredPage(plan, sheet.front[1])}
            number={sheet.front[1]}
            format="a5"
            logical
          />
        </section>,
        <section
          className="booklet-sheet"
          data-sheet={sheet.index + 1}
          data-side="back"
          key={`sheet-${sheet.index}-back`}
        >
          <LogicalPage
            page={requiredPage(plan, sheet.back[0])}
            number={sheet.back[0]}
            format="a5"
            logical
          />
          <LogicalPage
            page={requiredPage(plan, sheet.back[1])}
            number={sheet.back[1]}
            format="a5"
            logical
          />
        </section>,
      ])}
    </div>
  );
}
