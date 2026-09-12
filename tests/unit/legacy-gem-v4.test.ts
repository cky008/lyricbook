import {
  createBlankProject,
  createEmptySong,
  mergeProjectLyrics,
  migrateLegacyGemV4Backup,
  parseProject,
  validateProject,
} from "@domain/index";
import type { Song } from "@domain/types";
import { describe, expect, it } from "vitest";
import gemPreset from "../../content/presets/gem-gloria/project.json";
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
        aliases: ["G.E.M. (Get Everybody Moving)"],
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

function metadataSong(id: string, title: string, aliases: string[] = []): Song {
  return { ...createEmptySong(title), id, aliases };
}

function migrateSongs(songs: Song[], titles: Record<string, string>) {
  const metadata = createBlankProject("en-US");
  metadata.songs = songs;
  const lyrics = Object.fromEntries(
    Object.keys(titles).map((id) => [id, `Invented words for ${id}\r\nAnother invented line  `]),
  );
  const backup = {
    format: "gem-lyricbook-backup-v4",
    titles,
    state: {
      lyrics,
      setlists: [
        {
          id: "old-order",
          sections: [
            { name: "Old section", items: Object.keys(titles).map((songId) => ({ songId })) },
          ],
        },
      ],
      activeSetlistId: "old-order",
      favorites: Object.keys(titles),
    },
  };
  return { metadata, backup, lyrics };
}

describe("conservative legacy lyric identity matching", () => {
  it("matches the published G.E.M. legacy title through an explicit preset alias", () => {
    const metadata = parseProject(gemPreset);
    expect(
      metadata.songs.every((song) =>
        song.lyricVersions.every((version) => version.tracks.every((track) => track.text === "")),
      ),
    ).toBe(true);
    const migrated = requireValue(
      migrateLegacyGemV4Backup(
        {
          format: "gem-lyricbook-backup-v4",
          titles: { "old-moving": "G.E.M. (Get Everybody Moving)" },
          state: { lyrics: { "old-moving": "Synthetic moving lanterns\nSynthetic moonlight" } },
        },
        metadata,
      ),
    );
    expect(migrated.songs).toHaveLength(metadata.songs.length);
    expect(
      migrated.songs.find(({ id }) => id === "gem-moving")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe("Synthetic moving lanterns\nSynthetic moonlight");
    expect(validateProject(migrated).ok).toBe(true);
  });

  it("does not attach a title prefix to a different studio or live song", () => {
    const { metadata, backup, lyrics } = migrateSongs(
      [metadataSong("current-live", "Synthetic Moon Live")],
      { "old-studio": "Synthetic Moon" },
    );
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
    expect(
      migrated.songs.find(({ id }) => id === "legacy-old-studio")?.lyricVersions[0]?.tracks[0]
        ?.text,
    ).toBe(lyrics["old-studio"]);
    expect(migrated.setlists[0]?.items[1]).toMatchObject({
      type: "song",
      songId: "legacy-old-studio",
    });
    expect(migrated.preferences?.favoriteSongIds).toEqual(["legacy-old-studio"]);
    const merged = mergeProjectLyrics(metadata, migrated);
    expect(merged.project.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
    expect(merged.report.addedSongs).toBe(1);
    expect(mergeProjectLyrics(merged.project, migrated).project).toEqual(merged.project);
  });

  it("preserves punctuation rather than treating distinct titles as identical", () => {
    const { metadata, backup, lyrics } = migrateSongs([metadataSong("dotted", "A.B.")], {
      plain: "AB",
    });
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
    expect(
      migrated.songs.find(({ id }) => id === "legacy-plain")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe(lyrics.plain);
  });

  it("leaves multiple equally titled donor songs distinct and retains their full text", () => {
    const { metadata, backup, lyrics } = migrateSongs([metadataSong("current", "Shared Moon")], {
      oldA: "Shared Moon",
      oldB: "shared moon",
    });
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs).toHaveLength(3);
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
    expect(migrated.songs.slice(1).map((song) => song.lyricVersions[0]?.tracks[0]?.text)).toEqual([
      lyrics.oldA,
      lyrics.oldB,
    ]);
    const result = mergeProjectLyrics(metadata, migrated);
    expect(result.report.ambiguousSongs).toEqual(["legacy-oldA", "legacy-oldB"]);
    expect(result.project).toEqual(metadata);
  });

  it("does not choose the first metadata song when multiple titles or aliases match", () => {
    const { metadata, backup, lyrics } = migrateSongs(
      [
        metadataSong("first", "Shared Moon"),
        metadataSong("second", "Different Moon", ["Shared Moon"]),
      ],
      { old: "Shared Moon" },
    );
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs).toHaveLength(3);
    expect(
      migrated.songs.slice(0, 2).every((song) => song.lyricVersions[0]?.tracks[0]?.text === ""),
    ).toBe(true);
    expect(migrated.songs[2]?.lyricVersions[0]?.tracks[0]?.text).toBe(lyrics.old);
  });

  it("reserves stable ids before title matching even when a competing title occurs first", () => {
    const { metadata, backup, lyrics } = migrateSongs(
      [metadataSong("other", "Shared Moon"), metadataSong("stable", "Renamed Moon")],
      { stable: "Shared Moon", fallback: "Renamed Moon" },
    );
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs.find(({ id }) => id === "other")?.lyricVersions[0]?.tracks[0]?.text).toBe(
      "",
    );
    expect(
      migrated.songs.find(({ id }) => id === "stable")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe(lyrics.stable);
    expect(
      migrated.songs.find(({ id }) => id === "legacy-fallback")?.lyricVersions[0]?.tracks[0]?.text,
    ).toBe(lyrics.fallback);
  });

  it("supports exact localized aliases, Unicode normalization, and harmless whitespace", () => {
    const { metadata, backup, lyrics } = migrateSongs(
      [
        metadataSong("current", "Ｃａｆé  Moon", ["合成月光"]),
        metadataSong("moving", "G.E.M.", ["G.E.M. (Get Everybody Moving)"]),
      ],
      { old: "  Cafe\u0301 Moon ", oldMoving: "G.E.M. (Get Everybody Moving)" },
    );
    const beforeMetadata = structuredClone(metadata);
    const beforeBackup = structuredClone(backup);
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(migrated.songs).toHaveLength(2);
    expect(migrated.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe(lyrics.old);
    expect(migrated.songs[1]?.lyricVersions[0]?.tracks[0]?.text).toBe(lyrics.oldMoving);
    expect(metadata).toEqual(beforeMetadata);
    expect(backup).toEqual(beforeBackup);
    backup.titles.old = "合成月光";
    expect(
      requireValue(migrateLegacyGemV4Backup(backup, metadata)).songs[0]?.lyricVersions[0]?.tracks[0]
        ?.text,
    ).toBe(lyrics.old);
    expect(metadata).toEqual(beforeMetadata);
  });

  it("retains unmatched lyrics when the generated legacy id collides with metadata", () => {
    const { metadata, backup, lyrics } = migrateSongs(
      [metadataSong("legacy-old", "New Moon"), metadataSong("legacy-old-imported", "Other Moon")],
      { old: "Unrelated Moon" },
    );
    const migrated = requireValue(migrateLegacyGemV4Backup(backup, metadata));
    expect(validateProject(migrated)).toEqual({ ok: true, issues: [] });
    expect(migrated.songs[2]).toMatchObject({
      id: "legacy-old-imported-2",
      lyricVersions: [{ tracks: [{ text: lyrics.old }] }],
    });
    expect(migrated.setlists[0]?.items[1]).toMatchObject({ songId: "legacy-old-imported-2" });
  });
});
