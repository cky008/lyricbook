import { parseProject, validateProject } from "@domain/index";
import { describe, expect, it } from "vitest";
import presetJson from "../../content/presets/gem-gloria/project.json";
import sourceMatrix from "../../content/presets/gem-gloria/source-matrix.json";

const SHENZHEN_SETLIST_ID = "gem-gloria-shenzhen-2026-09-11-observed";

const EXPECTED_SONG_ORDER = [
  "gem-zoo",
  "gem-wolf",
  "gem-devil",
  "gem-lightyears",
  "gem-miss-similar",
  "gem-transparent",
  "gem-loneliness",
  "gem-ice-age",
  "gem-therefore",
  "gem-goodbye",
  "gem-not-first",
  "gem-sleeping-princess",
  "gem-ainy",
  "gem-where",
  "gem-waiting-for-him",
  "gem-all-about-u",
  "gem-good-to-be-bad",
  "gem-someday-ill-fly",
  "gem-drunk",
  "gem-not-happy",
  "gem-tornado",
  "gem-rose",
  "gem-only",
  "gem-period",
  "gem-gloria",
  "gem-raise",
  "gem-pause",
  "gem-oldsea",
  "gem-together",
  "gem-find",
  "gem-like-you",
  "gem-kingdom",
  "gem-night-end",
  "gem-countdown",
  "gem-heartbeat",
  "gem-water",
  "gem-free-you",
  "gem-paint",
  "gem-distortion",
  "gem-let-you-know",
  "gem-bubble",
  "gem-sky",
] as const;

const NEW_SONG_IDS = [
  "gem-waiting-for-him",
  "gem-all-about-u",
  "gem-good-to-be-bad",
  "gem-someday-ill-fly",
  "gem-free-you",
  "gem-paint",
  "gem-distortion",
  "gem-let-you-know",
] as const;

const EXPECTED_SOURCE_SEGMENTS = [
  ["VCR 1+摩天动物园", "06:33", "combined-cue", ["gem-zoo"]],
  ["灰狼", "02:50", "song", ["gem-wolf"]],
  ["来自天堂的魔鬼", "04:11", "song", ["gem-devil"]],
  ["Talk", "04:16", "talk", []],
  ["光年之外", "05:19", "song", ["gem-lightyears"]],
  ["VCR 2", "02:47", "vcr", []],
  ["差不多姑娘", "04:01", "song", ["gem-miss-similar"]],
  ["透明", "03:31", "song", ["gem-transparent"]],
  ["孤独", "03:49", "song", ["gem-loneliness"]],
  ["冰河时代", "03:26", "song", ["gem-ice-age"]],
  ["于是", "04:43", "song", ["gem-therefore"]],
  ["再见", "04:44", "song", ["gem-goodbye"]],
  ["VCR 3", "02:40", "vcr", []],
  ["你不是第一个离开的人", "03:06", "song", ["gem-not-first"]],
  ["睡公主+爱你A.I.N.Y.2017", "02:56", "medley", ["gem-sleeping-princess", "gem-ainy"]],
  ["Where Did U Go+等一个他", "02:34", "medley", ["gem-where", "gem-waiting-for-him"]],
  ["All About U+Good to be Bad", "02:43", "medley", ["gem-all-about-u", "gem-good-to-be-bad"]],
  ["Someday I'll Fly", "01:26", "song", ["gem-someday-ill-fly"]],
  ["你把我灌醉", "02:19", "song", ["gem-drunk"]],
  ["你不是真正的快乐 (Live)", "02:39", "live-song", ["gem-not-happy"]],
  ["龙卷风 (Live)", "01:28", "live-song", ["gem-tornado"]],
  ["红蔷薇白玫瑰", "01:03", "song", ["gem-rose"]],
  ["唯一", "03:37", "song", ["gem-only"]],
  ["句号", "04:51", "song", ["gem-period"]],
  ["VCR 4", "03:41", "vcr", []],
  ["GLORIA", "03:57", "song", ["gem-gloria"]],
  ["You Raise Me Up", "05:41", "song", ["gem-raise"]],
  ["让世界暂停一分钟", "04:47", "song", ["gem-pause"]],
  ["老人与海", "03:11", "song", ["gem-oldsea"]],
  ["多远都要在一起", "02:17", "song", ["gem-together"]],
  ["FIND YOU", "04:43", "song", ["gem-find"]],
  ["喜欢你", "04:06", "song", ["gem-like-you"]],
  ["VCR 5", "01:57", "vcr", []],
  ["敲鼓", "01:41", "reconciled-cue", ["gem-kingdom"]],
  ["夜的尽头", "05:11", "song", ["gem-night-end"]],
  ["倒数", "03:40", "song", ["gem-countdown"]],
  ["新的心跳", "04:02", "song", ["gem-heartbeat"]],
  ["Walk On Water", "04:12", "reconciled-cue", ["gem-water"]],
  ["自由的你（新专辑先行曲）", "04:51", "song", ["gem-free-you"]],
  [
    "点歌清唱：画+失真+让你知道",
    "04:31",
    "request-medley",
    ["gem-paint", "gem-distortion", "gem-let-you-know"],
  ],
  ["泡沫", "04:21", "song", ["gem-bubble"]],
  ["天空没有极限", null, "song", ["gem-sky"]],
] as const;

