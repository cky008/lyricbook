import { SongSidebar } from "@app/components/SongSidebar";
import { createEmptySong, type Setlist } from "@domain/index";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/i18n", () => ({
  useI18n: () => ({
    t: (id: string) =>
      ({
        "setlist-membership-main": "Main programme",
        "setlist-membership-observed": "Performed that night",
        "setlist-membership-optional": "Optional song",
        "setlist-membership-library": "Library only",
      })[id] ?? id,
  }),
}));

afterEach(cleanup);

function fixture() {
  const songs = ["Main song", "Request song", "Extra song", "Repeated song"].map(
    (title, index) => ({
      ...createEmptySong(title),
      id: `song-${index}`,
      tags: ["legacy-optional-tag"],
    }),
  );
  const setlist: Setlist = {
    id: "preparation",
    title: { en: "Preparation setlist" },
    status: "prediction",
    items: [
      { type: "song", songId: "song-0" },
      { type: "song", songId: "song-3" },
      { type: "section", label: { en: "Requests" }, optional: true },
      { type: "song", songId: "song-1", optional: false },
      { type: "song", songId: "song-3" },
    ],
  };
  return { songs, setlist };
}

function renderSidebar(setlist: Setlist | undefined = fixture().setlist) {
  const onSelectSong = vi.fn();
  const props = {
    songs: fixture().songs,
    setlist,
    selectedSongId: "song-0",
    locale: "en-US" as const,
    query: "",
    onQueryChange: vi.fn(),
    activeTags: [],
    onToggleTag: vi.fn(),
    onClearTags: vi.fn(),
    onSelectSong,
    onAddSong: vi.fn(),
    onTransfer: vi.fn(),
  };
  return { ...render(<SongSidebar {...props} />), onSelectSong };
}

describe("SongSidebar active setlist membership", () => {
  it("distinguishes the main programme, inherited optional songs, and library-only songs", async () => {
    const { onSelectSong } = renderSidebar();
    const main = screen.getByRole("button", { name: /Main song/ });
    const request = screen.getByRole("button", { name: /Request song/ });
    const extra = screen.getByRole("button", { name: /Extra song/ });
    const repeated = screen.getByRole("button", { name: /Repeated song/ });

    expect(within(main).getByText("Main programme")).toBeInTheDocument();
    expect(within(request).getByText("Optional song")).toBeInTheDocument();
    expect(within(extra).getByText("Library only")).toBeInTheDocument();
    expect(within(repeated).getByText("Main programme")).toBeInTheDocument();
    expect(within(repeated).queryByText("Optional song")).not.toBeInTheDocument();
    await userEvent.setup().click(extra);
    expect(onSelectSong).toHaveBeenCalledWith("song-2");
  });

  it("labels observed performances as observations, not a promise for future shows", () => {
    renderSidebar({ ...fixture().setlist, status: "observed" });
    expect(
      within(screen.getByRole("button", { name: /Main song/ })).getByText("Performed that night"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Main programme")).not.toBeInTheDocument();
  });

  it("keeps all songs accessible as library-only when the active setlist is empty", () => {
    renderSidebar({ ...fixture().setlist, items: [] });
    expect(screen.getAllByText("Library only")).toHaveLength(4);
  });
});
