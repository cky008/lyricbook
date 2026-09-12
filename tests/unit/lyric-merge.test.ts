import { DEFAULT_THEME, validateProject } from "@domain/index";
import { mergeProjectLyrics } from "@domain/lyric-merge";
import type { LyricBookProject, LyricVersion, Song, Source } from "@domain/types";
import { describe, expect, it } from "vitest";
import { requireValue } from "./test-utils";

function version(id = "default", text = "", extra: Partial<LyricVersion> = {}): LyricVersion {
  return {
    id,
    label: { en: "Default", "zh-Hans": "默认版" },
    kind: "studio",
    isDefault: true,
    tracks: [{ id: "original", role: "original", language: "en", text }],
    ...extra,
  };
}

function song(id: string, title = id, versions = [version()]): Song {
  return {
    id,
    titles: { en: title },
    aliases: [],
    tags: [],
    sourceRefs: [],
    lyricVersions: versions,
  };
}

function project(songs: Song[], sources?: Source[]): LyricBookProject {
  return {
    schemaVersion: 1,
    id: "current-project",
    title: { en: "Current concert" },
    songs,
    setlists: [
      {
        id: "new-setlist",
        title: { en: "New order" },
        status: "observed",
        items: songs.map(({ id }) => ({ type: "song", songId: id })),
      },
    ],
    themes: [structuredClone(DEFAULT_THEME)],
    activeSetlistId: "new-setlist",
    activeThemeId: DEFAULT_THEME.id,
    preferences: {
      uiLocale: "zh-CN",
      activeVersionBySong: {},
      favoriteSongIds: [],
      print: { format: "a5" },
    },
    ...(sources ? { sources } : {}),
  };
}

