import { SongReader } from "@app/components/SongReader";
import { createEmptySong } from "@domain/index";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/i18n", () => ({
  useI18n: () => ({
    t: (id: string, args?: Record<string, unknown>) =>
      ({
        edit: "Edit",
        "empty-lyrics": "No lyrics",
        "immersive-mode": "Immersive mode",
        lyrics: "Lyrics",
        next: "Next",
        "no-next-song": "End of setlist",
        previous: "Previous",
        "search-apple-music": `Search “${String(args?.title)}” on Apple Music`,
        "search-youtube": `Search “${String(args?.title)}” on YouTube`,
      })[id] ?? id,
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SongReader listening searches", () => {
  it("builds explicit external searches from title metadata without leaking lyrics", () => {
    const title = "很长的中文测试标题 月光纸船";
    const privateLyric = "PRIVATE-LYRIC-MUST-NOT-ENTER-A-URL";
    const song = createEmptySong(title, "zh-Hans");
    song.aliases = ["PRIVATE-ALIAS-MUST-NOT-ENTER-A-URL"];
    song.tags = ["PRIVATE-TAG-MUST-NOT-ENTER-A-URL"];
    const track = song.lyricVersions[0]?.tracks[0];
    if (!track) throw new Error("Expected the fixture track");
    track.text = privateLyric;

    render(
      <SongReader
        song={song}
        locale="zh-CN"
        selectedVersionId="default"
        onSelectVersion={vi.fn()}
        onEdit={vi.fn()}
        onImmersive={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    const appleMusic = screen.getByRole("link", {
      name: `Search “${title}” on Apple Music`,
    });
    const youtube = screen.getByRole("link", { name: `Search “${title}” on YouTube` });

    expect(appleMusic).toHaveAttribute("target", "_blank");
    expect(appleMusic).toHaveAttribute("rel", "noopener noreferrer");
    expect(appleMusic).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(youtube).toHaveAttribute("target", "_blank");
    expect(youtube).toHaveAttribute("rel", "noopener noreferrer");
    expect(youtube).toHaveAttribute("referrerpolicy", "no-referrer");

    const appleUrl = new URL(appleMusic.getAttribute("href") ?? "", "https://local.invalid");
    const youtubeUrl = new URL(youtube.getAttribute("href") ?? "", "https://local.invalid");
    expect(appleUrl.origin + appleUrl.pathname).toBe("https://music.apple.com/search");
    expect(appleUrl.searchParams.get("term")).toBe(title);
    expect([...appleUrl.searchParams]).toEqual([["term", title]]);
    expect(youtubeUrl.origin + youtubeUrl.pathname).toBe("https://www.youtube.com/results");
    expect(youtubeUrl.searchParams.get("search_query")).toBe(title);
    expect([...youtubeUrl.searchParams]).toEqual([["search_query", title]]);
    expect(`${appleUrl.href}${youtubeUrl.href}`).not.toContain(privateLyric);
    expect(`${appleUrl.href}${youtubeUrl.href}`).not.toContain("PRIVATE-ALIAS");
    expect(`${appleUrl.href}${youtubeUrl.href}`).not.toContain("PRIVATE-TAG");
  });

  it("does not expose search links when a song has no title metadata", () => {
    const song = createEmptySong("Temporary");
    song.titles = {};
    render(
      <SongReader
        song={song}
        locale="en-US"
        selectedVersionId="default"
        onSelectVersion={vi.fn()}
        onEdit={vi.fn()}
        onImmersive={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: /Apple Music/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /YouTube/i })).not.toBeInTheDocument();
  });
});
