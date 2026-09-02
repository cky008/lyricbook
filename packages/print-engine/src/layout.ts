import type {
  LyricBookProject,
  LyricTrack,
  LyricVersion,
  PrintFormat,
  PrintOptions,
  Setlist,
  Song,
  Theme,
  UiLocale,
} from "@domain/index";
import { getLocalized, setlistSongIds } from "@domain/index";
import { type BookletSheet, imposeBooklet, paddedBookletPageCount } from "./booklet";

export interface PrintTrackBlock {
  id: string;
  label: string;
  language: string;
  role: string;
  text: string;
  alignedTo?: string;
}

export interface TocEntry {
  songId: string;
  title: string;
  sequence: number;
  pageNumber: number;
  section?: string;
}

export interface TocSection {
  label: string;
  entries: TocEntry[];
}

export type TocDensity = "relaxed" | "standard" | "compact";

export interface CoverPage {
  kind: "cover";
  id: string;
  kicker: string;
  title: string;
  subtitle?: string;
  setlistTitle?: string;
  songCountLabel: string;
}

export interface TocPage {
  kind: "toc";
  id: string;
  title: string;
  sections: TocSection[];
  columns: number;
  density: TocDensity;
  columnSections: TocSection[][];
  pageInToc: number;
  pageCountForToc: number;
  continuation: boolean;
}

export type SongLayoutMode =
  | "single-track"
  | "balanced-text"
  | "parallel-tracks"
  | "stacked-tracks";

export type PrintLayoutSafety = "pending" | "safe" | "unsafe";

export interface SongPage {
  kind: "song";
  id: string;
  songId: string;
  title: string;
  versionLabel?: string;
  pageInSong: number;
  pageCountForSong: number;
  tracks: PrintTrackBlock[];
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  titleSize: number;
  layoutMode: SongLayoutMode;
  trackColumns: number;
  textColumns: number;
  layoutSafety: PrintLayoutSafety;
  compact: boolean;
}

export interface InfoPage {
  kind: "info";
  id: string;
  title: string;
  body: string;
}

export interface BlankPage {
  kind: "blank";
  id: string;
}

export type LogicalPrintPage = CoverPage | TocPage | SongPage | InfoPage | BlankPage;

export interface PrintPlan {
  format: PrintFormat;
  pages: LogicalPrintPage[];
  bookletSheets: BookletSheet[];
  paddedPageCount: number;
  songCount: number;
  theme: Theme | undefined;
}

interface BuildContext {
  project: LyricBookProject;
  options: PrintOptions;
  locale: UiLocale;
  currentSongId?: string;
  filteredSongIds?: string[];
  selectedVersionBySong?: Record<string, string>;
}

const SONG_CAPACITY: Record<Exclude<PrintFormat, "booklet">, Record<number, number>> = {
  a4: { 1: 56, 2: 102, 3: 142 },
  a5: { 1: 39, 2: 70, 3: 96 },
};

const TOC_COLUMN_CAPACITY: Record<Exclude<PrintFormat, "booklet">, Record<number, number>> = {
  a4: { 1: 43.5, 2: 39, 3: 32 },
  a5: { 1: 30, 2: 21 },
};

const MIN_FONT_SIZE = 7;
const PAGINATION_SAFETY_FACTOR = 0.72;

function capacityFor(format: Exclude<PrintFormat, "booklet">, columns: number): number {
  return SONG_CAPACITY[format][columns] ?? SONG_CAPACITY[format][1] ?? 1;
}

function lineWeight(line: string): number {
  let weight = 0;
  for (const character of line) {
    if (/\s/.test(character)) weight += 0.25;
    else if (
      /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)
    )
      weight += 1;
    else weight += 0.56;
  }
  return Math.max(1, weight);
}

function estimateVisualLines(text: string, charsPerLine: number): number {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(lineWeight(line) / charsPerLine)),
    0,
  );
}

function tracksForMode(version: LyricVersion, mode: PrintOptions["languageMode"]): LyricTrack[] {
  const original = version.tracks.find((track) => track.role === "original") ?? version.tracks[0];
  if (!original) return [];
  if (mode === "original") return [original];
  if (mode === "original-translation") {
    const translation = version.tracks.find((track) => track.role === "translation");
    return translation ? [original, translation] : [original];
  }
  return version.tracks;
}

