import { describe, expect, it } from "vitest";
import { createBlankProject, migrateLegacyGemV4Backup } from "@domain/index";
import { requireValue } from "./test-utils";

describe("legacy G.E.M. v4 migration", () => {
  it("rejects unrelated or incomplete backups", () => {
    const metadata = createBlankProject("zh-CN");
    expect(migrateLegacyGemV4Backup({}, metadata)).toBeNull();
    expect(migrateLegacyGemV4Backup({ format: "gem-lyricbook-backup-v4" }, metadata)).toBeNull();
  });

  it("restores title-matched lyrics, extra songs, setlists, and preferences", () => {
    const metadata = createBlankProject("zh-CN");
    metadata.id = "gem-gloria";
    metadata.songs = [
      {
        id: "gem-first",
        titles: { "zh-Hans": "示例歌曲甲", en: "Sample Song A" },
        aliases: [],
        tags: ["core"],
        sourceRefs: [],
        lyricVersions: [],
      },
      {
        id: "gem-moving",
        titles: { "zh-Hans": "G.E.M.", en: "G.E.M." },
        aliases: [],
        tags: ["core"],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];

    const migrated = requireValue(
      migrateLegacyGemV4Backup(
        {
          format: "gem-lyricbook-backup-v4",
          exportedAt: "2026-08-31T12:00:00.000Z",
          titles: {
            "song-001": "示例歌曲甲",
            "song-002": "私人扩展曲目",
            "song-003": "G.E.M. (Get Everybody Moving)",
          },
          state: {
            lyrics: {
              "song-001": "Authorized sample A",
              "song-002": "Authorized sample B",
              "song-003": "Authorized sample C",
            },
            lyricLibrary: {
              "song-002": {
                defaultVersionId: "studio",
                selectedVersionId: "live",
                versions: [
                  { id: "studio", name: "录音室版", original: "Authorized studio sample" },
                  {
                    id: "live",
                    name: "现场版",
                    original: "Authorized live sample",
                    translation: "Authorized translated sample",
                  },
                ],
              },
            },
            favorites: ["song-002"],
            learned: ["song-001"],
            activeSetlistId: "legacy-setlist",
            showAllVersions: true,
            setlists: [
              {
                id: "legacy-setlist",
                name: "旧版歌单",
                status: "predicted",
                sections: [
                  {
                    name: "Part 1",
                    confidence: "high",
                    items: [
                      { raw: "示例歌曲甲", songId: "song-001" },
                      { raw: "私人扩展曲目", songId: "song-002" },
                      { raw: "G.E.M. (Get Everybody Moving)", songId: "song-003" },
                    ],
                  },
                ],
              },
            ],
          },
        },
        metadata,
      ),
    );

    expect(migrated.songs).toHaveLength(3);
    expect(
      migrated.songs.find((song) => song.id === "gem-first")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe("Authorized sample A");
    expect(
      migrated.songs.find((song) => song.id === "gem-moving")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe("Authorized sample C");

    const extra = requireValue(migrated.songs.find((song) => song.id === "legacy-song-002"));
    expect(extra.titles["zh-Hans"]).toBe("私人扩展曲目");
    expect(extra.lyricVersions).toHaveLength(2);
    expect(extra.lyricVersions[1]?.tracks.map((track) => track.role)).toEqual([
      "original",
      "translation",
    ]);
    expect(migrated.preferences?.activeVersionBySong?.[extra.id]).toBe("live");
    expect(migrated.preferences?.favoriteSongIds).toEqual([extra.id]);
    expect(migrated.preferences?.learnedSongIds).toEqual(["gem-first"]);
    expect(migrated.preferences?.print?.versionMode).toBe("all");
    expect(migrated.activeSetlistId).toBe("legacy-setlist");
    expect(migrated.setlists[0]?.status).toBe("prediction");
  });

  it("preserves aligned translation tracks and default versions", () => {
    const metadata = createBlankProject("zh-CN");
    metadata.songs = [
      {
        id: "song-001",
        titles: { "zh-Hans": "测试歌曲" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];

    const migrated = requireValue(
      migrateLegacyGemV4Backup(
        {
          format: "gem-lyricbook-backup-v4",
          state: {
            lyricLibrary: {
              "song-001": {
                defaultVersionId: "live",
                selectedVersionId: "live",
                versions: [
                  {
                    id: "live",
                    name: "现场版",
                    type: "live",
                    original: "Original text",
                    translation: "翻译文本",
                    lineAligned: true,
                  },
                ],
              },
            },
          },
        },
        metadata,
      ),
    );

    expect(migrated.songs[0]?.lyricVersions[0]).toMatchObject({
      id: "live",
      isDefault: true,
    });
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[1]).toMatchObject({
      role: "translation",
      alignedTo: "original",
    });
  });
});
