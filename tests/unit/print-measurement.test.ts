import { repaginateUnsafeSongPages } from "@app/print/measurement";
import { createBlankProject, createEmptySong, type PrintOptions } from "@domain/index";
import { createPrintPlan, type SongPage } from "@print/index";
import { describe, expect, it } from "vitest";
import { requireValue } from "./test-utils";

const options: PrintOptions = {
  format: "a4",
  scope: "active-setlist",
  versionMode: "default",
  languageMode: "original",
  strategy: "balanced",
  includeOptional: true,
  includeEmptySongs: false,
  includeSources: false,
  includeTableOfContents: true,
  includeCover: false,
  lineFlow: "preserve",
  coverMode: "generated",
};

function unsafeTwoSongPlan(paginateOnOverflow: boolean) {
  const project = createBlankProject("en-US");
  const first = createEmptySong("First song");
  const second = createEmptySong("Second song");
  requireValue(first.lyricVersions[0]?.tracks[0]).text = Array.from(
    { length: 8 },
    (_, index) => `FIRST-${index + 1}`,
  ).join("\n");
  requireValue(second.lyricVersions[0]?.tracks[0]).text = "SECOND-1";
  project.songs = [first, second];
  requireValue(project.setlists[0]).items = [
    { type: "song", songId: first.id },
    { type: "song", songId: second.id },
  ];
  const plan = createPrintPlan({ project, options, locale: "en-US" });
  const firstSongPage = plan.pages.find((page) => page.kind === "song");
  if (firstSongPage?.kind !== "song") throw new Error("Expected a song page");
  firstSongPage.layoutSafety = "unsafe";
  firstSongPage.paginateOnOverflow = paginateOnOverflow;
  return { plan, firstId: first.id, secondId: second.id };
}

describe("measured print repagination", () => {
  it("bisects a normal unsafe page and recalculates following contents links", () => {
    const { plan, firstId, secondId } = unsafeTwoSongPlan(true);
    const result = repaginateUnsafeSongPages(plan);
    const firstPages = result.pages.filter(
      (page): page is SongPage => page.kind === "song" && page.songId === firstId,
    );
    const firstText = firstPages.flatMap((page) => page.tracks[0]?.text.split("\n") ?? []);
    const secondEntry = result.pages
      .filter((page) => page.kind === "toc")
      .flatMap((page) => page.sections)
      .flatMap((section) => section.entries)
      .find((entry) => entry.songId === secondId);

    expect(firstPages).toHaveLength(2);
    expect(firstPages.map((page) => page.pageInSong)).toEqual([1, 2]);
    expect(firstPages.every((page) => page.pageCountForSong === 2)).toBe(true);
    expect(firstPages.every((page) => page.layoutSafety === "pending")).toBe(true);
    expect(firstText).toEqual(Array.from({ length: 8 }, (_, index) => `FIRST-${index + 1}`));
    expect(secondEntry?.pageNumber).toBe(4);
  });

  it("leaves strict unsafe pages intact", () => {
    const { plan } = unsafeTwoSongPlan(false);
    const result = repaginateUnsafeSongPages(plan);

    expect(result.pages).toEqual(plan.pages);
  });

  it("bisects an unsafe single-line page without dropping Unicode text", () => {
    const { plan, firstId } = unsafeTwoSongPlan(true);
    const expectedText = "纸上灯火🌙".repeat(800);
    const firstPage = plan.pages.find(
      (page): page is SongPage => page.kind === "song" && page.songId === firstId,
    );
    if (!firstPage) throw new Error("Expected the first song page");
    const firstTrack = firstPage.tracks[0];
    if (!firstTrack) throw new Error("Expected the first lyric track");
    firstTrack.text = expectedText;

    const result = repaginateUnsafeSongPages(plan);
    const splitPages = result.pages.filter(
      (page): page is SongPage => page.kind === "song" && page.songId === firstId,
    );

    expect(splitPages).toHaveLength(2);
    expect(splitPages.map((page) => page.tracks[0]?.text ?? "").join("")).toBe(expectedText);
  });
});