function versionsForMode(
  song: Song,
  mode: PrintOptions["versionMode"],
  selectedVersionId: string | undefined,
): LyricVersion[] {
  const firstVersion = song.lyricVersions.at(0);
  if (!firstVersion) return [];
  if (mode === "all") return song.lyricVersions;
  if (mode === "current" && selectedVersionId) {
    const selected = song.lyricVersions.find((version) => version.id === selectedVersionId);
    if (selected) return [selected];
  }
  return [song.lyricVersions.find((version) => version.isDefault) ?? firstVersion];
}

function sectionMap(setlist: Setlist | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!setlist) return map;
  let section = "";
  for (const item of setlist.items) {
    if (item.type === "section") section = Object.values(item.label).find(Boolean) ?? section;
    if (item.type === "song" && !map.has(item.songId)) map.set(item.songId, section);
  }
  return map;
}

function songIdsForScope(context: BuildContext): string[] {
  const { project, options } = context;
  if (options.scope === "current-song") return context.currentSongId ? [context.currentSongId] : [];
  if (options.scope === "filtered")
    return context.filteredSongIds ?? project.songs.map((song) => song.id);
  if (options.scope === "active-setlist") {
    const setlist = project.setlists.find((item) => item.id === project.activeSetlistId);
    return setlistSongIds(setlist, options.includeOptional);
  }
  return project.songs.map((song) => song.id);
}

function splitTrackText(text: string, lineLimit: number, charsPerLine: number): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  if (!rawLines.length) return [""];
  const weightedLines = rawLines.map((line) => ({
    line,
    weight: Math.max(1, Math.ceil(lineWeight(line) / charsPerLine)),
  }));
  const totalWeight = weightedLines.reduce((sum, line) => sum + line.weight, 0);
  const pageCount = Math.max(1, Math.ceil(totalWeight / lineLimit));
  if (pageCount === 1) return [rawLines.join("\n")];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWeight = 0;
  let remainingWeight = totalWeight;
  let remainingPages = pageCount;
  for (const weightedLine of weightedLines) {
    const targetWeight = Math.min(lineLimit, Math.ceil(remainingWeight / remainingPages));
    if (
      current.length &&
      chunks.length < pageCount - 1 &&
      currentWeight + weightedLine.weight > targetWeight
    ) {
      chunks.push(current.join("\n"));
      remainingWeight -= currentWeight;
      remainingPages -= 1;
      current = [];
      currentWeight = 0;
    }
    current.push(weightedLine.line);
    currentWeight += weightedLine.weight;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks.length ? chunks : [""];
}

interface SongLayoutCandidate {
  layoutMode: SongLayoutMode;
  trackColumns: number;
  textColumns: number;
}

interface ChosenSongLayout extends SongLayoutCandidate {
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  titleSize: number;
  lineLimit: number;
  charsPerLine: number;
  layoutSafety: PrintLayoutSafety;
  compact: boolean;
  requiresPagination: boolean;
}

function fontBounds(format: Exclude<PrintFormat, "booklet">): {
  minimum: number;
  maximum: number;
} {
  return { minimum: MIN_FONT_SIZE, maximum: format === "a4" ? 22 : 16 };
}

function candidateColumns(candidate: SongLayoutCandidate): number {
  return Math.max(candidate.trackColumns, candidate.textColumns);
}

function charsPerLineFor(candidate: SongLayoutCandidate): number {
  const columns = candidateColumns(candidate);
  if (columns === 1) return 42;
  if (columns === 2) return 31;
  return 24;
}

function lineLimitFor(
  format: Exclude<PrintFormat, "booklet">,
  candidate: SongLayoutCandidate,
  fontSize: number,
): number {
  const referenceFontSize = format === "a4" ? 12 : 10.5;
  return Math.max(
    1,
    Math.floor(capacityFor(format, candidateColumns(candidate)) * (referenceFontSize / fontSize)),
  );
}

function visualLinesFor(trackTexts: string[], candidate: SongLayoutCandidate): number {
  const charsPerLine = charsPerLineFor(candidate);
  return trackTexts.reduce((total, text) => total + estimateVisualLines(text, charsPerLine), 0);
}

