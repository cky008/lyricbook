import {
  getLocalized,
  type LyricBookProject,
  type Setlist,
  type Song,
  type UiLocale,
} from "@domain/index";

export function activeSetlist(project: LyricBookProject): Setlist | undefined {
  return (
    project.setlists.find((setlist) => setlist.id === project.activeSetlistId) ??
    project.setlists[0]
  );
}

export function orderedSongIds(project: LyricBookProject, includeOptional = true): string[] {
  const setlist = activeSetlist(project);
  if (!setlist) return project.songs.map((song) => song.id);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of setlist.items) {
    if (item.type !== "song" || (!includeOptional && item.optional) || seen.has(item.songId))
      continue;
    seen.add(item.songId);
    result.push(item.songId);
  }
  for (const song of project.songs) {
    if (!seen.has(song.id)) result.push(song.id);
  }
  return result;
}

export function songTitle(song: Song, locale: UiLocale): string {
  return getLocalized(song.titles, locale) || song.id;
}

export function currentVersionId(project: LyricBookProject, song: Song): string {
  const selected = project.preferences?.activeVersionBySong?.[song.id];
  if (selected && song.lyricVersions.some((version) => version.id === selected)) return selected;
  return (
    song.lyricVersions.find((version) => version.isDefault)?.id ?? song.lyricVersions[0]?.id ?? ""
  );
}
