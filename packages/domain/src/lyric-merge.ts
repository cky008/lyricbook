import { validateProject } from "./schema";
import type { LyricBookProject, LyricVersion, Song, Source } from "./types";

export interface LyricMergeReport {
  /** Nonempty donor songs unambiguously matched to existing library songs. */
  matchedSongs: number;
  /** Existing songs whose lyrics, default, or citations changed. */
  updatedSongs: number;
  addedSongs: number;
  /** Distinct nonempty versions copied, including filled placeholders and new songs. */
  addedVersions: number;
  /** Donor song ids skipped because their title/alias matching was ambiguous. */
  ambiguousSongs: string[];
  emptySongs: number;
}

export interface LyricMergeResult {
  project: LyricBookProject;
  report: LyricMergeReport;
}

function hasLyrics(version: LyricVersion): boolean {
  return version.tracks.some((track) => track.text.trim().length > 0);
}

function assertValidProject(project: LyricBookProject): void {
  const result = validateProject(project);
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  for (const song of project.songs) {
    const versionIds = new Set<string>();
    for (const version of song.lyricVersions) {
      if (versionIds.has(version.id)) throw new Error(`Duplicate lyric version id: ${version.id}`);
      versionIds.add(version.id);
      const trackIds = version.tracks.flatMap((track) => (track.id ? [track.id] : []));
      if (new Set(trackIds).size !== trackIds.length) {
        throw new Error(`Duplicate lyric track id in version: ${version.id}`);
      }
    }
  }
}

function normalizedNames(song: Song): Set<string> {
  return new Set(
    [...Object.values(song.titles), ...song.aliases]
      .map((title) => title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase())
      .filter(Boolean),
  );
}