describe("merging a lyric library into the current project", () => {
  it("keeps the new setlist and all project settings while filling blank songs by stable id", () => {
    const target = project([song("second", "New title"), song("first")]);
    target.preferences = {
      ...target.preferences,
      activeSongId: "second",
      activeVersionBySong: { second: "default" },
      favoriteSongIds: ["first"],
    };
    const donor = project([
      song("first", "Old first", [version("old", "First invented line\n")]),
      song("second", "Old title", [version("old", "  Second invented line\r\n下一行  ")]),
    ]);
    donor.id = "old-project";
    donor.title = { en: "Old concert" };
    const beforeTarget = structuredClone(target);
    const beforeDonor = structuredClone(donor);

    const { project: result, report } = mergeProjectLyrics(target, donor);

    expect(result.setlists).toEqual(target.setlists);
    expect(result.title).toEqual(target.title);
    expect(result.id).toBe(target.id);
    expect(result.themes).toEqual(target.themes);
    expect(result.activeThemeId).toBe(target.activeThemeId);
    expect(result.activeSetlistId).toBe(target.activeSetlistId);
    expect(result.preferences).toEqual(target.preferences);
    expect(result.songs[0]?.titles).toEqual(target.songs[0]?.titles);
    expect(result.songs[0]?.lyricVersions[0]).toMatchObject({
      id: "default",
      isDefault: true,
      tracks: [{ text: "  Second invented line\r\n下一行  " }],
    });
    expect(report).toEqual({
      matchedSongs: 2,
      updatedSongs: 2,
      addedSongs: 0,
      addedVersions: 2,
      ambiguousSongs: [],
      emptySongs: 0,
    });
    expect(target).toEqual(beforeTarget);
    expect(donor).toEqual(beforeDonor);
    expect(validateProject(result).ok).toBe(true);
  });

  it("matches unique explicit titles and aliases with Unicode and whitespace normalization", () => {
    const targetSong = song("current", "Ｃａｆé   Moon");
    targetSong.aliases = ["月下之歌"];
    const target = project([targetSong]);
    const donor = project([song("old", "  cafe\u0301 moon  ", [version("old", "Invented words")])]);
    expect(mergeProjectLyrics(target, donor).report.matchedSongs).toBe(1);
    donor.songs[0] = song("old", "月下之歌", [version("old", "Invented words")]);
    expect(mergeProjectLyrics(target, donor).report.matchedSongs).toBe(1);
  });

  it("does not guess translations or strip meaningful title punctuation", () => {
    const target = project([song("current", "月下之歌"), song("punctuated", "A.B.")]);
    const donor = project([
      song("other", "Moon song", [version("default", "Words")]),
      song("plain", "AB", [version("default", "More words")]),
    ]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.report).toMatchObject({ matchedSongs: 0, addedSongs: 2 });
    expect(result.project.setlists).toEqual(target.setlists);
  });

  it("skips ambiguous title matches without leaking sources or picking library order", () => {
    const first = song("first", "Shared title");
    const second = song("second", "Second title");
    second.aliases = ["Shared title"];
    const donorSong = song("legacy", "Shared title", [version("default", "Words")]);
    donorSong.sourceRefs = ["private-note"];
    const target = project([first, second]);
    const donor = project(
      [donorSong],
      [{ id: "private-note", title: "Donor note", kind: "other" }],
    );
    const result = mergeProjectLyrics(target, donor);
    expect(result.project).toEqual(target);
    expect(result.report).toEqual({
      matchedSongs: 0,
      updatedSongs: 0,
      addedSongs: 0,
      addedVersions: 0,
      ambiguousSongs: ["legacy"],
      emptySongs: 0,
    });
  });

  it("skips every competing fallback donor but reserves a stable-id match", () => {
    const target = project([song("current", "Shared title")]);
    const duplicateDonors = [
      song("old-one", "Shared title", [version("default", "One")]),
      song("old-two", "Shared title", [version("default", "Two")]),
    ];
    const ambiguous = mergeProjectLyrics(target, project(duplicateDonors));
    expect(ambiguous.project).toEqual(target);
    expect(ambiguous.report.ambiguousSongs).toEqual(["old-one", "old-two"]);
    const preferred = mergeProjectLyrics(
      target,
      project([...duplicateDonors, song("current", "Renamed", [version("default", "Stable")])]),
    );
    expect(preferred.report.matchedSongs).toBe(1);
    expect(preferred.report.ambiguousSongs).toEqual(["old-one", "old-two"]);
    expect(preferred.project.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("Stable");
  });

  it("preserves populated defaults and selections, appending differing versions with collision-safe ids", () => {
    const targetSong = song("same", "Same", [
      version("default", "Existing words"),
      version("default-imported", "Other words", { isDefault: false }),
    ]);
    const target = project([targetSong]);
    target.preferences = { activeVersionBySong: { same: "default-imported" } };
    const donor = project([song("same", "Same", [version("default", "Imported words")])]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.project.songs[0]?.lyricVersions).toEqual([
      ...targetSong.lyricVersions,
      version("default-imported-2", "Imported words", { isDefault: false }),
    ]);
    expect(result.project.preferences).toEqual(target.preferences);
    expect(result.report).toMatchObject({ updatedSongs: 1, addedVersions: 1 });
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
    expect(mergeProjectLyrics(result.project, donor).report).toMatchObject({
      matchedSongs: 1,
      updatedSongs: 0,
      addedVersions: 0,
    });
  });

  it("preserves bilingual tracks byte-for-byte and retains semantically distinct versions", () => {
    const bilingual = version("live", "", {
      label: { en: "Live" },
      kind: "live",
      note: "Acoustic arrangement",
      tracks: [
        { id: "source", language: "zh-Hant", role: "original", text: "虛構一行\r\n\n下一行 " },
        {
          id: "translation",
          language: "en",
          role: "translation",
          label: { en: "Literal" },
          alignedTo: "source",
          text: "Invented first\r\n\nNext ",
        },
        {
          id: "phonetic",
          language: "zh-Latn",
          role: "transliteration",
          alignedTo: "source",
          text: "xu gou yi hang",
        },
        { language: "en", role: "adaptation", text: "An invented adaptation" },
      ],
    });
    const studio = {
      ...structuredClone(bilingual),
      id: "studio",
      kind: "studio",
      isDefault: false,
    };
    const alternateLabel = {
      ...structuredClone(bilingual),
      id: "alternate",
      label: { en: "Alternative performance" },
      isDefault: false,
    };
    const donor = project([song("same", "Same", [bilingual, studio, alternateLabel])]);
    const result = mergeProjectLyrics(project([song("same")]), donor);
    expect(result.report.addedVersions).toBe(3);
    expect(result.project.songs[0]?.lyricVersions.map(({ tracks }) => tracks)).toEqual(
      donor.songs[0]?.lyricVersions.map(({ tracks }) => tracks),
    );
    const renamed = structuredClone(donor);
    for (const donorVersion of requireValue(renamed.songs[0]).lyricVersions) {
      donorVersion.id += "-renamed";
      requireValue(donorVersion.tracks[0]).id = "renamed-source";
      for (const track of donorVersion.tracks)
        if (track.alignedTo === "source") track.alignedTo = "renamed-source";
    }
    expect(mergeProjectLyrics(result.project, renamed).report.addedVersions).toBe(0);
  });

  it("does not hide imported lyrics behind an empty default or stale selected version", () => {
    const target = project([
      song("same", "Same", [
        version("placeholder"),
        version("empty-extra", "  ", { isDefault: false }),
      ]),
    ]);
    target.preferences = { activeVersionBySong: { same: "empty-extra" } };
    const donor = project([
      song("same", "Same", [
        version("blank"),
        version("live", "Live words", { isDefault: false, kind: "live" }),
      ]),
    ]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.project.songs[0]?.lyricVersions[0]).toMatchObject({
      id: "placeholder",
      kind: "live",
      isDefault: true,
      tracks: [{ text: "Live words" }],
    });
    expect(result.project.preferences?.activeVersionBySong?.same).toBe("placeholder");
    expect(result.report.addedVersions).toBe(1);
  });

  it("repairs an empty default when the imported version already exists as a populated alternative", () => {
    const target = project([
      song("same", "Same", [version("blank"), version("existing", "Words", { isDefault: false })]),
    ]);
    target.preferences = { activeVersionBySong: { same: "missing" } };
    const result = mergeProjectLyrics(
      target,
      project([song("same", "Same", [version("donor", "Words")])]),
    );
    expect(result.project.songs[0]?.lyricVersions.find((item) => item.isDefault)?.id).toBe(
      "existing",
    );
    expect(result.project.preferences?.activeVersionBySong?.same).toBe("existing");
    expect(result.report).toMatchObject({ updatedSongs: 1, addedVersions: 0 });
  });

  it("adds source-only lyric songs without changing the active setlist and normalizes their default", () => {
    const target = project([song("new")]);
    const extra = song("optional-old", "Extra", [
      version("empty"),
      version("live", "Extra words", { isDefault: false }),
    ]);
    const donor = project([extra, song("no-lyrics", "Empty", [version("default", " \n\t")])]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.project.songs.map(({ id }) => id)).toEqual(["new", "optional-old"]);
    expect(result.project.setlists).toEqual(target.setlists);
    expect(result.project.songs[1]?.lyricVersions.find((item) => item.isDefault)?.id).toBe("live");
    expect(result.report).toMatchObject({ addedSongs: 1, addedVersions: 1, emptySongs: 1 });
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
  });

  it("reuses equivalent citations and deterministically remaps conflicting source ids", () => {
    const targetSource = { id: "note", kind: "other", title: "Current source" };
    const donorSource = { id: "note", kind: "other", title: "Imported source" };
    const equivalentSource = { id: "duplicate", kind: "other", title: "Current source" };
    const target = project(
      [song("same")],
      [targetSource, { id: "note-imported", kind: "other", title: "Another source" }],
    );
    requireValue(target.songs[0]).sourceRefs = ["note"];
    const donorSong = song("same", "Same", [version("default", "Words")]);
    donorSong.sourceRefs = ["note", "duplicate"];
    const donor = project(
      [donorSong],
      [donorSource, equivalentSource, { id: "unused", kind: "other", title: "Unused" }],
    );
    const result = mergeProjectLyrics(target, donor);
    expect(result.project.songs[0]?.sourceRefs).toEqual(["note", "note-imported-2"]);
    expect(result.project.sources).toEqual([
      ...requireValue(target.sources),
      { ...donorSource, id: "note-imported-2" },
    ]);
    expect(validateProject(result.project).ok).toBe(true);
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
  });

  it("leaves the target untouched for entirely empty donors", () => {
    const target = project([song("same", "Same", [version("default", "Keep")])]);
    const donor = project([song("same"), song("absent", "Absent", [])]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.project).toEqual(target);
    expect(result.report).toEqual({
      matchedSongs: 0,
      updatedSongs: 0,
      addedSongs: 0,
      addedVersions: 0,
      ambiguousSongs: [],
      emptySongs: 2,
    });
  });

  it("validates both inputs before changes, including unknown source and song references", () => {
    const target = project([song("same")]);
    const donor = project([song("same", "Same", [version("default", "Words")])]);
    const invalidDonor = structuredClone(donor);
    requireValue(invalidDonor.songs[0]).sourceRefs = ["missing"];
    expect(() => mergeProjectLyrics(target, invalidDonor)).toThrow(/Missing source reference/);
    const invalidTarget = structuredClone(target);
    requireValue(invalidTarget.setlists[0]).items.push({ type: "song", songId: "missing" });
    expect(() => mergeProjectLyrics(invalidTarget, donor)).toThrow(/Missing song reference/);
    const invalidShape = { ...donor, schemaVersion: 2 } as unknown as LyricBookProject;
    expect(() => mergeProjectLyrics(target, invalidShape)).toThrow();
    expect(target.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
  });

  it("handles a full 42-song setlist plus old optional songs without losing either library or order", () => {
    const latest = Array.from({ length: 42 }, (_, index) =>
      song(`song-${index}`, `Synthetic song ${index}`),
    );
    const target = project(latest);
    const old = Array.from({ length: 60 }, (_, index) =>
      song(`song-${index}`, `Synthetic song ${index}`, [
        version("default", `Invented fixture line ${index}\nSecond line ${index}`),
      ]),
    );
    const donor = project(old.reverse());
    const result = mergeProjectLyrics(target, donor);
    expect(result.report).toMatchObject({
      matchedSongs: 42,
      updatedSongs: 42,
      addedSongs: 18,
      addedVersions: 60,
      emptySongs: 0,
    });
    expect(result.project.songs).toHaveLength(60);
    expect(result.project.setlists).toEqual(target.setlists);
    expect(result.project.songs.slice(0, 42).map(({ id }) => id)).toEqual(
      latest.map(({ id }) => id),
    );
    expect(
      result.project.songs.every((item) =>
        item.lyricVersions.some((entry) =>
          entry.tracks.some((track) => track.text.includes("Invented fixture")),
        ),
      ),
    ).toBe(true);
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
  });

  it("supports empty libraries and missing preferences while deduplicating donor versions", () => {
    const target = project([]);
    delete target.preferences;
    const first = version("first", "Words", { isDefault: false });
    const second = version("second", "Words");
    const third = version("third", "Words", { isDefault: false, label: { en: "Alternative" } });
    const donor = project([song("extra", "Extra", [first, second, third])]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.report).toMatchObject({ addedSongs: 1, addedVersions: 2 });
    expect(result.project.songs[0]?.lyricVersions.map(({ id }) => id)).toEqual(["second", "third"]);
    expect(result.project.preferences).toBeUndefined();
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
  });

  it("ignores localization key order but preserves role, language, notes, and alignment distinctions", () => {
    const existing = version("current", "Words");
    const same = version("old", "Words", { label: { "zh-Hans": "默认版", en: "Default" } });
    const donorVersions = [same];
    donorVersions.push(
      version("translation", "Words", {
        isDefault: false,
        tracks: [{ role: "translation", language: "en", text: "Words" }],
      }),
    );
    donorVersions.push(
      version("language", "Words", {
        isDefault: false,
        tracks: [{ role: "original", language: "zh-Hant", text: "Words" }],
      }),
    );
    donorVersions.push(
      version("note", "Words", { isDefault: false, note: "Distinct performance" }),
    );
    donorVersions.push(
      version("alignment", "Words", {
        isDefault: false,
        tracks: [
          { role: "original", language: "en", text: "Words", alignedTo: "external-original" },
        ],
      }),
    );
    const target = project([song("same", "Same", [existing])]);
    const donor = project([song("same", "Same", donorVersions)]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.report.addedVersions).toBe(4);
    expect(result.project.songs[0]?.lyricVersions).toHaveLength(5);
    expect(result.project.songs[0]?.lyricVersions[4]?.tracks[0]?.alignedTo).toBe(
      "external-original",
    );
    expect(mergeProjectLyrics(result.project, donor).project).toEqual(result.project);
  });

  it("keeps the populated selected version when repairing a blank default", () => {
    const target = project([
      song("same", "Same", [
        version("blank"),
        version("first", "First", { isDefault: false }),
        version("selected", "Selected", { isDefault: false }),
      ]),
    ]);
    target.preferences = { activeVersionBySong: { same: "selected" } };
    const result = mergeProjectLyrics(
      target,
      project([song("same", "Same", [version("donor", "Words")])]),
    );
    expect(result.project.preferences).toEqual(target.preferences);
    expect(result.project.songs[0]?.lyricVersions.find((item) => item.isDefault)?.id).toBe(
      "selected",
    );
  });

  it("rejects duplicate version and track ids before importing any content", () => {
    const target = project([song("same")]);
    const duplicated = project([
      song("same", "Same", [
        version("duplicate", "First"),
        version("duplicate", "Second", { isDefault: false }),
      ]),
    ]);
    expect(() => mergeProjectLyrics(target, duplicated)).toThrow(/Duplicate lyric version id/);
    const duplicateTracks = version("default", "Words");
    duplicateTracks.tracks.push({
      id: "original",
      language: "en",
      role: "translation",
      text: "Translation",
    });
    expect(() =>
      mergeProjectLyrics(target, project([song("same", "Same", [duplicateTracks])])),
    ).toThrow(/Duplicate lyric track id/);
    expect(target.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe("");
  });

  it("does not treat object prototype properties as selected song versions", () => {
    const target = project([song("constructor"), song("__proto__")]);
    const donor = project([
      song("constructor", "Constructor", [version("default", "One")]),
      song("__proto__", "Prototype", [version("default", "Two")]),
    ]);
    const result = mergeProjectLyrics(target, donor);
    expect(result.project.preferences).toEqual(target.preferences);
    expect(
      Object.hasOwn(requireValue(result.project.preferences?.activeVersionBySong), "constructor"),
    ).toBe(false);
  });
});
