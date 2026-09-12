import { ImportExportDialog } from "@app/features/ImportExportDialog";
import { importProjectFile } from "@app/lib/archive";
import { loadPreset } from "@app/lib/presets";
import { createBlankProject, createEmptySong, type LyricBookProject } from "@domain/index";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireValue } from "./test-utils";

vi.mock("@app/components/DialogShell", () => ({
  DialogShell: ({
    open,
    title,
    children,
    footer,
    dismissible,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    dismissible?: boolean;
  }) =>
    open ? (
      <div aria-label={title} role="dialog" data-dismissible={dismissible}>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@app/lib/archive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/archive")>()),
  importProjectFile: vi.fn(),
}));
vi.mock("@app/lib/presets", () => ({ loadPreset: vi.fn(), loadPresetIndex: vi.fn() }));

vi.mock("@app/lib/i18n", () => ({
  useI18n: () => ({
    t: (id: string) =>
      ({
        "blank-project": "Blank project",
        "confirm-clear": "Replace the current project?",
        export: "Export",
        import: "Import",
        preset: "Preset",
        privacy: "Private and local",
      })[id] ?? id,
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImportExportDialog project replacement", () => {
  it("reports a blank-project backup failure and restores the action", async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn().mockRejectedValue(new Error("Required backup unavailable"));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(
      <ImportExportDialog
        open
        onOpenChange={vi.fn()}
        project={createBlankProject("en-US")}
        locale="en-US"
        presets={[]}
        appVersion="0.0.7"
        onReplace={onReplace}
        onChange={vi.fn()}
      />,
    );

    const blankProject = screen.getByRole("button", { name: "Blank project" });
    await user.click(blankProject);

    expect(await screen.findByText("Required backup unavailable")).toBeInTheDocument();
    expect(blankProject).toBeEnabled();
    expect(onReplace).toHaveBeenCalledTimes(1);
  });
});

function lyricProjects() {
  const current = createBlankProject("en-US");
  const song = createEmptySong("Synthetic Moon");
  song.id = "shared-song";
  current.songs = [song];
  requireValue(current.setlists[0]).items = [{ type: "song", songId: song.id }];
  const source = structuredClone(current);
  source.id = "older-project";
  source.setlists = [
    { id: "older-order", title: { en: "Old show" }, status: "archive", items: [] },
  ];
  source.activeSetlistId = "older-order";
  requireValue(source.songs[0]?.lyricVersions[0]?.tracks[0]).text =
    "Invented moonlight\nInvented skyline";
  return { current, source };
}

function renderTransfer(
  current: LyricBookProject,
  onReplace = vi.fn().mockResolvedValue(undefined),
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    project: current,
    locale: "en-US" as const,
    presets: [{ id: "new-preset", title: { en: "New preset" }, path: "new.json" }],
    appVersion: "0.0.8",
    onReplace,
    onChange: vi.fn(),
  };
  return { ...render(<ImportExportDialog {...props} />), props, onReplace };
}

async function chooseArchive(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Expected file input");
  await userEvent.upload(input, new File(["synthetic"], "old.lyricbook"));
}

describe("ImportExportDialog lyric reuse", () => {
  it("previews before mutation and keeps the current setlist when reusing old lyrics", async () => {
    const { current, source } = lyricProjects();
    vi.mocked(importProjectFile).mockResolvedValue(source);
    const { container, onReplace, props } = renderTransfer(current);
    await chooseArchive(container);
    expect(onReplace).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "import-merge-lyrics" }));
    const result = onReplace.mock.calls[0]?.[0] as LyricBookProject;
    expect(result.activeSetlistId).toBe(current.activeSetlistId);
    expect(result.setlists).toEqual(current.setlists);
    expect(result.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toBe(
      source.songs[0]?.lyricVersions[0]?.tracks[0]?.text,
    );
  });

  it("requires an explicit confirmation for full replacement", async () => {
    const { current, source } = lyricProjects();
    vi.mocked(importProjectFile).mockResolvedValue(source);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const { container, onReplace } = renderTransfer(current);
    await chooseArchive(container);
    const replace = await screen.findByRole("button", { name: "import-replace-project" });
    await userEvent.click(replace);
    expect(onReplace).not.toHaveBeenCalled();
    await userEvent.click(replace);
    expect(onReplace.mock.calls[0]?.[0].id).toBe(source.id);
  });

  it("cancels a preview without changing the current project", async () => {
    const { current, source } = lyricProjects();
    vi.mocked(importProjectFile).mockResolvedValue(source);
    const { container, onReplace } = renderTransfer(current);
    await chooseArchive(container);
    await userEvent.click(await screen.findByRole("button", { name: "cancel" }));
    expect(screen.queryByRole("button", { name: "import-merge-lyrics" })).not.toBeInTheDocument();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("keeps the preview retryable when a required backup fails", async () => {
    const { current, source } = lyricProjects();
    vi.mocked(importProjectFile).mockResolvedValue(source);
    const { container, onReplace } = renderTransfer(
      current,
      vi.fn().mockRejectedValue(new Error("backup unavailable")),
    );
    await chooseArchive(container);
    await userEvent.click(await screen.findByRole("button", { name: "import-merge-lyrics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("import-failed");
    expect(screen.getByRole("button", { name: "import-merge-lyrics" })).toBeEnabled();
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("carries existing lyrics into the chosen preset", async () => {
    const { current: preset, source: current } = lyricProjects();
    vi.mocked(loadPreset).mockResolvedValue(preset);
    const { onReplace } = renderTransfer(current);
    await userEvent.click(screen.getByRole("button", { name: "New preset" }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledTimes(1));
    const result = onReplace.mock.calls[0]?.[0] as LyricBookProject;
    expect(result.activeSetlistId).toBe(preset.activeSetlistId);
    expect(result.songs[0]?.lyricVersions[0]?.tracks[0]?.text).toContain("Invented moonlight");
  });

  it("keeps the current project when a preset cannot safely match its lyrics", async () => {
    const { current: preset, source: current } = lyricProjects();
    requireValue(current.songs[0]).id = "old-song";
    const duplicate = structuredClone(requireValue(preset.songs[0]));
    duplicate.id = "same-title-different-song";
    preset.songs.push(duplicate);
    vi.mocked(loadPreset).mockResolvedValue(preset);
    const { onReplace } = renderTransfer(current);
    await userEvent.click(screen.getByRole("button", { name: "New preset" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("load-preset-ambiguous");
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New preset" })).toBeEnabled();
  });

  it("keeps the dialog open with a visible saving state until replacement completes", async () => {
    const { current, source } = lyricProjects();
    vi.mocked(importProjectFile).mockResolvedValue(source);
    let finish: () => void = () => undefined;
    const onReplace = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { container } = renderTransfer(current, onReplace);
    await chooseArchive(container);
    await userEvent.click(await screen.findByRole("button", { name: "import-merge-lyrics" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-dismissible", "false");
    expect(screen.getByRole("button", { name: "close" })).toBeDisabled();
    expect(screen.getByText("import-saving")).toHaveAttribute("role", "status");
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "close" })).toBeEnabled();
  });

  it("discards a file result that arrives after the dialog closes", async () => {
    const { current, source } = lyricProjects();
    let finish: (value: unknown) => void = () => undefined;
    vi.mocked(importProjectFile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { container, props, rerender, onReplace } = renderTransfer(current);
    await chooseArchive(container);
    rerender(<ImportExportDialog {...props} open={false} />);
    await act(async () => finish(source));
    rerender(<ImportExportDialog {...props} />);
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "import-merge-lyrics" })).not.toBeInTheDocument();
  });
});