const EXPECTED_SETLIST_SEQUENCE = [
  "section:shenzhen-part-1",
  "break:VCR 1 +《摩天动物园》组合段 · 06:33",
  "song:gem-zoo",
  "song:gem-wolf",
  "song:gem-devil",
  "note:Talk · 04:16",
  "song:gem-lightyears",
  "section:shenzhen-part-2",
  "break:VCR 2 · 02:47",
  "song:gem-miss-similar",
  "song:gem-transparent",
  "song:gem-loneliness",
  "song:gem-ice-age",
  "song:gem-therefore",
  "song:gem-goodbye",
  "section:shenzhen-part-3",
  "break:VCR 3 · 02:40",
  "song:gem-not-first",
  "note:串烧：《睡公主》+《爱你 A.I.N.Y. 2017》· 合计 02:56",
  "song:gem-sleeping-princess",
  "song:gem-ainy",
  "note:串烧：《Where Did U Go》+《等一个他》· 合计 02:34",
  "song:gem-where",
  "song:gem-waiting-for-him",
  "note:串烧：《All About U》+《Good to Be Bad》· 合计 02:43",
  "song:gem-all-about-u",
  "song:gem-good-to-be-bad",
  "song:gem-someday-ill-fly",
  "song:gem-drunk",
  "song:gem-not-happy",
  "song:gem-tornado",
  "song:gem-rose",
  "song:gem-only",
  "song:gem-period",
  "section:shenzhen-part-4",
  "break:VCR 4 · 03:41",
  "song:gem-gloria",
  "song:gem-raise",
  "song:gem-pause",
  "song:gem-oldsea",
  "song:gem-together",
  "song:gem-find",
  "song:gem-like-you",
  "section:shenzhen-part-5",
  "break:VCR 5 · 01:57",
  "song:gem-kingdom",
  "song:gem-night-end",
  "song:gem-countdown",
  "song:gem-heartbeat",
  "note:现场提示组合段：《G.E.M. / Walk On Water》· 视频章节合计 04:12",
  "song:gem-water",
  "song:gem-free-you",
  "note:点歌清唱：《画》+《失真》+《让你知道》· 合计 04:31；其他场次可能轮换。",
  "song:gem-paint",
  "song:gem-distortion",
  "song:gem-let-you-know",
  "song:gem-bubble",
  "song:gem-sky",
] as const;

function durationSeconds(value: string): number {
  const parts = value.split(":").map(Number);
  expect(parts).toHaveLength(2);
  const [minutes, seconds] = parts;
  if (minutes === undefined || seconds === undefined) throw new Error(`Invalid duration: ${value}`);
  return minutes * 60 + seconds;
}

