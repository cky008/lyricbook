import { describe, expect, it } from "vitest";
import type { LyricTrack } from "@domain/index";
import { keyedLyricTracks } from "@app/lib/renderKeys";

describe("render keys", () => {
  it("prefers persistent track ids and disambiguates identical legacy tracks", () => {
    const tracks: LyricTrack[] = [
      { id: "track-original", language: "en", role: "original", text: "One" },
      { language: "zh-Hans", role: "translation", text: "一" },
      { language: "zh-Hans", role: "translation", text: "二" },
    ];

    const keyed = keyedLyricTracks(tracks);
    expect(keyed.map((entry) => entry.key)).toEqual([
      "id:track-original:0",
      "fallback:translation:zh-Hans:::0",
      "fallback:translation:zh-Hans:::1",
    ]);
    expect(keyed.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });
});
