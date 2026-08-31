import { createId } from "./ids";
import { DEFAULT_THEME, touchProject } from "./project";
import { SCHEMA_VERSION, type LyricBookProject, type LyricVersion, type Song } from "./types";

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

interface LegacyGemBackup {
  format?: string;
  exportedAt?: string;
  state?: {
    lyrics?: Record<string, string>;
    lyricLibrary?: Record<
      string,
      {
        versions?: LegacyGemVersion[];
        defaultVersionId?: string;
        selectedVersionId?: string;
      }
    >;
  };
}

function legacyVersionToVersion(value: LegacyGemVersion, defaultId?: string): LyricVersion {
  const id = value.id || createId("version", value.name || "legacy");
  const tracks: LyricVersion["tracks"] = [
    {
      id: "original",
      language: "zh-Hans",
      role: "original",
      text: value.original ?? "",
      label: value.originalLabel ? { "zh-Hans": value.originalLabel } : undefined,
    },
  ];
  if (value.translation?.trim()) {
    tracks.push({
      id: "translation",
      language: "zh-Hans",
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
    isDefault: id === defaultId,
    note: value.note,
    tracks,
  };
}

export function migrateGemV4Backup(
  input: unknown,
  metadataProject: LyricBookProject,
): LyricBookProject | null {
  const backup = input as LegacyGemBackup;
  if (backup.format !== "gem-lyricbook-backup-v4" || !backup.state) return null;
  const project = structuredClone(metadataProject);
  const lyricLibrary = backup.state.lyricLibrary ?? {};
  const legacyLyrics = backup.state.lyrics ?? {};
  project.songs = project.songs.map((song): Song => {
    const legacy = lyricLibrary[song.id];
    if (legacy?.versions?.length) {
      return {
        ...song,
        lyricVersions: legacy.versions.map((version) =>
          legacyVersionToVersion(version, legacy.defaultVersionId),
        ),
      };
    }
    const text = legacyLyrics[song.id];
    if (!text) return song;
    return {
      ...song,
      lyricVersions: [
        {
          id: "legacy-default",
          label: { "zh-Hans": "默认版", en: "Default" },
          kind: "legacy",
          isDefault: true,
          tracks: [{ id: "original", language: "zh-Hans", role: "original", text }],
        },
      ],
    };
  });
  project.schemaVersion = SCHEMA_VERSION;
  project.id = `${project.id}-migrated`;
  project.title = { ...project.title, en: `${project.title.en ?? "G.E.M."} (migrated)` };
  project.themes = project.themes.length ? project.themes : [structuredClone(DEFAULT_THEME)];
  project.createdAt = backup.exportedAt ?? new Date().toISOString();
  return touchProject(project);
}
