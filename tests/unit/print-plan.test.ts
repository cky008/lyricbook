import { describe, expect, it } from "vitest";
import {
  createBlankProject,
  createEmptySong,
  parseSetlistText,
  type LyricBookProject,
  type PrintOptions,
  type Song,
} from "@domain/index";
import { createPrintPlan } from "@print/index";
import { requireValue } from "./test-utils";

const options: PrintOptions = {
  format: "a4",
  scope: "active-setlist",
  versionMode: "default",
  languageMode: "original-translation",
  strategy: "balanced",
  includeOptional: true,
  includeEmptySongs: true,
  includeSources: false,
  includeTableOfContents: true,
};

function songWithTracks(title: string): Song {
  const song = createEmptySong(title);
  const version = requireValue(song.lyricVersions[0]);
  version.tracks = [
    { id: "original", language: "en", role: "original", text: "Original line" },
    {
      id: "translation",
      language: "zh-Hans",
      role: "translation",
      text: "翻译行",
      alignedTo: "original",
    },
    { id: "romanized", language: "en-Latn", role: "transliteration", text: "Romanized" },
  ];
  return song;
}

function projectWithSongs(count: number): LyricBookProject {
  const project = createBlankProject("en-US");
  project.songs = Array.from({ length: count }, (_, index) => {
    const song = createEmptySong(`Song ${index + 1}`);
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    track.text = `Line ${index + 1}`;
    return song;
  });
  const setlist = requireValue(project.setlists[0]);
  setlist.items = project.songs.map((song) => ({ type: "song" as const, songId: song.id }));
  return project;
}

