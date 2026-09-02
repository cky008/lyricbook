import { createId, normalizeSongLookup } from "./ids";
import { getLocalized } from "./localize";
import { createEmptySong } from "./project";
import type { LyricBookProject, Setlist, SetlistItem, Song, UiLocale } from "./types";

export interface ParsedSetlist {
  setlist: Setlist;
  createdSongs: Song[];
  unmatchedLines: string[];
}

export interface AppliedSetlistMarkdown {
  project: LyricBookProject;
  createdSongs: Song[];
  unmatchedLines: string[];
}

const ITEM_METADATA = /\s*<!--\s*lyricbook:item=(\d+)(?:;song=([^\s]+))?\s*-->\s*$/i;

function localizedLanguage(locale: UiLocale): string {
  return locale === "zh-CN" ? "zh-Hans" : "en";
}

function markdownLabel(value: string): string {
  return value.replace(/\s*\n\s*/g, " ").trim();
}

function itemMetadata(index: number, songId?: string): string {
  const song = songId ? `;song=${encodeURIComponent(songId)}` : "";
  return `<!-- lyricbook:item=${index}${song} -->`;
}

function decodeMetadata(line: string): {
  content: string;
  sourceIndex?: number;
  songId?: string;
} {
  const match = ITEM_METADATA.exec(line);
  if (!match) return { content: line.trim() };
  const sourceIndex = Number(match[1]);
  let songId: string | undefined;
  try {
    songId = match[2] ? decodeURIComponent(match[2]) : undefined;
  } catch {
    songId = undefined;
  }
  return {
    content: line.slice(0, match.index).trim(),
    sourceIndex: Number.isSafeInteger(sourceIndex) ? sourceIndex : undefined,
    songId,
  };
}

function withoutOptional<T extends { optional?: boolean }>(value: T, optional: boolean): T {
  const next = { ...value };
  if (optional) next.optional = true;
  else delete next.optional;
  return next;
}

/**
 * Format editable setlist items as readable Markdown. Small HTML comments retain
 * stable references and item metadata while remaining inert Markdown text.
 */
export function serializeSetlistMarkdown(
  setlist: Setlist,
  project: LyricBookProject,
  locale: UiLocale,
): string {
  const songMap = new Map(project.songs.map((song) => [song.id, song]));
  return setlist.items
    .map((item, index) => {
      const metadata = itemMetadata(index, item.type === "song" ? item.songId : undefined);
      if (item.type === "section") {
        const label = markdownLabel(Object.values(item.label).find(Boolean) ?? "");
        return `## ${item.optional ? "[optional] " : ""}${label} ${metadata}`.trim();
      }
      if (item.type === "song") {
        const title = markdownLabel(
          getLocalized(songMap.get(item.songId)?.titles, locale) || item.songId,
        );
        return `- ${item.optional ? "[ ] " : ""}${title} ${metadata}`.trim();
      }
      if (item.type === "note") {
        return `[note] ${markdownLabel(getLocalized(item.text, locale))} ${metadata}`.trim();
      }
      const label = markdownLabel(getLocalized(item.label, locale));
      return `[break]${label ? ` ${label}` : ""} ${metadata}`.trim();
    })
    .join("\n");
}

function uniqueSongMatch(project: LyricBookProject, raw: string): Song | undefined {
  const key = normalizeSongLookup(raw);
  const matches = project.songs.filter((song) =>
    [...Object.values(song.titles), ...song.aliases].some(
      (candidate) => normalizeSongLookup(candidate) === key,
    ),
  );
  if (matches.length > 1) {
    throw new Error(`Ambiguous song title: ${raw}`);
  }
  return matches[0];
}

/**
 * Atomically apply Markdown to one existing setlist. Parsing happens against a
 * clone, so invalid or ambiguous text cannot partially mutate the live project.
 */
