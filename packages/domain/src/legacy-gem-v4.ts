import { createId, normalizeSongLookup } from "./ids";
import { DEFAULT_THEME, touchProject } from "./project";
import {
  SCHEMA_VERSION,
  type LyricBookProject,
  type LyricVersion,
  type Setlist,
  type SetlistItem,
  type SetlistStatus,
  type Song,
} from "./types";

interface LegacyGemVersion {
  id?: string;
  name?: string;
  type?: string;
  originalLabel?: string;
  translationLabel?: string;
  original?: string;
  translation?: string;
  note?: string;
  lineAligned?: boolean;
}

interface LegacyGemLibraryEntry {
  versions?: LegacyGemVersion[];
  defaultVersionId?: string;
  selectedVersionId?: string;
}

interface LegacyGemSetlistItem {
  raw?: string;
  songId?: string;
  optional?: boolean;
  confidence?: string | number;
}

interface LegacyGemSetlistSection {
  name?: string;
  kind?: string;
  optional?: boolean;
  confidence?: string | number;
  description?: string;
  items?: LegacyGemSetlistItem[];
}

interface LegacyGemSetlist {
  id?: string;
  name?: string;
  status?: string;
  description?: string;
  predictionBasis?: string[];
  sections?: LegacyGemSetlistSection[];
}

interface LegacyGemBackup {
  format?: string;
  exportedAt?: string;
  titles?: Record<string, string>;
  state?: {
    lyrics?: Record<string, string>;
    lyricLibrary?: Record<string, LegacyGemLibraryEntry>;
    favorites?: string[];
    learned?: string[];
    setlists?: LegacyGemSetlist[];
    activeSetlistId?: string;
    showAllVersions?: boolean;
  };
}

function textLanguage(text: string, fallback = "zh-Hans"): string {
  const compact = text.replace(/\s/g, "");
  if (!compact) return fallback;
  const cjk = [...compact].filter((character) =>
    /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character),
  ).length;
  return cjk / compact.length >= 0.18 ? "zh-Hans" : "en";
}

function legacyVersionToVersion(
  value: LegacyGemVersion,
  defaultId: string | undefined,
  fallbackDefault: boolean,
): LyricVersion {
  const id = value.id || createId("version", value.name || "legacy");
  const originalLanguage = textLanguage(value.original ?? "");
  const tracks: LyricVersion["tracks"] = [
    {
      id: "original",
      language: originalLanguage,
      role: "original",
      text: value.original ?? "",
      label: value.originalLabel ? { "zh-Hans": value.originalLabel } : undefined,
    },
  ];
  if (value.translation?.trim()) {
    tracks.push({
      id: "translation",
      language: originalLanguage === "zh-Hans" ? textLanguage(value.translation, "en") : "zh-Hans",
      role: "translation",
      text: value.translation,
      label: value.translationLabel ? { "zh-Hans": value.translationLabel } : undefined,
      alignedTo: value.lineAligned ? "original" : undefined,
    });
  }
  return {
    id,
    label: {
      "zh-Hans": value.name || "默认版",
      en: value.name === "默认版" ? "Default" : value.name || "Default",
    },
    kind: value.type || "legacy",
    isDefault: defaultId ? id === defaultId : fallbackDefault,
    note: value.note,
    tracks,
  };
}

function versionsForLegacySong(
  id: string,
  backup: LegacyGemBackup,
): { versions: LyricVersion[]; selectedVersionId?: string } {
  const library = backup.state?.lyricLibrary?.[id];
  if (library?.versions?.length) {
    const versions = library.versions.map((version, index) =>
      legacyVersionToVersion(version, library.defaultVersionId, index === 0),
    );
    if (!versions.some((version) => version.isDefault) && versions[0]) {
      versions[0] = { ...versions[0], isDefault: true };
    }
    const selectedVersionId = versions.some((version) => version.id === library.selectedVersionId)
      ? library.selectedVersionId
      : undefined;
    return { versions, selectedVersionId };
  }
  const text = backup.state?.lyrics?.[id];
  if (!text) return { versions: [] };
  return {
    versions: [
      {
        id: "legacy-default",
        label: { "zh-Hans": "默认版", en: "Default" },
        kind: "legacy",
        isDefault: true,
        tracks: [
          {
            id: "original",
            language: textLanguage(text),
            role: "original",
            text,
          },
        ],
      },
    ],
    selectedVersionId: "legacy-default",
  };
}