function layoutCandidates(
  tracks: LyricTrack[],
  strategy: PrintOptions["strategy"],
): SongLayoutCandidate[] {
  const trackCount = tracks.length;
  if (trackCount <= 1) {
    const single: SongLayoutCandidate = {
      layoutMode: "single-track",
      trackColumns: 1,
      textColumns: 1,
    };
    const balanced: SongLayoutCandidate = {
      layoutMode: "balanced-text",
      trackColumns: 1,
      textColumns: 2,
    };
    return strategy === "compact" ? [balanced, single] : [single, balanced];
  }

  const parallel: SongLayoutCandidate = {
    layoutMode: "parallel-tracks",
    trackColumns: Math.min(3, trackCount),
    textColumns: 1,
  };
  const stacked: SongLayoutCandidate = {
    layoutMode: "stacked-tracks",
    trackColumns: 1,
    textColumns: 1,
  };
  const aligned = tracks.slice(1).every((track) => Boolean(track.alignedTo));
  return aligned ? [parallel, stacked] : [stacked];
}

function chooseLayout(
  format: Exclude<PrintFormat, "booklet">,
  tracks: LyricTrack[],
  strategy: PrintOptions["strategy"],
): ChosenSongLayout {
  const bounds = fontBounds(format);
  const candidates = layoutCandidates(tracks, strategy);
  const trackTexts = tracks.map((track) => track.text);

  for (let fontSize = bounds.maximum; fontSize >= bounds.minimum; fontSize -= 1) {
    for (const candidate of candidates) {
      const lineLimit = lineLimitFor(format, candidate, fontSize);
      if (visualLinesFor(trackTexts, candidate) <= lineLimit) {
        return {
          ...candidate,
          fontSize,
          minFontSize: bounds.minimum,
          maxFontSize: bounds.maximum,
          titleSize: Math.max(fontSize + 8, format === "a4" ? 22 : 18),
          lineLimit,
          charsPerLine: charsPerLineFor(candidate),
          layoutSafety: "pending",
          compact: fontSize <= (format === "a4" ? 12 : 10),
          requiresPagination: false,
        };
      }
    }
  }

  const fallback = candidates.reduce<SongLayoutCandidate>(
    (best, candidate) =>
      lineLimitFor(format, candidate, bounds.minimum) > lineLimitFor(format, best, bounds.minimum)
        ? candidate
        : best,
    candidates[0] ?? {
      layoutMode: "single-track",
      trackColumns: 1,
      textColumns: 1,
    },
  );
  const lineLimit = lineLimitFor(format, fallback, bounds.minimum);
  const strict = strategy === "strict-page-limit";
  return {
    ...fallback,
    fontSize: bounds.minimum,
    minFontSize: bounds.minimum,
    maxFontSize: bounds.maximum,
    titleSize: format === "a4" ? 18 : 15,
    lineLimit,
    charsPerLine: charsPerLineFor(fallback),
    layoutSafety: strict ? "unsafe" : "pending",
    compact: true,
    requiresPagination: !strict,
  };
}

