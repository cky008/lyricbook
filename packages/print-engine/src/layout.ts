import { getLocalized, setlistSongIds } from "@domain/index";
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
import { imposeBooklet, paddedBookletPageCount, type BookletSheet } from "./booklet";

export interface PrintTrackBlock {
  id: string;
  label: string;
  language: string;
  role: string;
  text: string;
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
}

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
  titleSize: number;
  columns: number;
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

const CAPACITY: Record<Exclude<PrintFormat, "booklet">, Record<number, number>> = {
  a4: { 1: 56, 2: 102, 3: 142 },
  a5: { 1: 39, 2: 70, 3: 96 },
};

function capacityFor(format: Exclude<PrintFormat, "booklet">, columns: number): number {
  return CAPACITY[format][columns] ?? CAPACITY[format][1] ?? 1;
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

function splitTrackText(text: string, lineLimit: number): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  if (!rawLines.length) return [""];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLines = 0;
  for (const line of rawLines) {
    const estimated = Math.max(1, Math.ceil(lineWeight(line) / 34));
    if (current.length && currentLines + estimated > lineLimit) {
      chunks.push(current.join("\n"));
      current = [];
      currentLines = 0;
    }
    current.push(line);
    currentLines += estimated;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks.length ? chunks : [""];
}

function chooseLayout(
  format: Exclude<PrintFormat, "booklet">,
  trackTexts: string[],
  strategy: PrintOptions["strategy"],
): {
  columns: number;
  fontSize: number;
  titleSize: number;
  pageCount: number;
  lineLimit: number;
  compact: boolean;
} {
  const baseFormat = format;
  const candidates =
    strategy === "readable" ? [1, 2] : strategy === "compact" ? [2, 3, 1] : [1, 2, 3];
  const fontRange = baseFormat === "a4" ? [20, 18, 16, 14, 12, 10] : [15, 14, 13, 12, 11, 9];
  for (const columns of candidates) {
    for (const fontSize of fontRange) {
      const scale = (baseFormat === "a4" ? 12 : 10.5) / fontSize;
      const lineLimit = Math.floor(capacityFor(baseFormat, columns) * scale);
      const visualLines = trackTexts.reduce(
        (total, text) =>
          total + estimateVisualLines(text, columns === 1 ? 42 : columns === 2 ? 31 : 24),
        0,
      );
      if (visualLines <= lineLimit) {
        return {
          columns,
          fontSize,
          titleSize: Math.max(fontSize + 8, baseFormat === "a4" ? 22 : 18),
          pageCount: 1,
          lineLimit,
          compact: fontSize <= (baseFormat === "a4" ? 12 : 10),
        };
      }
    }
  }
  const columns = strategy === "readable" ? 2 : 3;
  const fontSize = baseFormat === "a4" ? 10 : 8;
  const lineLimit = capacityFor(baseFormat, columns);
  const totalLines = trackTexts.reduce(
    (total, text) => total + estimateVisualLines(text, columns === 2 ? 31 : 24),
    0,
  );
  const maximum =
    strategy === "strict-page-limit" ? 1 : Math.max(1, Math.ceil(totalLines / lineLimit));
  return {
    columns,
    fontSize,
    titleSize: baseFormat === "a4" ? 18 : 15,
    pageCount: maximum,
    lineLimit,
    compact: true,
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
        titleSize: format === "a4" ? 27 : 20,
        columns: 1,
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
    const layout = chooseLayout(
      format,
      nonEmptyTracks.map((track) => track.text),
      context.options.strategy,
    );
    const versionLabel =
      song.lyricVersions.length > 1 ? getLocalized(version.label, context.locale) : undefined;

    if (layout.pageCount === 1) {
      allPages.push({
        kind: "song",
        id: `print-song-${song.id}-${version.id}-1`,
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        versionLabel,
        pageInSong: 1,
        pageCountForSong: 1,
        tracks: nonEmptyTracks.map((track, trackIndex) => ({
          id: `${version.id}:${track.id ?? `${track.role}:${track.language}:${trackIndex}`}`,
          label: getLocalized(track.label, context.locale) || track.role,
          language: track.language,
          role: track.role,
          text: track.text,
        })),
        fontSize: layout.fontSize,
        titleSize: layout.titleSize,
        columns: Math.min(layout.columns, Math.max(1, nonEmptyTracks.length)),
        compact: layout.compact,
      });
      continue;
    }

    const chunksByTrack = nonEmptyTracks.map((track) =>
      splitTrackText(track.text, layout.lineLimit),
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
        })),
        fontSize: layout.fontSize,
        titleSize: layout.titleSize,
        columns: Math.min(layout.columns, Math.max(1, nonEmptyTracks.length)),
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

function tocColumns(entryCount: number, format: Exclude<PrintFormat, "booklet">): number {
  if (format === "a5") return entryCount > 38 ? 2 : 1;
  if (entryCount <= 42) return 1;
  if (entryCount <= 90) return 2;
  return 3;
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
  const frontMatterOffset =
    (includeCover ? 1 : 0) + (context.options.includeTableOfContents ? 1 : 0);

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
    let cursor = frontMatterOffset + 1;
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
        pageNumber: cursor,
        section,
      };
      const existing = tocSections.get(section) ?? [];
      existing.push(entry);
      tocSections.set(section, existing);
      cursor += count;
      sequence += 1;
    }
    const sectionList = [...tocSections].map(([label, entries]) => ({ label, entries }));
    const count = sectionList.reduce((sum, section) => sum + section.entries.length, 0);
    pages.push({
      kind: "toc",
      id: "print-toc-1",
      title: context.locale === "zh-CN" ? "演出目录" : "Setlist contents",
      sections: sectionList,
      columns: tocColumns(count, baseFormat),
    });
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