function legacyIds(backup: LegacyGemBackup): string[] {
  const ids = new Set<string>([
    ...Object.keys(backup.titles ?? {}),
    ...Object.keys(backup.state?.lyrics ?? {}),
    ...Object.keys(backup.state?.lyricLibrary ?? {}),
  ]);
  for (const setlist of backup.state?.setlists ?? []) {
    for (const section of setlist.sections ?? []) {
      for (const item of section.items ?? []) {
        if (item.songId) ids.add(item.songId);
      }
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function legacyTitle(backup: LegacyGemBackup, id: string): string {
  return backup.titles?.[id]?.trim() || id;
}

function matchLegacyId(
  song: Song,
  ids: string[],
  backup: LegacyGemBackup,
  used: Set<string>,
): string | undefined {
  if (ids.includes(song.id) && !used.has(song.id)) return song.id;
  const candidates = [...Object.values(song.titles), ...song.aliases]
    .map(normalizeSongLookup)
    .filter(Boolean);
  const exact = ids.find(
    (id) => !used.has(id) && candidates.includes(normalizeSongLookup(legacyTitle(backup, id))),
  );
  if (exact) return exact;
  const partialMatches = ids.filter((id) => {
    if (used.has(id)) return false;
    const oldTitle = normalizeSongLookup(legacyTitle(backup, id));
    return candidates.some(
      (candidate) =>
        candidate.length >= 3 &&
        oldTitle.length >= 3 &&
        (candidate.startsWith(oldTitle) || oldTitle.startsWith(candidate)),
    );
  });
  return partialMatches.length === 1 ? partialMatches[0] : undefined;
}

function confidence(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return Math.min(1, Math.max(0, value));
  if (value === "high") return 0.9;
  if (value === "medium") return 0.65;
  if (value === "low") return 0.35;
  return undefined;
}

function setlistStatus(value: string | undefined): SetlistStatus | string {
  if (value === "predicted") return "prediction";
  if (value === "confirmed") return "official";
  return value || "archive";
}

function convertSetlists(backup: LegacyGemBackup, idMap: Map<string, string>): Setlist[] {
  return (backup.state?.setlists ?? []).map((legacy, setlistIndex): Setlist => {
    const items: SetlistItem[] = [];
    for (const [sectionIndex, section] of (legacy.sections ?? []).entries()) {
      const sectionName = section.name?.trim() || `Section ${sectionIndex + 1}`;
      items.push({
        type: "section",
        id: createId("section", `${legacy.id ?? setlistIndex}-${sectionName}`),
        label: { "zh-Hans": sectionName },
        optional: section.optional,
      });
      if (section.description?.trim()) {
        items.push({ type: "note", text: { "zh-Hans": section.description.trim() } });
      }
      for (const item of section.items ?? []) {
        if (!item.songId) continue;
        const mapped = idMap.get(item.songId);
        if (!mapped) continue;
        items.push({
          type: "song",
          songId: mapped,
          optional: item.optional ?? section.optional,
          confidence: confidence(item.confidence ?? section.confidence),
          note: item.raw && item.raw !== sectionName ? { "zh-Hans": item.raw } : undefined,
        });
      }
    }
    const notes = [
      legacy.description?.trim(),
      ...(legacy.predictionBasis ?? []).map((item) => item.trim()).filter(Boolean),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      id: legacy.id || createId("setlist", legacy.name || `legacy-${setlistIndex + 1}`),
      title: { "zh-Hans": legacy.name || `导入歌单 ${setlistIndex + 1}` },
      status: setlistStatus(legacy.status),
      notes: notes ? { "zh-Hans": notes } : undefined,
      items,
    };
  });
}

function legacySong(id: string, backup: LegacyGemBackup): Song {
  const title = legacyTitle(backup, id);
  const imported = versionsForLegacySong(id, backup);
  return {
    id: `legacy-${id}`,
    titles: { "zh-Hans": title },
    aliases: title === id ? [] : [id],
    tags: ["legacy-import"],
    sourceRefs: [],
    lyricVersions: imported.versions,
  };
}

export function migrateLegacyGemV4Backup(
  input: unknown,
  metadataProject: LyricBookProject,
): LyricBookProject | null {
  const backup = input as LegacyGemBackup;
  if (backup.format !== "gem-lyricbook-backup-v4" || !backup.state) return null;

  const project = structuredClone(metadataProject);
  const ids = legacyIds(backup);
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  const selectedVersions: Record<string, string> = {};

  project.songs = project.songs.map((song): Song => {
    const legacyId = matchLegacyId(song, ids, backup, used);
    if (!legacyId) return song;
    used.add(legacyId);
    idMap.set(legacyId, song.id);
    const imported = versionsForLegacySong(legacyId, backup);
    if (imported.selectedVersionId) selectedVersions[song.id] = imported.selectedVersionId;
    return imported.versions.length ? { ...song, lyricVersions: imported.versions } : song;
  });

  for (const id of ids) {
    if (used.has(id)) continue;
    const song = legacySong(id, backup);
    const imported = versionsForLegacySong(id, backup);
    project.songs.push(song);
    used.add(id);
    idMap.set(id, song.id);
    if (imported.selectedVersionId) selectedVersions[song.id] = imported.selectedVersionId;
  }

  const migratedSetlists = convertSetlists(backup, idMap);
  if (migratedSetlists.length) project.setlists = migratedSetlists;

  project.schemaVersion = SCHEMA_VERSION;
  project.id = `${project.id}-migrated`;
  project.title = {
    ...project.title,
    en: `${project.title.en ?? "G.E.M."} (migrated)`,
    "zh-Hans": `${project.title["zh-Hans"] ?? "G.E.M."}（已迁移）`,
  };
  project.themes = project.themes.length ? project.themes : [structuredClone(DEFAULT_THEME)];
  project.createdAt = backup.exportedAt ?? new Date().toISOString();
  project.activeSetlistId = migratedSetlists.some(
    (item) => item.id === backup.state?.activeSetlistId,
  )
    ? backup.state?.activeSetlistId
    : (migratedSetlists[0]?.id ?? project.activeSetlistId);
  project.preferences = {
    ...project.preferences,
    activeVersionBySong: {
      ...project.preferences?.activeVersionBySong,
      ...selectedVersions,
    },
    favoriteSongIds: (backup.state.favorites ?? [])
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id)),
    learnedSongIds: (backup.state.learned ?? [])
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id)),
    print: backup.state.showAllVersions
      ? { ...project.preferences?.print, versionMode: "all" }
      : project.preferences?.print,
  };
  return touchProject(project);
}
