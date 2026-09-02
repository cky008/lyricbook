import {
  applySetlistMarkdown,
  createBlankProject,
  createExportFilename,
  inspectRasterImage,
  parseProject,
  parseSetlistText,
  sanitizeTheme,
  serializeSetlistMarkdown,
  validateProject,
} from "@domain/index";
import { describe, expect, it } from "vitest";

const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2S9sAAAAASUVORK5CYII=";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

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

  it("accepts only self-contained raster print covers with consistent metadata", () => {
    const project = createBlankProject("en-US");
    project.preferences = {
      ...project.preferences,
      print: {
        coverMode: "image-with-text",
        coverImage: {
          dataUrl: ONE_PIXEL_PNG_DATA_URL,
          mediaType: "image/png",
          width: 1,
          height: 1,
          byteLength: 68,
        },
      },
    };
    expect(validateProject(project).ok).toBe(true);

    const remote = structuredClone(project);
    if (!remote.preferences?.print?.coverImage) throw new Error("Expected cover fixture");
    remote.preferences.print.coverImage.dataUrl = "https://example.com/private-cover.png";
    expect(validateProject(remote).ok).toBe(false);

    const mismatched = structuredClone(project);
    if (!mismatched.preferences?.print?.coverImage) throw new Error("Expected cover fixture");
    mismatched.preferences.print.coverImage.mediaType = "image/jpeg";
    mismatched.preferences.print.coverImage.byteLength = 99;
    const result = validateProject(mismatched);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("media type"))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("byte length"))).toBe(true);
  });

  it("rejects forged cover signatures, dimensions, and decoded pixel counts", () => {
    const project = createBlankProject("en-US");
    project.preferences = {
      ...project.preferences,
      print: {
        coverMode: "image",
        coverImage: {
          dataUrl: "data:image/png;base64,AQIDBA==",
          mediaType: "image/png",
          width: 1,
          height: 1,
          byteLength: 4,
        },
      },
    };
    let result = validateProject(project);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("recognized raster"))).toBe(true);

    const wrongDimensions = structuredClone(project);
    if (!wrongDimensions.preferences?.print?.coverImage) throw new Error("Expected cover fixture");
    wrongDimensions.preferences.print.coverImage = {
      dataUrl: ONE_PIXEL_PNG_DATA_URL,
      mediaType: "image/png",
      width: 2,
      height: 1,
      byteLength: 68,
    };
    result = validateProject(wrongDimensions);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("dimensions"))).toBe(true);

    const oversizedHeader = pngHeader(10_000, 5_000);
    const oversized = structuredClone(project);
    if (!oversized.preferences?.print?.coverImage) throw new Error("Expected cover fixture");
    oversized.preferences.print.coverImage = {
      dataUrl: `data:image/png;base64,${Buffer.from(oversizedHeader).toString("base64")}`,
      mediaType: "image/png",
      width: 4_096,
      height: 4_096,
      byteLength: oversizedHeader.byteLength,
    };
    result = validateProject(oversized);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("pixel limit"))).toBe(true);
  });

  it("reads supported raster dimensions without browser image APIs", () => {
    const jpeg = new Uint8Array(21);
    jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x02]);
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
    webp.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0], 12);
    webp.set([1, 0, 0], 24);
    webp.set([2, 0, 0], 27);

    expect(inspectRasterImage(pngHeader(7, 9))).toEqual({
      mediaType: "image/png",
      width: 7,
      height: 9,
    });
    expect(inspectRasterImage(jpeg)).toEqual({
      mediaType: "image/jpeg",
      width: 2,
      height: 3,
    });
    expect(inspectRasterImage(webp)).toEqual({
      mediaType: "image/webp",
      width: 2,
      height: 3,
    });
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

  it("round-trips structured setlist items through the Markdown editor", () => {
    const project = createBlankProject("en-US");
    project.songs = [
      {
        id: "first-song",
        titles: { en: "First Song" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
      {
        id: "second-song",
        titles: { en: "Second Song" },
        aliases: [],
        tags: [],
        sourceRefs: [],
        lyricVersions: [],
      },
    ];
    const setlist = project.setlists[0];
    expect(setlist).toBeDefined();
    if (!setlist) throw new Error("Blank project must contain a main setlist");
    setlist.items = [
      { type: "section", id: "act-one", label: { en: "Act One" } },
      { type: "song", songId: "first-song", confidence: 0.9 },
      { type: "song", songId: "second-song", optional: true },
      { type: "note", text: { en: "Short stage talk" } },
      { type: "break", label: { en: "Intermission" } },
    ];

    const markdown = serializeSetlistMarkdown(setlist, project, "en-US");
    expect(markdown).toContain("## Act One");
    expect(markdown).toContain("- First Song");
    expect(markdown).toContain("- [ ] Second Song");
    expect(markdown).toContain("[note] Short stage talk");
    expect(markdown).toContain("[break] Intermission");

    const result = applySetlistMarkdown(markdown, project, setlist.id, "en-US");
    expect(result.createdSongs).toEqual([]);
    expect(result.project.songs).toHaveLength(2);
    expect(result.project.setlists[0]?.items).toEqual([
      { type: "section", id: "act-one", label: { en: "Act One" } },
      { type: "song", songId: "first-song", confidence: 0.9 },
      { type: "song", songId: "second-song", optional: true },
      { type: "note", text: { en: "Short stage talk" } },
      { type: "break", label: { en: "Intermission" } },
    ]);
  });

  it("creates unmatched songs when applying Markdown without mutating another setlist", () => {
    const project = createBlankProject("zh-CN");
    project.setlists.push({
      id: "other-setlist",
      title: { "zh-Hans": "另一歌单" },
      status: "draft",
      items: [],
    });

    const result = applySetlistMarkdown(
      "## 第一部分\n- 新歌\n- [ ] 可选新歌",
      project,
      "main-setlist",
      "zh-CN",
    );

    expect(result.unmatchedLines).toEqual(["新歌", "可选新歌"]);
    expect(result.createdSongs).toHaveLength(2);
    expect(result.project.setlists.find((item) => item.id === "other-setlist")?.items).toEqual([]);
    expect(
      result.project.setlists
        .find((item) => item.id === "main-setlist")
        ?.items.filter((item) => item.type === "song")
        .map((item) => item.optional),
    ).toEqual([undefined, true]);
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