describe("print plan", () => {
  it("creates linked contents and hides single-version labels", () => {
    const project = createBlankProject("en-US");
    const parsed = parseSetlistText("## Part 1\nSong A\nSong B", project, "en-US");
    project.songs.push(...parsed.createdSongs);
    project.setlists = [parsed.setlist];
    project.activeSetlistId = parsed.setlist.id;
    const firstTrack = requireValue(project.songs.at(0)?.lyricVersions.at(0)?.tracks.at(0));
    firstTrack.text = "One\nTwo\nThree";
    const plan = createPrintPlan({ project, options, locale: "en-US" });
    expect(plan.songCount).toBe(2);
    expect(plan.pages[0]?.kind).toBe("toc");
    const firstSongPage = plan.pages.find((page) => page.kind === "song");
    expect(firstSongPage?.kind === "song" ? firstSongPage.versionLabel : "bad").toBeUndefined();
    expect(firstSongPage?.kind === "song" ? firstSongPage.tracks[0]?.id : undefined).toContain(
      "default:original",
    );
  });

  it("keeps multiple version labels and produces booklet sheets", () => {
    const project = createBlankProject("en-US");
    const parsed = parseSetlistText("Song A", project, "en-US");
    project.songs.push(...parsed.createdSongs);
    project.setlists = [parsed.setlist];
    project.activeSetlistId = parsed.setlist.id;
    const song = requireValue(project.songs[0]);
    song.lyricVersions.push({
      id: "live",
      label: { en: "Live" },
      kind: "live",
      isDefault: false,
      tracks: [{ language: "en", role: "original", text: "Live lyric" }],
    });
    const plan = createPrintPlan({
      project,
      options: { ...options, format: "booklet", versionMode: "all" },
      locale: "en-US",
    });
    expect(plan.pages).toHaveLength(4);
    expect(plan.paddedPageCount).toBe(4);
    expect(plan.bookletSheets).toHaveLength(1);
    expect(plan.pages.filter((page) => page.kind === "song")).toHaveLength(2);
    expect(plan.pages.some((page) => page.kind === "blank")).toBe(false);
  });

  it("pads booklet plans only when the logical page count is not divisible by four", () => {
    const project = projectWithSongs(1);
    const plan = createPrintPlan({
      project,
      options: { ...options, format: "booklet" },
      locale: "en-US",
    });

    expect(plan.pages).toHaveLength(4);
    expect(plan.paddedPageCount).toBe(4);
    expect(plan.bookletSheets).toHaveLength(1);
    expect(plan.pages.filter((page) => page.kind === "song")).toHaveLength(1);
    expect(plan.pages.filter((page) => page.kind === "blank")).toHaveLength(1);
    expect(plan.pages.at(-1)?.kind).toBe("blank");
  });

  it("covers current, filtered, library, and optional setlist scopes", () => {
    const project = projectWithSongs(3);
    const [first, second, third] = project.songs;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    if (!first || !second || !third) throw new Error("Expected three songs");
    const setlist = requireValue(project.setlists[0]);
    setlist.items = [
      { type: "song", songId: first.id },
      { type: "song", songId: second.id, optional: true },
    ];

    expect(
      createPrintPlan({
        project,
        options: { ...options, scope: "current-song" },
        locale: "en-US",
        currentSongId: first.id,
      }).songCount,
    ).toBe(1);
    expect(
      createPrintPlan({
        project,
        options: { ...options, scope: "current-song" },
        locale: "en-US",
      }).songCount,
    ).toBe(0);
    expect(
      createPrintPlan({
        project,
        options: { ...options, scope: "filtered" },
        locale: "en-US",
        filteredSongIds: [third.id],
      }).songCount,
    ).toBe(1);
    expect(
      createPrintPlan({
        project,
        options: { ...options, scope: "filtered" },
        locale: "en-US",
      }).songCount,
    ).toBe(3);
    expect(
      createPrintPlan({
        project,
        options: { ...options, scope: "library" },
        locale: "en-US",
      }).songCount,
    ).toBe(3);
    expect(
      createPrintPlan({
        project,
        options: { ...options, includeOptional: false },
        locale: "en-US",
      }).songCount,
    ).toBe(1);
  });

  it("selects language tracks and current or fallback versions", () => {
    const project = createBlankProject("en-US");
    const song = songWithTracks("Multilingual");
    song.lyricVersions.push({
      id: "live",
      label: { en: "Live" },
      kind: "live",
      isDefault: false,
      tracks: [{ id: "live-original", language: "en", role: "original", text: "Live" }],
    });
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const original = createPrintPlan({
      project,
      options: { ...options, languageMode: "original" },
      locale: "en-US",
    });
    const originalPage = original.pages.find((page) => page.kind === "song");
    expect(originalPage?.kind === "song" ? originalPage.tracks : []).toHaveLength(1);

    const bilingual = createPrintPlan({ project, options, locale: "en-US" });
    const bilingualPage = bilingual.pages.find((page) => page.kind === "song");
    expect(bilingualPage?.kind === "song" ? bilingualPage.tracks : []).toHaveLength(2);

    const allTracks = createPrintPlan({
      project,
      options: { ...options, languageMode: "all-tracks" },
      locale: "en-US",
    });
    const allTracksPage = allTracks.pages.find((page) => page.kind === "song");
    expect(allTracksPage?.kind === "song" ? allTracksPage.tracks : []).toHaveLength(3);

    const current = createPrintPlan({
      project,
      options: { ...options, versionMode: "current" },
      locale: "en-US",
      selectedVersionBySong: { [song.id]: "live" },
    });
    const currentPage = current.pages.find((page) => page.kind === "song");
    expect(currentPage?.kind === "song" ? currentPage.versionLabel : undefined).toBe("Live");

    const fallback = createPrintPlan({
      project,
      options: { ...options, versionMode: "current" },
      locale: "en-US",
      selectedVersionBySong: { [song.id]: "missing" },
    });
    const fallbackPage = fallback.pages.find((page) => page.kind === "song");
    expect(fallbackPage?.kind === "song" ? fallbackPage.tracks[0]?.text : undefined).toBe(
      "Original line",
    );
  });

  it("handles empty songs according to the include-empty option", () => {
    const project = createBlankProject("en-US");
    const empty = createEmptySong("Empty");
    empty.lyricVersions = [];
    project.songs = [empty];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: empty.id }];

    const included = createPrintPlan({ project, options, locale: "en-US" });
    expect(included.pages.some((page) => page.kind === "song")).toBe(true);

    const excluded = createPrintPlan({
      project,
      options: { ...options, includeEmptySongs: false },
      locale: "en-US",
    });
    expect(excluded.pages.some((page) => page.kind === "song")).toBe(false);
  });

  it("splits long lyrics unless strict page limits are requested", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Long song");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    track.text = Array.from(
      { length: 320 },
      (_, index) => `${index + 1}. This is a deliberately long lyric line with words and 中文字符`,
    ).join("\n");
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const compact = createPrintPlan({
      project,
      options: { ...options, format: "a5", strategy: "compact" },
      locale: "en-US",
    });
    expect(compact.pages.filter((page) => page.kind === "song").length).toBeGreaterThan(1);

    const readable = createPrintPlan({
      project,
      options: { ...options, format: "a5", strategy: "readable" },
      locale: "en-US",
    });
    expect(readable.pages.filter((page) => page.kind === "song").length).toBeGreaterThan(1);

    const strict = createPrintPlan({
      project,
      options: { ...options, format: "a5", strategy: "strict-page-limit" },
      locale: "en-US",
    });
    expect(strict.pages.filter((page) => page.kind === "song")).toHaveLength(1);
  });

  it("adapts table-of-contents columns to format and entry count", () => {
    const a4Medium = createPrintPlan({
      project: projectWithSongs(43),
      options,
      locale: "en-US",
    });
    expect(a4Medium.pages[0]?.kind === "toc" ? a4Medium.pages[0].columns : 0).toBe(2);

    const a4Large = createPrintPlan({
      project: projectWithSongs(91),
      options,
      locale: "en-US",
    });
    expect(a4Large.pages[0]?.kind === "toc" ? a4Large.pages[0].columns : 0).toBe(3);

    const a5 = createPrintPlan({
      project: projectWithSongs(39),
      options: { ...options, format: "a5" },
      locale: "en-US",
    });
    expect(a5.pages[0]?.kind === "toc" ? a5.pages[0].columns : 0).toBe(2);
  });

  it("supports no contents page, Chinese fallback section labels, and missing themes", () => {
    const project = projectWithSongs(1);
    project.activeThemeId = "missing";
    const plan = createPrintPlan({
      project,
      options: { ...options, includeTableOfContents: false },
      locale: "zh-CN",
    });
    expect(plan.pages[0]?.kind).toBe("song");
    expect(plan.theme).toBeUndefined();

    const withContents = createPrintPlan({ project, options, locale: "zh-CN" });
    const toc = withContents.pages[0];
    expect(toc?.kind === "toc" ? toc.sections[0]?.label : undefined).toBe("演出曲目");
  });
});