describe("G.E.M. GLORIA built-in preset", () => {
  const project = parseProject(presetJson);

  it("keeps the prediction and activates the dated Shenzhen opening-night record", () => {
    expect(validateProject(project)).toEqual({ ok: true, issues: [] });
    expect(project.setlists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "gem-gloria-core", status: "prediction" }),
        expect.objectContaining({
          id: SHENZHEN_SETLIST_ID,
          status: "observed",
          date: "2026-09-11",
          venue: expect.objectContaining({ "zh-Hans": "深圳大运中心体育场" }),
        }),
      ]),
    );
    expect(project.activeSetlistId).toBe(SHENZHEN_SETLIST_ID);

    const prediction = project.setlists.find((item) => item.id === "gem-gloria-core");
    expect(
      prediction?.items.filter((item) => item.type === "song").map((item) => item.songId),
    ).toEqual(expect.arrayContaining(["gem-kingdom", "gem-moving"]));
  });

  it("preserves the reconciled song order without turning stage cues into songs", () => {
    const setlist = project.setlists.find((item) => item.id === SHENZHEN_SETLIST_ID);
    expect(setlist).toBeDefined();
    if (!setlist) throw new Error("Expected the Shenzhen observed setlist");

    const songItems = setlist.items.filter((item) => item.type === "song");
    expect(songItems.map((item) => item.songId)).toEqual(EXPECTED_SONG_ORDER);
    expect(new Set(songItems.map((item) => item.songId)).size).toBe(songItems.length);
    expect(setlist.items).toHaveLength(58);
    expect(setlist.items.filter((item) => item.type === "note")).toHaveLength(6);
    expect(
      setlist.items.map((item) => {
        if (item.type === "song") return `song:${item.songId}`;
        if (item.type === "section") return `section:${item.id}`;
        if (item.type === "break") return `break:${item.label?.["zh-Hans"] ?? ""}`;
        return `note:${item.text["zh-Hans"]}`;
      }),
    ).toEqual(EXPECTED_SETLIST_SEQUENCE);

    const songTitles = new Set(
      project.songs.flatMap((song) => [...Object.values(song.titles), ...song.aliases]),
    );
    expect(songTitles).not.toContain("VCR 1");
    expect(songTitles).not.toContain("VCR 2");
    expect(songTitles).not.toContain("VCR 3");
    expect(songTitles).not.toContain("VCR 4");
    expect(songTitles).not.toContain("VCR 5");
    expect(songTitles).not.toContain("Talk");
    expect(songTitles).not.toContain("敲鼓");

    expect(setlist.items.filter((item) => item.type === "section")).toHaveLength(5);
    expect(setlist.items.filter((item) => item.type === "break")).toHaveLength(5);
    expect(setlist.items.every((item) => !("optional" in item) || item.optional !== true)).toBe(
      true,
    );
    expect(
      setlist.items
        .filter((item) => item.type === "section")
        .flatMap((item) => Object.values(item.label))
        .some((label) => /encore|安可/i.test(label)),
    ).toBe(false);
  });

  it("keeps the provisional drum mapping and unresolved slash cue explicit", () => {
    const setlist = project.setlists.find((item) => item.id === SHENZHEN_SETLIST_ID);
    expect(setlist).toBeDefined();
    if (!setlist) throw new Error("Expected the Shenzhen observed setlist");

    const kingdomCome = setlist.items.find(
      (item) => item.type === "song" && item.songId === "gem-kingdom",
    );
    const walkOnWater = setlist.items.find(
      (item) => item.type === "song" && item.songId === "gem-water",
    );

    expect(kingdomCome).toMatchObject({
      confidence: 0.7,
      sourceRefs: ["gem-shenzhen-video-chapters", "gem-shenzhen-laser-cue-photo"],
      note: { "zh-Hans": expect.stringContaining("敲鼓") },
    });
    expect(
      setlist.items.find((item) => item.type === "song" && item.songId === "gem-moving"),
    ).toBeUndefined();
    expect(walkOnWater).toMatchObject({
      confidence: 0.95,
      sourceRefs: ["gem-shenzhen-video-chapters", "gem-shenzhen-laser-cue-photo"],
      note: { "zh-Hans": expect.stringContaining("不把它另算一首歌") },
    });
  });

  it("adds metadata-only records for every newly observed song", () => {
    for (const songId of NEW_SONG_IDS) {
      const song = project.songs.find((item) => item.id === songId);
      expect(song, songId).toBeDefined();
      expect(song?.lyricVersions.flatMap((version) => version.tracks)).not.toHaveLength(0);
      expect(
        song?.lyricVersions.flatMap((version) => version.tracks).every((track) => !track.text),
      ).toBe(true);
    }

    expect(project.songs.find((song) => song.id === "gem-free-you")?.titles["zh-Hans"]).toBe(
      "自由的你",
    );
    expect(project.songs.find((song) => song.id === "gem-not-happy")?.titles["zh-Hans"]).toBe(
      "你不是真正的快乐",
    );
    expect(project.songs.find((song) => song.id === "gem-tornado")?.titles["zh-Hans"]).toBe(
      "龙卷风",
    );
    expect(project.songs.find((song) => song.id === "gem-ainy")?.aliases).toContain(
      "爱你A.I.N.Y.2017",
    );
  });

  it("keeps every supplied chapter and shared duration auditable", () => {
    expect(sourceMatrix.setlistId).toBe(SHENZHEN_SETLIST_ID);
    expect(sourceMatrix.segments).toHaveLength(42);
    expect(
      sourceMatrix.segments.map(({ rawLabel, duration, kind, songIds }) => [
        rawLabel,
        duration,
        kind,
        songIds,
      ]),
    ).toEqual(EXPECTED_SOURCE_SEGMENTS);
    expect(sourceMatrix.segments.map((segment) => segment.position)).toEqual(
      Array.from({ length: 42 }, (_, index) => index + 1),
    );
    expect(sourceMatrix.segments.flatMap((segment) => segment.songIds)).toEqual(
      EXPECTED_SONG_ORDER,
    );

    const knownDurations = sourceMatrix.segments.flatMap((segment) =>
      segment.duration ? [segment.duration] : [],
    );
    expect(knownDurations).toHaveLength(41);
    expect(knownDurations.reduce((total, duration) => total + durationSeconds(duration), 0)).toBe(
      8_901,
    );
    expect(sourceMatrix.durationSummary).toEqual({
      segmentsWithDuration: 41,
      knownDurationSeconds: 8_901,
      knownDuration: "2:28:21",
      excludedSegments: [42],
    });
    expect(sourceMatrix.segments.at(-1)).toMatchObject({
      rawLabel: "天空没有极限",
      duration: null,
    });

    const songIds = new Set(project.songs.map((song) => song.id));
    const sourceIds = new Set((project.sources ?? []).map((source) => source.id));
    expect(sourceMatrix.event.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef))).toBe(true);
    for (const claim of sourceMatrix.contextClaims) {
      expect(claim.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef))).toBe(true);
    }
    for (const segment of sourceMatrix.segments) {
      expect(segment.songIds.every((songId) => songIds.has(songId))).toBe(true);
      expect(segment.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef))).toBe(true);
    }
  });
});
