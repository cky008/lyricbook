import type {
  LocalCoverImage,
  LyricBookProject,
  LyricTrack,
  LyricVersion,
  PrintFormat,
  PrintLineFlow,
  PrintOptions,
  Setlist,
  Song,
  Theme,
  UiLocale,
} from "@domain/index";
import { getLocalized, resolveActiveTheme } from "@domain/index";
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
  optional: boolean;
  optionalLabel?: string;
}

export interface TocSection {
  label: string;
  optional: boolean;
  optionalLabel?: string;
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
  mode: "generated" | "image" | "image-with-text";
  image?: LocalCoverImage;
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
  lineFlow: Exclude<PrintLineFlow, "auto">;
  layoutSafety: PrintLayoutSafety;
  paginateOnOverflow: boolean;
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

function normalizePrintLyrics(text: string): string {
  const sourceLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""));
  while (sourceLines.length && !sourceLines[0]?.trim()) sourceLines.shift();
  while (sourceLines.length && !sourceLines.at(-1)?.trim()) sourceLines.pop();
  const output: string[] = [];
  let previousBlank = false;
  for (const line of sourceLines) {
    const blank = !line.trim();
    if (blank && previousBlank) continue;
    output.push(blank ? "" : line);
    previousBlank = blank;
  }
  return output.join("\n");
}

function isStructuralLyricLine(line: string): boolean {
  const value = line.trim();
  if (!value) return false;
  return (
    /^([[【（(].{0,24}[\]】）)]|#{1,4}\s|(?:verse|chorus|bridge|pre[- ]?chorus|intro|outro|hook|rap|repeat)\b|(?:主歌|副歌|桥段|前奏|间奏|尾奏|合唱|独白|念白|重复)(?=$|[\s\d０-９一二三四五六七八九十百零〇A-ZＡ-Ｚ:：([【（._—–-]))/i.test(
      value,
    ) || /^[A-Z\d][A-Z\d .&'’-]{1,22}:$/.test(value)
  );
}

/** Combine only consecutive short lyric lines, never crossing structural or stanza boundaries. */
export function mergeShortLyricLines(
  text: string,
  format: Exclude<PrintFormat, "booklet">,
): string {
  const source = normalizePrintLyrics(text);
  if (!source) return "";
  const shortLimit = format === "a4" ? 13.5 : 10.5;
  const targetLimit = format === "a4" ? 37 : 25;
  const maxParts = format === "a4" ? 3 : 2;
  const output: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    output.push(buffer.join(" / "));
    buffer = [];
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      if (output.at(-1) !== "") output.push("");
      continue;
    }
    const units = lineWeight(line);
    if (isStructuralLyricLine(line) || units > shortLimit * 1.45) {
      flush();
      output.push(line);
      continue;
    }
    if (!buffer.length) {
      buffer.push(line);
      continue;
    }
    const candidate = [...buffer, line].join(" / ");
    if (buffer.length < maxParts && units <= shortLimit && lineWeight(candidate) <= targetLimit) {
      buffer.push(line);
    } else {
      flush();
      buffer.push(line);
    }
  }
  flush();
  while (output[0] === "") output.shift();
  while (output.at(-1) === "") output.pop();
  return output.join("\n");
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

interface SetlistSongPlacement {
  songId: string;
  section: string;
  sectionOptional: boolean;
  optional: boolean;
}

function setlistSongPlacements(
  setlist: Setlist | undefined,
  locale: UiLocale,
): SetlistSongPlacement[] {
  if (!setlist) return [];
  const ordered: SetlistSongPlacement[] = [];
  const bySong = new Map<string, SetlistSongPlacement>();
  let section = "";
  let sectionOptional = false;
  for (const item of setlist.items) {
    if (item.type === "section") {
      section = getLocalized(item.label, locale) || section;
      sectionOptional = Boolean(item.optional);
      continue;
    }
    if (item.type !== "song") continue;
    const optional = sectionOptional || Boolean(item.optional);
    const existing = bySong.get(item.songId);
    if (!existing) {
      const placement = { songId: item.songId, section, sectionOptional, optional };
      bySong.set(item.songId, placement);
      ordered.push(placement);
      continue;
    }
    // A song that has any required appearance is itself required. Prefer the
    // required appearance's section without changing the song's first-seen order.
    if (existing.optional && !optional) {
      existing.optional = false;
      existing.section = section;
      existing.sectionOptional = sectionOptional;
    }
  }
  return ordered;
}