/** Sort object keys without modifying values, including lyric whitespace. */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function semanticKey(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function versionKey(version: LyricVersion): string {
  const trackPositions = new Map(
    version.tracks.flatMap((track, index) => (track.id ? [[track.id, index] as const] : [])),
  );
  return semanticKey({
    label: version.label,
    kind: version.kind,
    note: version.note,
    tracks: version.tracks.map(({ id: _id, alignedTo, ...track }) => ({
      ...track,
      ...(alignedTo
        ? {
            alignedTo: trackPositions.has(alignedTo)
              ? { track: trackPositions.get(alignedTo) }
              : { id: alignedTo },
          }
        : {}),
    })),
  });
}

function uniqueId(preferred: string, used: Set<string>): string {
  let candidate = preferred;
  for (let suffix = 1; used.has(candidate); suffix += 1) {
    candidate = `${preferred}-imported${suffix === 1 ? "" : `-${suffix}`}`;
  }
  used.add(candidate);
  return candidate;
}

function sourceKey({ id: _id, ...source }: Source): string {
  return semanticKey(source);
}

function sourceMerger(project: LyricBookProject, source: LyricBookProject) {
  const sourceById = new Map((source.sources ?? []).map((entry) => [entry.id, entry]));
  const usedIds = new Set((project.sources ?? []).map((entry) => entry.id));
  const equivalentIds = new Map(
    (project.sources ?? []).map((entry) => [sourceKey(entry), entry.id]),
  );
  return (refs: string[]): string[] =>
    refs.map((id) => {
      const entry = sourceById.get(id);
      // Both projects have already passed referential validation.
      if (!entry) throw new Error(`Missing source reference: ${id}`);
      const key = sourceKey(entry);
      const equivalentId = equivalentIds.get(key);
      if (equivalentId !== undefined) return equivalentId;
      const importedId = uniqueId(id, usedIds);
      project.sources ??= [];
      project.sources.push({ ...structuredClone(entry), id: importedId });
      equivalentIds.set(key, importedId);
      return importedId;
    });
}

function mergeVersions(target: Song, source: Song, selectedId?: string): number {
  const donorVersions = source.lyricVersions.filter(hasLyrics);
  const preferredDonor = donorVersions.find((version) => version.isDefault) ?? donorVersions[0];
  if (!preferredDonor) return 0;

  let added = 0;
  let populatedDefault = target.lyricVersions.find(
    (version) => version.isDefault && hasLyrics(version),
  );
  if (!populatedDefault) {
    populatedDefault =
      target.lyricVersions.find((version) => version.id === selectedId && hasLyrics(version)) ??
      target.lyricVersions.find(hasLyrics);
    if (!populatedDefault) {
      const placeholder =
        target.lyricVersions.find((version) => version.isDefault) ?? target.lyricVersions[0];
      const imported = structuredClone(preferredDonor);
      if (placeholder) {
        imported.id = placeholder.id;
        target.lyricVersions[target.lyricVersions.indexOf(placeholder)] = imported;
      } else {
        target.lyricVersions.push(imported);
      }
      populatedDefault = imported;
      added += 1;
    }
    for (const version of target.lyricVersions) version.isDefault = version === populatedDefault;
  }

  const keys = new Set(target.lyricVersions.filter(hasLyrics).map(versionKey));
  const usedIds = new Set(target.lyricVersions.map((version) => version.id));
  for (const donorVersion of donorVersions) {
    const key = versionKey(donorVersion);
    if (keys.has(key)) continue;
    target.lyricVersions.push({
      ...structuredClone(donorVersion),
      id: uniqueId(donorVersion.id, usedIds),
      isDefault: false,
    });
    keys.add(key);
    added += 1;
  }
  return added;
}

/**
 * Add private lyric versions to a current project without replacing its setlists.
 * Identity matching is deterministic: stable ids, then unique explicit names.
 * Sources and versions are deduplicated by content so repeat imports are harmless.
 */
export function mergeProjectLyrics(
  target: LyricBookProject,
  source: LyricBookProject,
): LyricMergeResult {
  assertValidProject(target);
  assertValidProject(source);
  const project = structuredClone(target);
  const report: LyricMergeReport = {
    matchedSongs: 0,
    updatedSongs: 0,
    addedSongs: 0,
    addedVersions: 0,
    ambiguousSongs: [],
    emptySongs: 0,
  };
  const targetById = new Map(project.songs.map((song) => [song.id, song]));
  const names = new Map<string, Set<string>>();
  for (const song of project.songs) {
    for (const name of normalizedNames(song)) {
      const ids = names.get(name) ?? new Set<string>();
      ids.add(song.id);
      names.set(name, ids);
    }
  }
  const nonemptyDonors = source.songs.filter((song) => song.lyricVersions.some(hasLyrics));
  report.emptySongs = source.songs.length - nonemptyDonors.length;
  const stableMatches = new Set(
    nonemptyDonors.filter((song) => targetById.has(song.id)).map((song) => song.id),
  );
  const candidates = new Map<string, Set<string>>();
  const fallbackCounts = new Map<string, number>();
  for (const donor of nonemptyDonors) {
    if (stableMatches.has(donor.id)) continue;
    const ids = new Set(
      [...normalizedNames(donor)].flatMap((name) => [...(names.get(name) ?? [])]),
    );
    candidates.set(donor.id, ids);
    if (ids.size === 1) {
      for (const id of ids) fallbackCounts.set(id, (fallbackCounts.get(id) ?? 0) + 1);
    }
  }

  const importSources = sourceMerger(project, source);
  for (const donor of nonemptyDonors) {
    let matched = targetById.get(donor.id);
    if (!matched) {
      const ids = candidates.get(donor.id) ?? new Set<string>();
      const [id] = ids;
      if (
        ids.size > 1 ||
        (id !== undefined && (stableMatches.has(id) || (fallbackCounts.get(id) ?? 0) > 1))
      ) {
        report.ambiguousSongs.push(donor.id);
        continue;
      }
      if (id !== undefined) matched = targetById.get(id);
    }
    if (!matched) {
      const imported = structuredClone(donor);
      imported.lyricVersions = [];
      report.addedVersions += mergeVersions(imported, donor);
      imported.sourceRefs = [...new Set(importSources(donor.sourceRefs))];
      project.songs.push(imported);
      report.addedSongs += 1;
      continue;
    }

    report.matchedSongs += 1;
    const before = semanticKey(matched);
    const selections = project.preferences?.activeVersionBySong;
    const selectedId =
      selections && Object.hasOwn(selections, matched.id) ? selections[matched.id] : undefined;
    report.addedVersions += mergeVersions(matched, donor, selectedId);
    matched.sourceRefs = [...new Set([...matched.sourceRefs, ...importSources(donor.sourceRefs)])];
    if (
      selections &&
      selectedId !== undefined &&
      !matched.lyricVersions.some((version) => version.id === selectedId && hasLyrics(version))
    ) {
      const defaultVersion = matched.lyricVersions.find((version) => version.isDefault);
      if (defaultVersion) selections[matched.id] = defaultVersion.id;
    }
    if (before !== semanticKey(matched)) report.updatedSongs += 1;
  }
  assertValidProject(project);
  return { project, report };
}
