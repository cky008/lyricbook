import { describe, expect, it } from "vitest";
import { createBlankProject, migrateGemV4Backup } from "@domain/index";
import { requireValue } from "./test-utils";

describe("G.E.M. v4 migration", () => {
  it("rejects unrelated or incomplete backups", () => {
    const metadata = createBlankProject("zh-CN");
    expect(migrateGemV4Backup({}, metadata)).toBeNull();
    expect(migrateGemV4Backup({ format: "gem-lyricbook-backup-v4" }, metadata)).toBeNull();
  });

  it("moves simple legacy lyrics and retains songs without matching lyrics", () => {
    const metadata = createBlankProject("zh-CN");
    metadata.id = "gem-gloria";
    metadata.themes = [];
    metadata.songs = [
      {
        id: "song-001",
        titles: { "zh-Hans": "喜欢你", en: "Like You" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
      {
        id: "song-002",
        titles: { en: "Untouched" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];
    const migrated = requireValue(
      migrateGemV4Backup(
        {
          format: "gem-lyricbook-backup-v4",
          exportedAt: "2026-08-31T12:00:00.000Z",
          state: { lyrics: { "song-001": "Authorized private sample" } },
        },
        metadata,
      ),
    );
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("Authorized private sample");
    expect(migrated.songs[1]?.lyricVersions).toEqual([]);
    expect(migrated.id).toBe("gem-gloria-migrated");
    expect(migrated.title.en).toContain("migrated");
    expect(migrated.themes[0]?.id).toBe("default");
    expect(migrated.createdAt).toBe("2026-08-31T12:00:00.000Z");
    expect(migrated.parentRevisionId).toBe(metadata.revisionId);
  });

  it("converts multi-version library data with labels, translations, alignment, and defaults", () => {
    const metadata = createBlankProject("zh-CN");
    metadata.id = "gem";
    metadata.title = {};
    metadata.songs = [
      {
        id: "song-001",
        titles: { en: "Song" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];
    const migrated = requireValue(
      migrateGemV4Backup(
        {
          format: "gem-lyricbook-backup-v4",
          state: {
            lyricLibrary: {
              "song-001": {
                defaultVersionId: "live",
                versions: [
                  {
                    id: "live",
                    name: "现场版",
                    type: "live",
                    originalLabel: "原文",
                    translationLabel: "翻译",
                    original: "Original",
                    translation: "Translation",
                    note: "Note",
                    lineAligned: true,
                  },
                  { original: "Fallback id" },
                ],
              },
            },
          },
        },
        metadata,
      ),
    );
    const song = requireValue(migrated.songs[0]);
    expect(song.lyricVersions).toHaveLength(2);
    expect(song.lyricVersions[0]).toMatchObject({ id: "live", isDefault: true, note: "Note" });
    expect(song.lyricVersions[0]?.tracks[1]).toMatchObject({
      role: "translation",
      alignedTo: "original",
      label: { "zh-Hans": "翻译" },
    });
    expect(song.lyricVersions[1]?.id).toMatch(/^version-/);
    expect(song.lyricVersions[1]?.label.en).toBe("Default");
    expect(migrated.title.en).toBe("G.E.M. (migrated)");
    expect(migrated.createdAt).toBeTruthy();
  });
});