export function applySetlistMarkdown(
  text: string,
  project: LyricBookProject,
  setlistId: string,
  locale: UiLocale,
): AppliedSetlistMarkdown {
  const next = structuredClone(project);
  const setlist = next.setlists.find((item) => item.id === setlistId);
  if (!setlist) throw new Error(`Setlist does not exist: ${setlistId}`);
  const originalItems = setlist.items;
  const language = localizedLanguage(locale);
  const items: SetlistItem[] = [];
  const createdSongs: Song[] = [];
  const unmatchedLines: string[] = [];

  for (const originalLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const { content, sourceIndex, songId: metadataSongId } = decodeMetadata(originalLine);
    if (!content || content === "---") continue;
    const sourceItem = sourceIndex === undefined ? undefined : originalItems[sourceIndex];

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(content);
    if (headingMatch) {
      const rawLabel = headingMatch[2]?.trim() ?? "";
      const optional = /^\[optional\]\s+/i.test(rawLabel);
      const label = rawLabel.replace(/^\[optional\]\s+/i, "").trim();
      if (!label) throw new Error("A setlist section heading cannot be empty");
      const base =
        sourceItem?.type === "section"
          ? { ...sourceItem, label: { ...sourceItem.label, [language]: label } }
          : { type: "section" as const, label: { [language]: label } };
      items.push(withoutOptional(base, optional));
      continue;
    }

    const noteMatch = /^\[(?:note|talk|备注|talking)\]\s*(.*)$/i.exec(content);
    if (noteMatch) {
      const value = noteMatch[1]?.trim() ?? "";
      if (!value) throw new Error("A setlist note cannot be empty");
      items.push(
        sourceItem?.type === "note"
          ? { ...sourceItem, text: { ...sourceItem.text, [language]: value } }
          : { type: "note", text: { [language]: value } },
      );
      continue;
    }

    const breakMatch = /^\[(?:break|间隔)\](?:\s+(.*))?$/i.exec(content);
    if (breakMatch) {
      const value = breakMatch[1]?.trim() ?? "";
      const base = sourceItem?.type === "break" ? { ...sourceItem } : { type: "break" as const };
      if (value) {
        base.label = {
          ...(sourceItem?.type === "break" ? sourceItem.label : {}),
          [language]: value,
        };
      } else {
        delete base.label;
      }
      items.push(base);
      continue;
    }

    const optionalMatch = /^\s*(?:[-*+]\s+)?\[\s\]\s+(.+)$/.exec(content);
    const checkedMatch = /^\s*(?:[-*+]\s+)?\[[xX]\]\s+(.+)$/.exec(content);
    const songTitle = stripListPrefix(optionalMatch?.[1] ?? checkedMatch?.[1] ?? content);
    if (!songTitle) throw new Error("A song entry cannot be empty");

    const metadataSong = metadataSongId
      ? next.songs.find((song) => song.id === metadataSongId)
      : undefined;
    const metadataStillMatches = metadataSong
      ? [...Object.values(metadataSong.titles), ...metadataSong.aliases].some(
          (candidate) => normalizeSongLookup(candidate) === normalizeSongLookup(songTitle),
        )
      : false;
    let song = metadataStillMatches ? metadataSong : uniqueSongMatch(next, songTitle);
    if (!song) {
      song = createEmptySong(songTitle, language);
      next.songs.push(song);
      createdSongs.push(song);
      unmatchedLines.push(songTitle);
    }
    const base =
      sourceItem?.type === "song" && sourceItem.songId === song.id
        ? { ...sourceItem }
        : { type: "song" as const, songId: song.id };
    items.push(withoutOptional(base, Boolean(optionalMatch)));
  }

  setlist.items = items;
  return { project: next, createdSongs, unmatchedLines };
}

function lookupSong(project: LyricBookProject, raw: string): Song | undefined {
  const key = normalizeSongLookup(raw);
  return project.songs.find((song) => {
    const candidates = [...Object.values(song.titles), ...song.aliases];
    return candidates.some((candidate) => normalizeSongLookup(candidate) === key);
  });
}

function stripListPrefix(value: string): string {
  return value.replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/, "").trim();
}

export function parseSetlistText(
  text: string,
  project: LyricBookProject,
  locale: UiLocale,
  title = locale === "zh-CN" ? "导入歌单" : "Imported setlist",
): ParsedSetlist {
  const items: SetlistItem[] = [];
  const createdSongs: Song[] = [];
  const unmatchedLines: string[] = [];
  const language = locale === "zh-CN" ? "zh-Hans" : "en";

  for (const originalLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = originalLine.trim();
    if (!line || line === "---") continue;
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const label = headingMatch[2]?.trim() ?? "";
      if (label) items.push({ type: "section", label: { [language]: label } });
      continue;
    }
    if (/^(encore|返场|安可|part\s*\d+|act\s*\d+)\s*:?$/i.test(line)) {
      items.push({ type: "section", label: { [language]: line.replace(/:$/, "") } });
      continue;
    }
    if (/^\[(note|talk|备注|talking)\]/i.test(line)) {
      items.push({ type: "note", text: { [language]: line.replace(/^\[[^\]]+\]\s*/, "") } });
      continue;
    }
    const songTitle = stripListPrefix(line);
    if (!songTitle) continue;
    const found = lookupSong({ ...project, songs: [...project.songs, ...createdSongs] }, songTitle);
    if (found) {
      items.push({ type: "song", songId: found.id });
    } else {
      const song = createEmptySong(songTitle, language);
      createdSongs.push(song);
      items.push({ type: "song", songId: song.id });
      unmatchedLines.push(songTitle);
    }
  }

  return {
    setlist: {
      id: createId("setlist", title),
      title: { [language]: title },
      status: "draft",
      items,
    },
    createdSongs,
    unmatchedLines,
  };
}

export function setlistSongIds(setlist: Setlist | undefined, includeOptional = true): string[] {
  if (!setlist) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of setlist.items) {
    if (item.type !== "song" || (!includeOptional && item.optional) || seen.has(item.songId))
      continue;
    seen.add(item.songId);
    result.push(item.songId);
  }
  return result;
}
