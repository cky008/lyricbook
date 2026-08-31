import { describe, expect, it } from "vitest";
import { createBlankProject, parseSetlistText, type PrintOptions } from "@domain/index";
import { createPrintPlan } from "@print/index";

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

describe("print plan", () => {
  it("creates linked contents and hides single-version labels", () => {
    const project = createBlankProject("en-US");
    const parsed = parseSetlistText("## Part 1\nSong A\nSong B", project, "en-US");
    project.songs.push(...parsed.createdSongs);
    project.setlists = [parsed.setlist];
    project.activeSetlistId = parsed.setlist.id;
    project.songs[0]!.lyricVersions[0]!.tracks[0]!.text = "One\nTwo\nThree";
    const plan = createPrintPlan({ project, options, locale: "en-US" });
    expect(plan.songCount).toBe(2);
    expect(plan.pages[0]?.kind).toBe("toc");
    const firstSongPage = plan.pages.find((page) => page.kind === "song");
    expect(firstSongPage?.kind === "song" ? firstSongPage.versionLabel : "bad").toBeUndefined();
  });

  it("keeps multiple version labels and produces booklet sheets", () => {
    const project = createBlankProject("en-US");
    const parsed = parseSetlistText("Song A", project, "en-US");
    project.songs.push(...parsed.createdSongs);
    project.setlists = [parsed.setlist];
    project.activeSetlistId = parsed.setlist.id;
    const song = project.songs[0]!;
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
    expect(plan.pages.length % 4).toBe(0);
    expect(plan.bookletSheets.length).toBeGreaterThan(0);
    expect(plan.pages.filter((page) => page.kind === "song")).toHaveLength(2);
  });
});
