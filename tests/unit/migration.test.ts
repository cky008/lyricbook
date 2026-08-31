import { describe, expect, it } from "vitest";
import { createBlankProject, migrateGemV4Backup } from "@domain/index";

describe("G.E.M. v4 migration", () => {
  it("moves legacy lyrics into the generic multi-version model", () => {
    const metadata = createBlankProject("zh-CN");
    metadata.id = "gem-gloria";
    metadata.songs = [
      {
        id: "song-001",
        titles: { "zh-Hans": "喜欢你", en: "Like You" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];
    const migrated = migrateGemV4Backup(
      {
        format: "gem-lyricbook-backup-v4",
        state: {
          lyrics: { "song-001": "Authorized private sample" },
        },
      },
      metadata,
    );
    expect(migrated?.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("Authorized private sample");
    expect(migrated?.id).toContain("migrated");
  });
});
