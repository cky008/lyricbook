import { describe, expect, it } from "vitest";
import { createBlankProject, createEmptySong } from "@domain/index";
import {
  activeSetlist,
  currentVersionId,
  orderedSongIds,
  songTitle,
} from "@app/lib/projectHelpers";
import { requireValue } from "./test-utils";

describe("project helpers", () => {
  it("selects the active setlist and falls back safely", () => {
    const project = createBlankProject("en-US");
    project.setlists.push({
      id: "second",
      title: { en: "Second" },
      status: "draft",
      items: [],
    });
    project.activeSetlistId = "second";
    expect(activeSetlist(project)?.id).toBe("second");

    project.activeSetlistId = "missing";
    expect(activeSetlist(project)?.id).toBe("main-setlist");

    project.setlists = [];
    expect(activeSetlist(project)).toBeUndefined();
  });

  it("orders unique setlist songs, filters optional entries, and appends library extras", () => {
    const project = createBlankProject("en-US");
    const first = createEmptySong("First");
    const second = createEmptySong("Second");
    const extra = createEmptySong("Extra");
    project.songs = [first, second, extra];
    const setlist = requireValue(project.setlists[0]);
    setlist.items = [
      { type: "song", songId: second.id, optional: true },
      { type: "song", songId: first.id },
      { type: "song", songId: second.id },
      { type: "section", label: { en: "Encore" } },
    ];

    expect(orderedSongIds(project)).toEqual([second.id, first.id, extra.id]);
    expect(orderedSongIds(project, false)).toEqual([first.id, second.id, extra.id]);

    project.setlists = [];
    expect(orderedSongIds(project)).toEqual([first.id, second.id, extra.id]);
  });

  it("localizes titles and falls back to the song id", () => {
    const song = createEmptySong("Song", "en");
    song.titles = { "zh-Hans": "歌曲" };
    expect(songTitle(song, "zh-CN")).toBe("歌曲");
    song.titles = {};
    expect(songTitle(song, "en-US")).toBe(song.id);
  });

  it("resolves selected, default, first, and missing lyric versions", () => {
    const project = createBlankProject("en-US");
    const song = createEmptySong("Song");
    song.lyricVersions.push({
      id: "live",
      label: { en: "Live" },
      kind: "live",
      isDefault: false,
      tracks: [],
    });
    project.preferences = { activeVersionBySong: { [song.id]: "live" } };
    expect(currentVersionId(project, song)).toBe("live");

    project.preferences.activeVersionBySong = { [song.id]: "missing" };
    expect(currentVersionId(project, song)).toBe("default");

    song.lyricVersions[0] = { ...requireValue(song.lyricVersions[0]), isDefault: false };
    expect(currentVersionId(project, song)).toBe("default");

    song.lyricVersions = [];
    expect(currentVersionId(project, song)).toBe("");
  });
});