function buildSongPages(
  song: Song,
  context: BuildContext,
  format: Exclude<PrintFormat, "booklet">,
): SongPage[] {
  const versions = versionsForMode(
    song,
    context.options.versionMode,
    context.selectedVersionBySong?.[song.id],
  );
  if (!versions.length) {
    if (!context.options.includeEmptySongs) return [];
    return [
      {
        kind: "song",
        id: `print-song-${song.id}-empty`,
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        pageInSong: 1,
        pageCountForSong: 1,
        tracks: [],
        fontSize: format === "a4" ? 16 : 12,
        minFontSize: MIN_FONT_SIZE,
        maxFontSize: fontBounds(format).maximum,
        titleSize: format === "a4" ? 27 : 20,
        layoutMode: "single-track",
        trackColumns: 1,
        textColumns: 1,
        layoutSafety: "pending",
        compact: false,
      },
    ];
  }

  const allPages: SongPage[] = [];
  for (const version of versions) {
    const tracks = tracksForMode(version, context.options.languageMode);
    const nonEmptyTracks = tracks.filter(
      (track) => track.text.trim() || context.options.includeEmptySongs,
    );
    if (!nonEmptyTracks.length && !context.options.includeEmptySongs) continue;
    const layout = chooseLayout(format, nonEmptyTracks, context.options.strategy);
    const versionLabel =
      song.lyricVersions.length > 1 ? getLocalized(version.label, context.locale) : undefined;

    const printTracks = nonEmptyTracks.map((track, trackIndex) => ({
      id: `${version.id}:${track.id ?? `${track.role}:${track.language}:${trackIndex}`}`,
      label: getLocalized(track.label, context.locale) || track.role,
      language: track.language,
      role: track.role,
      text: track.text,
      alignedTo: track.alignedTo,
    }));

    if (!layout.requiresPagination) {
      allPages.push({
        kind: "song",
        id: `print-song-${song.id}-${version.id}-1`,
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        versionLabel,
        pageInSong: 1,
        pageCountForSong: 1,
        tracks: printTracks,
        fontSize: layout.fontSize,
        minFontSize: layout.minFontSize,
        maxFontSize: layout.maxFontSize,
        titleSize: layout.titleSize,
        layoutMode: layout.layoutMode,
        trackColumns: layout.trackColumns,
        textColumns: layout.textColumns,
        layoutSafety: layout.layoutSafety,
        compact: layout.compact,
      });
      continue;
    }

    const perTrackLineLimit = Math.max(
      1,
      Math.floor(
        (layout.lineLimit * PAGINATION_SAFETY_FACTOR) / Math.max(1, nonEmptyTracks.length),
      ),
    );
    const chunksByTrack = nonEmptyTracks.map((track) =>
      splitTrackText(track.text, perTrackLineLimit, layout.charsPerLine),
    );
    const pageCount = Math.max(...chunksByTrack.map((chunks) => chunks.length));
    for (let index = 0; index < pageCount; index += 1) {
      allPages.push({
        kind: "song",
        id: `print-song-${song.id}-${version.id}-${index + 1}`,
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        versionLabel,
        pageInSong: index + 1,
        pageCountForSong: pageCount,
        tracks: nonEmptyTracks.map((track, trackIndex) => ({
          id: `${version.id}:${track.id ?? `${track.role}:${track.language}:${trackIndex}`}`,
          label: getLocalized(track.label, context.locale) || track.role,
          language: track.language,
          role: track.role,
          text: chunksByTrack[trackIndex]?.[index] ?? "",
          alignedTo: track.alignedTo,
        })),
        fontSize: layout.fontSize,
        minFontSize: layout.minFontSize,
        maxFontSize: layout.maxFontSize,
        titleSize: layout.titleSize,
        layoutMode: layout.layoutMode,
        trackColumns: layout.trackColumns,
        textColumns: layout.textColumns,
        layoutSafety: layout.layoutSafety,
        compact: true,
      });
    }
  }
  const total = allPages.length;
  return allPages.map((page, index) => ({
    ...page,
    pageInSong: index + 1,
    pageCountForSong: total,
  }));
}

