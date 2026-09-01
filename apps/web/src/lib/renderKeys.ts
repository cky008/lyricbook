import type { LyricTrack, LocalizedText } from "@domain/index";

function localizedIdentity(value: LocalizedText | undefined): string {
  if (!value) return "";
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, text]) => `${language}:${text}`)
    .join("|");
}

function lyricTrackIdentity(track: LyricTrack): string {
  const persistentId = track.id?.trim();
  if (persistentId) return `id:${persistentId}`;
  return [
    "fallback",
    track.role,
    track.language,
    track.alignedTo ?? "",
    localizedIdentity(track.label),
  ].join(":");
}

export function keyedLyricTracks(
  tracks: readonly LyricTrack[],
): Array<{ track: LyricTrack; key: string; index: number }> {
  const occurrences = new Map<string, number>();
  return tracks.map((track, index) => {
    const identity = lyricTrackIdentity(track);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return {
      track,
      index,
      key: `${identity}:${occurrence}`,
    };
  });
}