function includedSetlistSlotCount(setlist: Setlist | undefined, includeOptional: boolean): number {
  if (!setlist) return 0;
  let sectionOptional = false;
  let count = 0;
  for (const item of setlist.items) {
    if (item.type === "section") {
      sectionOptional = Boolean(item.optional);
      continue;
    }
    if (item.type === "song" && (includeOptional || !(sectionOptional || item.optional))) {
      count += 1;
    }
  }
  return count;
}

function songIdsForScope(context: BuildContext): string[] {
  const { project, options } = context;
  if (options.scope === "current-song") return context.currentSongId ? [context.currentSongId] : [];
  if (options.scope === "filtered")
    return context.filteredSongIds ?? project.songs.map((song) => song.id);
  if (options.scope === "active-setlist") {
    const setlist = project.setlists.find((item) => item.id === project.activeSetlistId);
    return setlistSongPlacements(setlist, context.locale)
      .filter((placement) => options.includeOptional || !placement.optional)
      .map((placement) => placement.songId);
  }
  return project.songs.map((song) => song.id);
}

function splitTrackText(
  text: string,
  lineLimit: number,
  charsPerLine: number,
  minimumPageCount = 1,
): string[] {
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  if (!rawLines.length) return [""];
  const weightedLines = rawLines.map((line) => ({
    line,
    weight: Math.max(1, Math.ceil(lineWeight(line) / charsPerLine)),
  }));
  const totalWeight = weightedLines.reduce((sum, line) => sum + line.weight, 0);
  const naturalPageCount = Math.max(1, Math.ceil(totalWeight / lineLimit));
  const pageCount = Math.max(minimumPageCount, naturalPageCount);
  if (pageCount === 1) return [rawLines.join("\n")];
  if (rawLines.length === 1 && naturalPageCount > 1) {
    return splitContinuousText(rawLines[0] ?? "", naturalPageCount);
  }
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

/** Split a continuous line at Unicode code-point boundaries without dropping content. */
export function splitContinuousText(text: string, requestedParts: number): string[] {
  const units = Array.from(text);
  const partCount = Math.min(
    units.length,
    Math.max(1, Number.isFinite(requestedParts) ? Math.floor(requestedParts) : 1),
  );
  if (partCount <= 1) return [text];

  const chunks: string[] = [];
  let offset = 0;
  for (let index = 0; index < partCount; index += 1) {
    const remainingUnits = units.length - offset;
    const remainingParts = partCount - index;
    const take = Math.ceil(remainingUnits / remainingParts);
    chunks.push(units.slice(offset, offset + take).join(""));
    offset += take;
  }
  return chunks;
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
  const capacityColumns = candidate.layoutMode === "balanced-text" ? candidate.textColumns : 1;
  return Math.max(
    1,
    Math.floor(capacityFor(format, capacityColumns) * (referenceFontSize / fontSize)),
  );
}

function visualLinesFor(trackTexts: string[], candidate: SongLayoutCandidate): number {
  const charsPerLine = charsPerLineFor(candidate);
  const visualLines = trackTexts.map((text) => estimateVisualLines(text, charsPerLine));
  return candidate.layoutMode === "parallel-tracks"
    ? Math.max(0, ...visualLines)
    : visualLines.reduce((total, lines) => total + lines, 0);
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
  const originalAndTranslation =
    trackCount === 2 &&
    tracks.some((track) => track.role === "original") &&
    tracks.some((track) => track.role === "translation");
  return aligned || originalAndTranslation ? [parallel, stacked] : [stacked];
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
    (best, candidate) => {
      const candidatePages = Math.ceil(
        visualLinesFor(trackTexts, candidate) /
          Math.max(1, lineLimitFor(format, candidate, bounds.minimum)),
      );
      const bestPages = Math.ceil(
        visualLinesFor(trackTexts, best) / Math.max(1, lineLimitFor(format, best, bounds.minimum)),
      );
      return candidatePages < bestPages ? candidate : best;
    },
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

interface ChosenLineFlow {
  tracks: LyricTrack[];
  lineFlow: Exclude<PrintLineFlow, "auto">;
  layout: ChosenSongLayout;
}

function estimatedPageCount(layout: ChosenSongLayout, tracks: LyricTrack[]): number {
  if (!layout.requiresPagination) return 1;
  const total = visualLinesFor(
    tracks.map((track) => track.text),
    layout,
  );
  const safeCapacity = Math.max(1, layout.lineLimit * PAGINATION_SAFETY_FACTOR);
  return Math.max(1, Math.ceil(total / safeCapacity));
}

function chooseLineFlow(
  format: Exclude<PrintFormat, "booklet">,
  tracks: LyricTrack[],
  options: Pick<PrintOptions, "lineFlow" | "strategy">,
): ChosenLineFlow {
  const preserved = tracks.map((track) => ({ ...track }));
  const choices: Array<{ tracks: LyricTrack[]; lineFlow: Exclude<PrintLineFlow, "auto"> }> = [
    { tracks: preserved, lineFlow: "preserve" },
  ];
  // Independent tracks must not acquire different grouping boundaries. Until
  // paired row groups are available, slash flow is deliberately monolingual.
  if (tracks.length === 1 && options.lineFlow !== "preserve") {
    const mergedText = mergeShortLyricLines(tracks[0]?.text ?? "", format);
    if (options.lineFlow === "slash" || mergedText !== tracks[0]?.text) {
      choices.push({
        tracks: [{ ...tracks[0], text: mergedText } as LyricTrack],
        lineFlow: "slash",
      });
    }
  }

  const candidates = choices.map((choice) => ({
    ...choice,
    layout: chooseLayout(format, choice.tracks, options.strategy),
  }));
  const firstCandidate = candidates[0];
  if (!firstCandidate) throw new Error("At least one lyric line-flow candidate is required");
  if (options.lineFlow === "slash") {
    return candidates.find((candidate) => candidate.lineFlow === "slash") ?? firstCandidate;
  }
  if (options.lineFlow === "preserve") return firstCandidate;

  return candidates.slice(1).reduce((best, candidate) => {
    const candidatePages = estimatedPageCount(candidate.layout, candidate.tracks);
    const bestPages = estimatedPageCount(best.layout, best.tracks);
    if (candidatePages !== bestPages) return candidatePages < bestPages ? candidate : best;
    if (candidate.layout.fontSize !== best.layout.fontSize) {
      return candidate.layout.fontSize > best.layout.fontSize ? candidate : best;
    }
    const candidateColumns = Math.max(candidate.layout.trackColumns, candidate.layout.textColumns);
    const bestColumns = Math.max(best.layout.trackColumns, best.layout.textColumns);
    if (candidateColumns !== bestColumns) return candidateColumns < bestColumns ? candidate : best;
    return best.lineFlow === "preserve" ? best : candidate;
  }, firstCandidate);
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
        lineFlow: "preserve",
        layoutSafety: "pending",
        paginateOnOverflow: true,
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
    const flow = chooseLineFlow(format, nonEmptyTracks, context.options);
    const layout = flow.layout;
    const preparedTracks = flow.tracks;
    const versionLabel =
      song.lyricVersions.length > 1 ? getLocalized(version.label, context.locale) : undefined;

    const printTracks = preparedTracks.map((track, trackIndex) => ({
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
        lineFlow: flow.lineFlow,
        layoutSafety: layout.layoutSafety,
        paginateOnOverflow: context.options.strategy !== "strict-page-limit",
        compact: layout.compact,
      });
      continue;
    }

    const capacityDivisor = layout.layoutMode === "parallel-tracks" ? 1 : preparedTracks.length;
    const perTrackLineLimit = Math.max(
      1,
      Math.floor((layout.lineLimit * PAGINATION_SAFETY_FACTOR) / Math.max(1, capacityDivisor)),
    );
    const initialChunksByTrack = preparedTracks.map((track) =>
      splitTrackText(track.text, perTrackLineLimit, layout.charsPerLine),
    );
    const pageCount = Math.max(...initialChunksByTrack.map((chunks) => chunks.length));
    const chunksByTrack = preparedTracks.map((track, trackIndex) => {
      const chunks = initialChunksByTrack[trackIndex] ?? [""];
      return chunks.length < pageCount
        ? splitTrackText(track.text, perTrackLineLimit, layout.charsPerLine, pageCount)
        : chunks;
    });
    for (let index = 0; index < pageCount; index += 1) {
      allPages.push({
        kind: "song",
        id: `print-song-${song.id}-${version.id}-${index + 1}`,
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        versionLabel,
        pageInSong: index + 1,
        pageCountForSong: pageCount,
        tracks: preparedTracks.map((track, trackIndex) => ({
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
        lineFlow: flow.lineFlow,
        layoutSafety: layout.layoutSafety,
        paginateOnOverflow: true,
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
  sectionOptional: boolean;
  sectionOptionalLabel?: string;
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
  const badgeWeight = entry.optionalLabel ? 0.35 : 0;
  return 1 + (lines - 1) * 0.85 + badgeWeight;
}

function tocSectionWeight(
  section: Pick<TocSection, "label" | "optionalLabel">,
  format: Exclude<PrintFormat, "booklet">,
  columns: number,
): number {
  const text = `${section.label}${section.optionalLabel ? ` ${section.optionalLabel}` : ""}`;
  const lines = Math.max(1, Math.ceil(lineWeight(text) / tocCharactersPerLine(format, columns)));
  return 1.5 + (lines - 1) * 0.9;
}

function appendTocEntry(sections: TocSection[], row: TocRow): void {
  const current = sections.at(-1);
  if (current?.label === row.sectionLabel && current.optional === row.sectionOptional) {
    current.entries.push(row.entry);
    return;
  }
  sections.push({
    label: row.sectionLabel,
    optional: row.sectionOptional,
    optionalLabel: row.sectionOptionalLabel,
    entries: [row.entry],
  });
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
      const lastSection = sections.at(-1);
      const startsSection =
        lastSection?.label !== row.sectionLabel || lastSection.optional !== row.sectionOptional;
      const weight =
        tocEntryWeight(row.entry, format, columns) +
        (startsSection
          ? tocSectionWeight(
              { label: row.sectionLabel, optionalLabel: row.sectionOptionalLabel },
              format,
              columns,
            )
          : 0);
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
    section.entries.map((entry) => ({
      sectionLabel: section.label,
      sectionOptional: section.optional,
      sectionOptionalLabel: section.optionalLabel,
      entry,
    })),
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
  const placements = setlistSongPlacements(setlist, context.locale);
  const placementBySong = new Map(placements.map((placement) => [placement.songId, placement]));
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
        ? includedSetlistSlotCount(setlist, context.options.includeOptional)
        : undefined;
    const hasRepeatedSlots = Boolean(setlistSlots && setlistSlots > songs.length);
    const requestedCoverMode = context.options.coverMode ?? "generated";
    const coverMode =
      requestedCoverMode !== "generated" && context.options.coverImage
        ? requestedCoverMode
        : "generated";

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
      mode: coverMode,
      image: coverMode === "generated" ? undefined : structuredClone(context.options.coverImage),
    });
  }

  if (context.options.includeTableOfContents) {
    const tocSections = new Map<string, TocSection>();
    const optionalLabel = context.locale === "zh-CN" ? "可选" : "Optional";
    let sequence = 1;
    for (const song of songs) {
      const count = songPages.filter((page) => page.songId === song.id).length;
      if (!count) continue;
      const placement = placementBySong.get(song.id);
      const section =
        placement?.section || (context.locale === "zh-CN" ? "演出曲目" : "Concert songs");
      const sectionOptional = Boolean(placement?.sectionOptional);
      const entryOptional = Boolean(placement?.optional);
      const entry: TocEntry = {
        songId: song.id,
        title: getLocalized(song.titles, context.locale),
        sequence,
        pageNumber: 0,
        section,
        optional: entryOptional,
        optionalLabel: entryOptional ? optionalLabel : undefined,
      };
      const sectionKey = `${sectionOptional ? "optional" : "required"}\u0000${section}`;
      const existing = tocSections.get(sectionKey);
      if (existing) {
        existing.entries.push(entry);
      } else {
        tocSections.set(sectionKey, {
          label: section,
          optional: sectionOptional,
          optionalLabel: sectionOptional ? optionalLabel : undefined,
          entries: [entry],
        });
      }
      sequence += 1;
    }
    const sectionList = [...tocSections.values()];
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
  const theme = resolveActiveTheme(context.project);
  return {
    format: context.options.format,
    pages,
    bookletSheets: context.options.format === "booklet" ? imposeBooklet(pages.length) : [],
    paddedPageCount: padded,
    songCount: songs.length,
    theme,
  };
}
