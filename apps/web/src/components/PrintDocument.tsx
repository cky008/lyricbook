import { derivePrintPalette, themeFontStack } from "@app/lib/appearance";
import type { CoverPage, LogicalPrintPage, PrintPlan, SongPage, TocPage } from "@print/index";
import type { CSSProperties } from "react";

interface PrintDocumentProps {
  plan: PrintPlan;
  idPrefix?: "preview" | "print";
}

function SongPageContent({ page }: { page: SongPage }) {
  return (
    <div
      className={`print-page-content print-song-content ${page.layoutMode}`}
      data-print-content="song"
      data-line-flow={page.lineFlow}
      data-song-page-id={page.id}
      style={
        {
          "--print-font-size": `${page.fontSize}pt`,
          "--print-title-size": `${page.titleSize}pt`,
          "--print-track-columns": String(page.trackColumns),
          "--print-text-columns": String(page.textColumns),
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
        <div className="print-empty-song">Lyrics not imported</div>
      )}
    </div>
  );
}

function TocSectionContent({
  section,
  idPrefix,
}: {
  section: TocPage["sections"][number];
  idPrefix: string;
}) {
  return (
    <section className="print-toc-section" data-toc-section={section.label}>
      <h3>{section.label}</h3>
      {section.entries.map((entry) => (
        <a
          className="print-toc-entry"
          data-toc-song-id={entry.songId}
          href={`#${idPrefix}-song-${entry.songId}`}
          key={entry.songId}
        >
          <span>{String(entry.sequence).padStart(2, "0")}</span>
          <span>{entry.title}</span>
          <span>{entry.pageNumber}</span>
        </a>
      ))}
    </section>
  );
}

function TocContent({ page, idPrefix }: { page: TocPage; idPrefix: string }) {
  return (
    <div
      className={`print-page-content print-toc-content toc-density-${page.density}`}
      data-print-content="toc"
    >
      <h1 className="print-toc-title">{page.title}</h1>
      <div
        className="print-toc-columns"
        data-toc-page={page.pageInToc}
        style={{ "--toc-columns": page.columns } as CSSProperties}
      >
        {page.columnSections.map((column) => (
          <div
            className="print-toc-column"
            key={column
              .map(
                (section) =>
                  `${section.label}:${section.entries.map((entry) => entry.songId).join(",")}`,
              )
              .join("|")}
          >
            {column.map((section) => (
              <TocSectionContent
                section={section}
                idPrefix={idPrefix}
                key={`${section.label}:${section.entries.map((entry) => entry.songId).join(",")}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverContent({ page }: { page: CoverPage }) {
  const showText = page.mode !== "image";
  return (
    <div
      className={`print-page-content print-cover print-cover-${page.mode}`}
      data-cover-mode={page.mode}
      data-print-content="cover"
    >
      {page.image ? (
        <img className="print-cover-image" data-print-cover-image src={page.image.dataUrl} alt="" />
      ) : null}
      {page.mode === "image-with-text" ? (
        <div className="print-cover-image-shade" aria-hidden="true" />
      ) : null}
      {showText ? (
        <>
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
        </>
      ) : (
        <h1 className="visually-hidden">{page.title}</h1>
      )}
    </div>
  );
}

function PageBody({ page, idPrefix }: { page: LogicalPrintPage; idPrefix: string }) {
  if (page.kind === "cover") return <CoverContent page={page} />;
  if (page.kind === "song") return <SongPageContent page={page} />;
  if (page.kind === "toc") return <TocContent page={page} idPrefix={idPrefix} />;
  if (page.kind === "info") {
    return (
      <div className="print-page-content print-info-content" data-print-content="info">
        <h1 className="print-song-title">{page.title}</h1>
        <p className="print-info-copy">{page.body}</p>
        <p className="print-info-license">Copyright © 2026 iocky.com · Apache-2.0</p>
      </div>
    );
  }
  return <div className="print-page-content" data-print-content="blank" />;
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
  idPrefix,
  logical = false,
}: {
  page: LogicalPrintPage;
  number: number;
  format: "a4" | "a5";
  idPrefix: string;
  logical?: boolean;
}) {
  const firstSongPage = page.kind === "song" && page.pageInSong === 1;
  return (
    <article
      id={firstSongPage ? `${idPrefix}-song-${page.songId}` : `${idPrefix}-${page.id}`}
      className={`${logical ? "print-logical-page" : `print-page ${format}`}${
        page.kind === "cover" ? " cover" : ""
      }`}
      data-layout-status={page.kind === "song" ? page.layoutSafety : undefined}
      data-page-kind={page.kind}
      data-page-number={number}
      data-print-page-id={page.id}
    >
      <div className="print-page-inner" data-print-inner>
        <PageBody page={page} idPrefix={idPrefix} />
        {page.kind === "cover" ? null : (
          <footer className="print-page-footer" data-print-footer>
            <span>LYRICBOOK · IOCKY.COM</span>
            <span>{number}</span>
          </footer>
        )}
      </div>
    </article>
  );
}

export function PrintDocument({ plan, idPrefix = "print" }: PrintDocumentProps) {
  const format = plan.format;
  const headingStyle = plan.theme?.print?.headingStyle ?? "editorial";
  const headingFont =
    headingStyle === "modern" || plan.theme?.tokens.headingFont === "sans"
      ? themeFontStack("sans")
      : themeFontStack("serif");
  const bodyFont = themeFontStack(plan.theme?.tokens.bodyFont, "serif");
  const printPalette = derivePrintPalette(plan.theme);
  const themeStyle = {
    "--print-accent": printPalette.accent,
    "--print-muted": printPalette.muted,
    "--print-paper": printPalette.paper,
    "--print-text": printPalette.text,
    "--print-heading-font": headingFont,
    "--print-body-font": bodyFont,
  } as CSSProperties;
  if (format !== "booklet") {
    return (
      <div
        className="print-preview-pages"
        data-print-document
        data-print-heading-style={headingStyle}
        style={themeStyle}
      >
        {plan.pages.map((page, index) => (
          <LogicalPage
            page={page}
            number={index + 1}
            format={format}
            idPrefix={idPrefix}
            key={page.id}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className="print-preview-pages"
      data-print-document
      data-print-heading-style={headingStyle}
      style={themeStyle}
    >
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
            idPrefix={idPrefix}
            logical
          />
          <LogicalPage
            page={requiredPage(plan, sheet.front[1])}
            number={sheet.front[1]}
            format="a5"
            idPrefix={idPrefix}
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
            idPrefix={idPrefix}
            logical
          />
          <LogicalPage
            page={requiredPage(plan, sheet.back[1])}
            number={sheet.back[1]}
            format="a5"
            idPrefix={idPrefix}
            logical
          />
        </section>,
      ])}
    </div>
  );
}
