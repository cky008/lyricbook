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
    project.setlists[0]!.items.push({ type: "song", songId: "missing" });
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
    const song = project.songs[0]!;
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
