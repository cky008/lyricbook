import { describe, expect, it } from "vitest";
import {
  createBlankProject,
  createExportFilename,
  parseProject,
  parseSetlistText,
  sanitizeTheme,
  validateProject,
} from "@domain/index";

describe("project schema", () => {
  it("accepts a blank project", () => {
    const project = createBlankProject("en-US");
    expect(validateProject(project)).toEqual({ ok: true, issues: [] });
    expect(parseProject(project).schemaVersion).toBe(1);
  });

  it("rejects missing song references", () => {
    const project = createBlankProject("en-US");
    const [mainSetlist] = project.setlists;
    expect(mainSetlist).toBeDefined();
    if (!mainSetlist) throw new Error("Blank project must contain a main setlist");
    mainSetlist.items.push({ type: "song", songId: "missing" });
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("Missing song reference");
  });

  it("rejects missing and duplicate source references", () => {
    const project = createBlankProject("en-US");
    project.sources = [
      { id: "source-a", kind: "official", title: "Official source" },
      { id: "source-a", kind: "mirror", title: "Duplicate source" },
    ];
    project.songs.push({
      id: "song-a",
      titles: { en: "Song A" },
      aliases: [],
      tags: [],
      sourceRefs: ["missing-source"],
      lyricVersions: [],
    });
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Duplicate source id"))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("Missing source reference"))).toBe(
      true,
    );
  });

  it("rejects two default versions", () => {
    const project = createBlankProject("en-US");
    const parsed = parseSetlistText("Song A", project, "en-US");
    project.songs.push(...parsed.createdSongs);
    const [song] = project.songs;
    expect(song).toBeDefined();
    if (!song) throw new Error("Setlist import must create a song");
    song.lyricVersions.push({
      id: "second",
      label: { en: "Second" },
      kind: "live",
      isDefault: true,
      tracks: [],
    });
    expect(validateProject(project).ok).toBe(false);
  });
});

describe("setlist import", () => {
  it("supports optional sections and unmatched song creation", () => {
    const project = createBlankProject("zh-CN");
    const parsed = parseSetlistText(
      "## Part 1\n歌曲甲\n歌曲乙\n## Encore\n歌曲甲",
      project,
      "zh-CN",
    );
    expect(parsed.createdSongs).toHaveLength(2);
    expect(parsed.setlist.items.map((item) => item.type)).toEqual([
      "section",
      "song",
      "song",
      "section",
      "song",
    ]);
    const songItems = parsed.setlist.items.filter((item) => item.type === "song");
    expect(songItems[0]?.songId).toBe(songItems[2]?.songId);
  });
});

describe("export filename", () => {
  it("includes UTC milliseconds and a random suffix", () => {
    const date = new Date("2026-08-31T12:34:56.789Z");
    const first = createExportFilename("My Concert", "lyricbook", date);
    const second = createExportFilename("My Concert", "lyricbook", date);
    expect(first).toMatch(/^lyricbook_my-concert_20260831T123456_789Z_[0-9a-f]{8}\.lyricbook$/);
    expect(second).not.toBe(first);
  });
});

describe("theme safety", () => {
  it("replaces unsafe tokens with safe defaults", () => {
    const theme = sanitizeTheme({
      id: "unsafe",
      name: { en: "Unsafe" },
      tokens: {
        accent: "url(javascript:alert(1))",
        background: "red",
        surface: "#222",
        text: "#fff",
        radius: "expression(alert(1))",
      },
    });
    expect(theme.tokens.accent).toBe("#8f67ff");
    expect(theme.tokens.background).toBe("#17132b");
    expect(theme.tokens.radius).toBe("22px");
  });
});

describe("additional schema validation", () => {
  it("returns Zod paths for structurally invalid projects", () => {
    const result = validateProject({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(() => parseProject({ schemaVersion: 99 })).toThrow();
  });

  it("detects duplicate ids, invalid active ids, and missing setlist source references", () => {
    const project = createBlankProject("en-US");
    const song = {
      id: "duplicate",
      titles: { en: "Duplicate" },
      aliases: [],
      tags: [],
      sourceRefs: [],
      lyricVersions: [],
    };
    project.songs = [song, { ...song }];
    project.setlists = [
      {
        id: "setlist-duplicate",
        title: { en: "One" },
        status: "draft",
        items: [{ type: "song", songId: "duplicate", sourceRefs: ["missing-source"] }],
      },
      {
        id: "setlist-duplicate",
        title: { en: "Two" },
        status: "draft",
        items: [],
      },
    ];
    const theme = project.themes[0];
    expect(theme).toBeDefined();
    if (!theme) throw new Error("Blank project must contain a theme");
    project.themes = [theme, { ...theme }];
    project.activeSetlistId = "missing-setlist";
    project.activeThemeId = "missing-theme";

    const result = validateProject(project);
    const messages = result.issues.map((issue) => issue.message);
    expect(messages.some((message) => message.includes("Duplicate song id"))).toBe(true);
    expect(messages.some((message) => message.includes("Duplicate setlist id"))).toBe(true);
    expect(messages.some((message) => message.includes("Duplicate theme id"))).toBe(true);
    expect(messages.some((message) => message.includes("Missing source reference"))).toBe(true);
    expect(messages).toContain("Active setlist does not exist");
    expect(messages).toContain("Active theme does not exist");
    expect(() => parseProject(project)).toThrow(/Duplicate song id/);
  });
});

describe("setlist parser branches", () => {
  it("recognizes headings, encore labels, notes, list prefixes, aliases, and separators", () => {
    const project = createBlankProject("en-US");
    const known = {
      id: "known-song",
      titles: { en: "Known Song" },
      aliases: ["Known Alias"],
      tags: [],
      sourceRefs: [],
      lyricVersions: [],
    };
    project.songs = [known];
    const parsed = parseSetlistText(
      "# Act One\n- Known Alias\n1. New Song\n---\nEncore:\n[note] Short talk\n+ New Song",
      project,
      "en-US",
      "Imported show",
    );
    expect(parsed.setlist.title.en).toBe("Imported show");
    expect(parsed.createdSongs).toHaveLength(1);
    expect(parsed.unmatchedLines).toEqual(["New Song"]);
    expect(parsed.setlist.items.map((item) => item.type)).toEqual([
      "section",
      "song",
      "song",
      "section",
      "note",
      "song",
    ]);
    const songItems = parsed.setlist.items.filter((item) => item.type === "song");
    expect(songItems[0]?.songId).toBe("known-song");
    expect(songItems[1]?.songId).toBe(songItems[2]?.songId);
  });

  it("deduplicates setlist song ids and can exclude optional entries", async () => {
    const { setlistSongIds } = await import("@domain/index");
    expect(setlistSongIds(undefined)).toEqual([]);
    const setlist = {
      id: "setlist",
      title: { en: "Setlist" },
      status: "draft",
      items: [
        { type: "song" as const, songId: "a", optional: true },
        { type: "section" as const, label: { en: "Part" } },
        { type: "song" as const, songId: "b" },
        { type: "song" as const, songId: "a" },
      ],
    };
    expect(setlistSongIds(setlist)).toEqual(["a", "b"]);
    expect(setlistSongIds(setlist, false)).toEqual(["b", "a"]);
  });
});