function coverSummary(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}…`;
}

interface TocRow {
  sectionLabel: string;
  entry: TocEntry;
}

interface TocColumnAllocation {
  columnSections: TocSection[][];
  nextRowIndex: number;
}

function tocCharactersPerLine(format: Exclude<PrintFormat, "booklet">, columns: number): number {
  if (format === "a5") return columns === 1 ? 42 : 24;
  if (columns === 1) return 64;
  if (columns === 2) return 38;
  return 25;
}

function tocEntryWeight(
  entry: TocEntry,
  format: Exclude<PrintFormat, "booklet">,
  columns: number,
): number {
  const lines = Math.max(
    1,
    Math.ceil(
      lineWeight(`${entry.sequence}. ${entry.title} ${entry.pageNumber}`) /
        tocCharactersPerLine(format, columns),
    ),
  );
  return 1 + (lines - 1) * 0.85;
}

function tocSectionWeight(
  label: string,
  format: Exclude<PrintFormat, "booklet">,
  columns: number,
): number {
  const lines = Math.max(1, Math.ceil(lineWeight(label) / tocCharactersPerLine(format, columns)));
  return 1.5 + (lines - 1) * 0.9;
}

function appendTocEntry(sections: TocSection[], row: TocRow): void {
  const current = sections.at(-1);
  if (current?.label === row.sectionLabel) {
    current.entries.push(row.entry);
    return;
  }
  sections.push({ label: row.sectionLabel, entries: [row.entry] });
}

function allocateTocColumns(
  rows: TocRow[],
  startRowIndex: number,
  format: Exclude<PrintFormat, "booklet">,
  columns: number,
): TocColumnAllocation {
  const capacity = TOC_COLUMN_CAPACITY[format][columns] ?? 1;
  const columnSections: TocSection[][] = [];
  let rowIndex = startRowIndex;

  for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
    const sections: TocSection[] = [];
    let used = 0;
    while (rowIndex < rows.length) {
      const row = rows[rowIndex];
      if (!row) break;
      const startsSection = sections.at(-1)?.label !== row.sectionLabel;
      const weight =
        tocEntryWeight(row.entry, format, columns) +
        (startsSection ? tocSectionWeight(row.sectionLabel, format, columns) : 0);
      if (sections.length && used + weight > capacity) break;
      appendTocEntry(sections, row);
      used += weight;
      rowIndex += 1;
    }
    columnSections.push(sections);
  }

  return { columnSections, nextRowIndex: rowIndex };
}

function tocRows(sections: TocSection[]): TocRow[] {
  return sections.flatMap((section) =>
    section.entries.map((entry) => ({ sectionLabel: section.label, entry })),
  );
}

function layoutTocColumns(
  sections: TocSection[],
  format: Exclude<PrintFormat, "booklet">,
): TocSection[][][] {
  const rows = tocRows(sections);
  if (!rows.length) return [[[]]];
  const candidates = format === "a4" ? [1, 2, 3] : [1, 2];

  for (const columns of candidates) {
    const allocation = allocateTocColumns(rows, 0, format, columns);
    if (allocation.nextRowIndex === rows.length) return [allocation.columnSections];
  }

  const columns = candidates.at(-1) ?? 1;
  const pages: TocSection[][][] = [];
  let rowIndex = 0;
  while (rowIndex < rows.length) {
    const allocation = allocateTocColumns(rows, rowIndex, format, columns);
    if (allocation.nextRowIndex <= rowIndex) {
      throw new Error("Unable to allocate a table-of-contents entry");
    }
    pages.push(allocation.columnSections);
    rowIndex = allocation.nextRowIndex;
  }
  return pages;
}

export function createPrintPlan(context: BuildContext): PrintPlan {
  const baseFormat: Exclude<PrintFormat, "booklet"> = context.options.format === "a4" ? "a4" : "a5";
  const songIds = songIdsForScope(context);
  const songs = songIds
    .map((id) => context.project.songs.find((song) => song.id === id))
    .filter((song): song is Song => Boolean(song));
  const setlist = context.project.setlists.find(
    (item) => item.id === context.project.activeSetlistId,
  );
  const sections = sectionMap(setlist);
  const songPages = songs.flatMap((song) => buildSongPages(song, context, baseFormat));
  const pages: LogicalPrintPage[] = [];
  const includeCover = context.options.format === "booklet" && context.options.includeCover;

  if (includeCover) {
    const projectTitle = getLocalized(context.project.title, context.locale);
    const subtitle = coverSummary(
      context.project.description
        ? getLocalized(context.project.description, context.locale)
        : undefined,
    );
    const setlistTitle =
      context.options.scope === "active-setlist" && setlist
        ? getLocalized(setlist.title, context.locale)
        : undefined;
    const setlistSlots =
      context.options.scope === "active-setlist"
        ? setlist?.items.filter(
            (item) => item.type === "song" && (context.options.includeOptional || !item.optional),
          ).length
        : undefined;
    const hasRepeatedSlots = Boolean(setlistSlots && setlistSlots > songs.length);

    pages.push({
      kind: "cover",
      id: "print-cover",
      kicker:
        context.locale === "zh-CN" ? "演唱会歌词本 · IOCKY.COM" : "CONCERT LYRICBOOK · IOCKY.COM",
      title: projectTitle,
      subtitle,
      setlistTitle: setlistTitle || undefined,
      songCountLabel: hasRepeatedSlots
        ? context.locale === "zh-CN"
          ? `${songs.length} 首不同歌曲 · ${setlistSlots} 个歌单位置`
          : `${songs.length} unique songs · ${setlistSlots} setlist slots`
        : context.locale === "zh-CN"
          ? `${songs.length} 首歌曲`
          : `${songs.length} ${songs.length === 1 ? "song" : "songs"}`,
    });
  }

  if (context.options.includeTableOfContents) {
    const tocSections = new Map<string, TocEntry[]>();
    let sequence = 1;
    for (const song of songs) {
      const count = songPages.filter((page) => page.songId === song.id).length;
      if (!count) continue;
      const section =
        sections.get(song.id) || (context.locale === "zh-CN" ? "演出曲目" : "Concert songs");
      const entry: TocEntry = {
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        sequence,
        pageNumber: 0,
        section,
      };
      const existing = tocSections.get(section) ?? [];
      existing.push(entry);
      tocSections.set(section, existing);
      sequence += 1;
    }
    const sectionList = [...tocSections].map(([label, entries]) => ({ label, entries }));
    const entries = sectionList.flatMap((tocSection) => tocSection.entries);
    const pageCountBySong = new Map<string, number>();
    for (const page of songPages) {
      pageCountBySong.set(page.songId, (pageCountBySong.get(page.songId) ?? 0) + 1);
    }
    const assignPageNumbers = (tocPageCount: number): void => {
      let cursor = (includeCover ? 1 : 0) + tocPageCount + 1;
      for (const song of songs) {
        const entry = entries.find((candidate) => candidate.songId === song.id);
        const count = pageCountBySong.get(song.id) ?? 0;
        if (!entry || !count) continue;
        entry.pageNumber = cursor;
        cursor += count;
      }
    };

    let tocColumnPages = layoutTocColumns(sectionList, baseFormat);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assignPageNumbers(tocColumnPages.length);
      const measuredWithPageNumbers = layoutTocColumns(sectionList, baseFormat);
      const stablePageCount = measuredWithPageNumbers.length === tocColumnPages.length;
      tocColumnPages = measuredWithPageNumbers;
      if (stablePageCount) break;
    }
    assignPageNumbers(tocColumnPages.length);
    const tocPageCount = tocColumnPages.length;
    for (let index = 0; index < tocColumnPages.length; index += 1) {
      const columnSections = tocColumnPages[index] ?? [[]];
      const baseTitle = context.locale === "zh-CN" ? "演出目录" : "Setlist contents";
      pages.push({
        kind: "toc",
        id: `print-toc-${index + 1}`,
        title:
          index === 0
            ? baseTitle
            : context.locale === "zh-CN"
              ? `${baseTitle}（续）`
              : `${baseTitle} (continued)`,
        sections: columnSections.flat(),
        columns: columnSections.length,
        density:
          columnSections.length === 1
            ? "relaxed"
            : columnSections.length === 2
              ? "standard"
              : "compact",
        columnSections,
        pageInToc: index + 1,
        pageCountForToc: tocPageCount,
        continuation: index > 0,
      });
    }
  }
  pages.push(...songPages);
  pages.push({
    kind: "info",
    id: "print-about",
    title: context.locale === "zh-CN" ? "关于这本歌词本" : "About this LyricBook",
    body:
      context.locale === "zh-CN"
        ? "本文件由 LyricBook 在本机浏览器中生成。歌词及翻译版权归各自权利人所有；请仅使用你有权保存和打印的内容。"
        : "Generated locally by LyricBook. Lyrics and translations remain the property of their respective rights holders; only store and print content you are permitted to use.",
  });

  const padded =
    context.options.format === "booklet" ? paddedBookletPageCount(pages.length) : pages.length;
  while (pages.length < padded) pages.push({ kind: "blank", id: `blank-${pages.length + 1}` });
  const theme = context.project.themes.find((item) => item.id === context.project.activeThemeId);
  return {
    format: context.options.format,
    pages,
    bookletSheets: context.options.format === "booklet" ? imposeBooklet(pages.length) : [],
    paddedPageCount: padded,
    songCount: songs.length,
    theme,
  };
}
