import { createId, normalizeSongLookup } from "./ids";
import { createEmptySong } from "./project";
import type { LyricBookProject, Setlist, SetlistItem, Song, UiLocale } from "./types";

export interface ParsedSetlist {
  setlist: Setlist;
  createdSongs: Song[];
  unmatchedLines: string[];
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
