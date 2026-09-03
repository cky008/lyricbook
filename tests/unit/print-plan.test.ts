import {
  createBlankProject,
  createEmptySong,
  type LyricBookProject,
  type PrintOptions,
  parseSetlistText,
  type Song,
} from "@domain/index";
import { createPrintPlan, mergeShortLyricLines } from "@print/index";
import { describe, expect, it } from "vitest";
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
  includeCover: false,
  lineFlow: "auto",
  coverMode: "generated",
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

  it("places an optional booklet cover on logical page one", () => {
    const project = projectWithSongs(2);
    project.title = { en: "Concert Notes", "zh-Hans": "演唱会笔记" };
    project.description = {
      en: `${"A thoughtfully prepared concert guide. ".repeat(8)}Final detail.`,
    };
    const setlist = requireValue(project.setlists[0]);
    setlist.title = { en: "London Night", "zh-Hans": "伦敦之夜" };

    const plan = createPrintPlan({
      project,
      options: { ...options, format: "booklet", includeCover: true },
      locale: "en-US",
    });

    const cover = plan.pages[0];
    expect(cover?.kind).toBe("cover");
    expect(cover?.kind === "cover" ? cover.title : undefined).toBe("Concert Notes");
    expect(cover?.kind === "cover" ? cover.setlistTitle : undefined).toBe("London Night");
    expect(cover?.kind === "cover" ? cover.songCountLabel : undefined).toBe("2 songs");
    expect(cover?.kind === "cover" ? cover.subtitle?.endsWith("…") : false).toBe(true);
    expect(cover?.kind === "cover" ? cover.subtitle?.length : 0).toBeLessThanOrEqual(180);
    expect(plan.bookletSheets[0]?.front[1]).toBe(1);
    expect(plan.pages[1]?.kind).toBe("toc");
    const toc = plan.pages[1];
    expect(toc?.kind === "toc" ? toc.sections[0]?.entries[0]?.pageNumber : undefined).toBe(3);

    const withoutCover = createPrintPlan({
      project,
      options: { ...options, format: "booklet", includeCover: false },
      locale: "en-US",
    });
    expect(withoutCover.pages.some((page) => page.kind === "cover")).toBe(false);

    const a4 = createPrintPlan({
      project,
      options: { ...options, format: "a4", includeCover: true },
      locale: "en-US",
    });
    expect(a4.pages.some((page) => page.kind === "cover")).toBe(false);
  });

  it("supports local image-only and image-with-text booklet covers", () => {
    const project = projectWithSongs(1);
    const localImage = {
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      mediaType: "image/png" as const,
      width: 1,
      height: 1,
      byteLength: 33,
    };

    for (const coverMode of ["image", "image-with-text"] as const) {
      const plan = createPrintPlan({
        project,
        options: {
          ...options,
          format: "booklet",
          includeCover: true,
          coverMode,
          coverImage: localImage,
        },
        locale: "en-US",
      });
      const cover = plan.pages[0];
      expect(cover?.kind).toBe("cover");
      if (cover?.kind !== "cover") throw new Error("Expected a cover page");
      expect(cover.mode).toBe(coverMode);
      expect(cover.image).toEqual(localImage);
    }
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

  it("separates language-track columns from balanced text columns", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("A medium song");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    track.text = Array.from({ length: 72 }, (_, index) => `Unique line ${index + 1}`).join("\n");
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const plan = createPrintPlan({
      project,
      options: { ...options, languageMode: "original", lineFlow: "preserve" },
      locale: "en-US",
    });
    const page = plan.pages.find((candidate) => candidate.kind === "song");

    expect(page?.kind).toBe("song");
    if (page?.kind !== "song") throw new Error("Expected a song page");
    expect(page.trackColumns).toBe(1);
    expect(page.textColumns).toBe(2);
    expect(page.layoutMode).toBe("balanced-text");
    expect(page.tracks).toHaveLength(1);
  });

  it("keeps aligned bilingual tracks parallel and independent tracks stacked", () => {
    const project = createBlankProject("en-US");
    const alignedSong = songWithTracks("Aligned bilingual");
    project.songs = [alignedSong];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: alignedSong.id }];

    const alignedPlan = createPrintPlan({ project, options, locale: "en-US" });
    const alignedPage = alignedPlan.pages.find((page) => page.kind === "song");
    expect(alignedPage?.kind === "song" ? alignedPage.layoutMode : undefined).toBe(
      "parallel-tracks",
    );
    expect(alignedPage?.kind === "song" ? alignedPage.trackColumns : undefined).toBe(2);

    const translation = requireValue(alignedSong.lyricVersions[0]?.tracks[1]);
    delete translation.alignedTo;
    const independentPlan = createPrintPlan({ project, options, locale: "en-US" });
    const independentPage = independentPlan.pages.find((page) => page.kind === "song");
    expect(independentPage?.kind === "song" ? independentPage.layoutMode : undefined).toBe(
      "stacked-tracks",
    );
    expect(independentPage?.kind === "song" ? independentPage.trackColumns : undefined).toBe(1);
  });

  it("offers the largest readable font candidate for a short song", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Short song");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    track.text = "First line\nSecond line\nThird line";
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const plan = createPrintPlan({
      project,
      options: { ...options, languageMode: "original" },
      locale: "en-US",
    });
    const page = plan.pages.find((candidate) => candidate.kind === "song");

    expect(page?.kind).toBe("song");
    if (page?.kind !== "song") throw new Error("Expected a song page");
    expect(page.fontSize).toBe(page.maxFontSize);
    expect(page.fontSize).toBeGreaterThanOrEqual(20);
    expect(page.minFontSize).toBe(7);
    expect(page.layoutSafety).toBe("pending");
  });

  it("combines consecutive short lines with slashes without losing structural breaks", () => {
    const source =
      "[Verse 1]\nOne\nTwo\nThree\n\nA deliberately much longer lyric line that must stay alone\nFour\nFive";
    const merged = mergeShortLyricLines(source, "a4");

    expect(merged).toBe(
      "[Verse 1]\nOne / Two / Three\n\nA deliberately much longer lyric line that must stay alone\nFour / Five",
    );
  });

  it("does not merge bare CJK structural labels into lyric lines", () => {
    const source = "主歌 1\n一句\n二句\n\n副歌：\n三句\n四句\n\n间奏\n五句";

    expect(mergeShortLyricLines(source, "a4")).toBe(
      "主歌 1\n一句 / 二句\n\n副歌：\n三句 / 四句\n\n间奏\n五句",
    );
  });

  it("uses slash flow when it lets a monolingual song retain larger type", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Forty short lines");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    track.text = Array.from(
      { length: 80 },
      (_, index) => `L${String(index + 1).padStart(2, "0")}`,
    ).join("\n");
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const automatic = createPrintPlan({ project, options, locale: "en-US" });
    const automaticPage = automatic.pages.find((page) => page.kind === "song");
    expect(automaticPage?.kind).toBe("song");
    if (automaticPage?.kind !== "song") throw new Error("Expected song page");
    expect(automaticPage.lineFlow).toBe("slash");
    expect(automaticPage.tracks[0]?.text).toContain(" / ");
    for (let index = 1; index <= 80; index += 1) {
      expect(automaticPage.tracks[0]?.text).toContain(`L${String(index).padStart(2, "0")}`);
    }

    const preserved = createPrintPlan({
      project,
      options: { ...options, lineFlow: "preserve" },
      locale: "en-US",
    });
    const preservedPage = preserved.pages.find((page) => page.kind === "song");
    expect(preservedPage?.kind === "song" ? preservedPage.lineFlow : undefined).toBe("preserve");
    expect(preservedPage?.kind === "song" ? preservedPage.tracks[0]?.text : "").not.toContain(
      " / ",
    );
    expect(automaticPage.fontSize).toBeGreaterThan(
      preservedPage?.kind === "song" ? preservedPage.fontSize : Number.POSITIVE_INFINITY,
    );
  });

  it("never slash-merges line-aligned bilingual tracks", () => {
    const project = createBlankProject("en-US");
    const song = songWithTracks("Aligned lines stay aligned");
    const version = requireValue(song.lyricVersions[0]);
    requireValue(version.tracks[0]).text = "One\nTwo\nThree";
    requireValue(version.tracks[1]).text = "一\n二\n三";
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const plan = createPrintPlan({ project, options, locale: "en-US" });
    const page = plan.pages.find((candidate) => candidate.kind === "song");
    expect(page?.kind === "song" ? page.lineFlow : undefined).toBe("preserve");
    expect(page?.kind === "song" ? page.tracks.map((track) => track.text) : []).toEqual([
      "One\nTwo\nThree",
      "一\n二\n三",
    ]);
  });

  it("preserves every unique lyric line in order when a long song is paginated", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Every line matters");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    const expectedLines = Array.from(
      { length: 360 },
      (_, index) => `UNIQUE-${String(index + 1).padStart(3, "0")}-保留此行`,
    );
    track.text = expectedLines.join("\n");
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const plan = createPrintPlan({
      project,
      options: {
        ...options,
        format: "a5",
        languageMode: "original",
        strategy: "readable",
        lineFlow: "preserve",
      },
      locale: "en-US",
    });
    const pages = plan.pages.filter((page) => page.kind === "song");
    const actualLines = pages.flatMap((page) => page.tracks[0]?.text.split("\n") ?? []);

    expect(pages.length).toBeGreaterThan(1);
    expect(actualLines).toEqual(expectedLines);
    expect(new Set(actualLines).size).toBe(expectedLines.length);
    expect(pages.every((page) => page.pageCountForSong === pages.length)).toBe(true);
  });

  it("marks a strict one-page candidate unsafe instead of discarding text", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Strict limit");
    const track = requireValue(song.lyricVersions[0]?.tracks[0]);
    const expectedText = Array.from(
      { length: 420 },
      (_, index) => `${index + 1}. This line must remain available for measurement`,
    ).join("\n");
    track.text = expectedText;
    project.songs = [song];
    requireValue(project.setlists[0]).items = [{ type: "song", songId: song.id }];

    const plan = createPrintPlan({
      project,
      options: {
        ...options,
        format: "a5",
        languageMode: "original",
        strategy: "strict-page-limit",
      },
      locale: "en-US",
    });
    const pages = plan.pages.filter((page) => page.kind === "song");

    expect(pages).toHaveLength(1);
    expect(pages[0]?.tracks[0]?.text).toBe(expectedText);
    expect(pages[0]?.fontSize).toBe(7);
    expect(pages[0]?.layoutSafety).toBe("unsafe");
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

  it("paginates oversized contents with explicit columns and corrected song offsets", () => {
    const project = projectWithSongs(180);
    const plan = createPrintPlan({ project, options, locale: "en-US" });
    const tocPages = plan.pages.filter((page) => page.kind === "toc");
    const songPages = plan.pages.filter((page) => page.kind === "song");
    const entries = tocPages.flatMap((page) =>
      page.columnSections.flatMap((column) => column.flatMap((section) => section.entries)),
    );

    expect(tocPages.length).toBeGreaterThan(1);
    expect(tocPages.map((page) => page.pageInToc)).toEqual(
      Array.from({ length: tocPages.length }, (_, index) => index + 1),
    );
    expect(tocPages.every((page) => page.pageCountForToc === tocPages.length)).toBe(true);
    expect(tocPages[0]?.continuation).toBe(false);
    expect(tocPages.slice(1).every((page) => page.continuation)).toBe(true);
    expect(tocPages.every((page) => page.columnSections.length === page.columns)).toBe(true);
    expect(entries.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: 180 }, (_, index) => index + 1),
    );
    expect(new Set(entries.map((entry) => entry.songId)).size).toBe(180);
    expect(entries[0]?.pageNumber).toBe(tocPages.length + 1);
    expect(songPages[0]?.pageInSong).toBe(1);
  });

  it("supports no contents page, Chinese fallback section labels, and safe theme fallback", () => {
    const project = projectWithSongs(1);
    project.activeThemeId = "missing";
    const plan = createPrintPlan({
      project,
      options: { ...options, includeTableOfContents: false },
      locale: "zh-CN",
    });
    expect(plan.pages[0]?.kind).toBe("song");
    expect(plan.theme?.id).toBe("default");

    const withContents = createPrintPlan({ project, options, locale: "zh-CN" });
    const toc = withContents.pages[0];
    expect(toc?.kind === "toc" ? toc.sections[0]?.label : undefined).toBe("演出曲目");
  });
});
