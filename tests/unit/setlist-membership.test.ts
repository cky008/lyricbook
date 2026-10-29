import { createBlankProject, getSetlistSongEntries, setlistSongIds } from "@domain/index";
import { describe, expect, it } from "vitest";
import { requireValue } from "./test-utils";

function sample() {
  const setlist = requireValue(createBlankProject("en-US").setlists[0]);
  setlist.items = [
    { type: "song", songId: "opening" },
    { type: "section", label: { en: "Audience requests" }, optional: true },
    { type: "song", songId: "request", optional: false },
    { type: "note", text: { en: "A spoken interlude" } },
    { type: "break", label: { en: "Pause" } },
    { type: "song", songId: "repeated" },
    { type: "section", label: { en: "Finale" } },
    { type: "song", songId: "finale" },
    { type: "song", songId: "repeated" },
    { type: "song", songId: "extra", optional: true },
  ];
  return setlist;
}

describe("setlist membership and effective optionality", () => {
  it("inherits section optionality through notes and breaks, then resets at the next section", () => {
    expect(setlistSongIds(sample(), false)).toEqual(["opening", "repeated", "finale"]);
  });

  it("exposes each song placement and its section without mutating input", () => {
    const setlist = sample();
    const before = structuredClone(setlist);
    const entries = getSetlistSongEntries(setlist);
    expect(entries.map((entry) => [entry.item.songId, entry.itemIndex, entry.optional])).toEqual([
      ["opening", 0, false],
      ["request", 2, true],
      ["repeated", 5, true],
      ["finale", 7, false],
      ["repeated", 8, false],
      ["extra", 9, true],
    ]);
    expect(entries[0]?.section).toBeUndefined();
    expect(entries[1]?.section).toEqual(setlist.items[1]);
    expect(entries[3]?.section).toEqual(setlist.items[6]);
    expect(setlist).toEqual(before);
  });

  it("keeps first-seen order and requires a duplicate song if any appearance is required", () => {
    const setlist = sample();
    setlist.items.push({ type: "song", songId: "opening", optional: true });
    expect(setlistSongIds(setlist, false)).toEqual(["opening", "repeated", "finale"]);
    expect(setlistSongIds(setlist)).toEqual(["opening", "request", "repeated", "finale", "extra"]);
  });

  it("handles empty, section-only, and all-optional setlists", () => {
    expect(getSetlistSongEntries(undefined)).toEqual([]);
    expect(setlistSongIds(undefined, false)).toEqual([]);
    const setlist = sample();
    setlist.items = [{ type: "section", label: { en: "Requests" }, optional: true }];
    expect(getSetlistSongEntries(setlist)).toEqual([]);
    setlist.items.push({ type: "song", songId: "optional-only" });
    expect(setlistSongIds(setlist, false)).toEqual([]);
  });
});
