import { SetlistDialog } from "@app/features/SetlistDialog";
import { createBlankProject, createEmptySong, type LyricBookProject } from "@domain/index";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/DialogShell", () => ({
  DialogShell: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <div aria-label={title} role="dialog">
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@app/lib/i18n", () => {
  const messages: Record<string, string> = {
    "active-setlist": "Active setlist",
    "add-note": "Add note",
    "add-section": "Add section",
    "add-song": "Add song",
    "apply-markdown": "Apply Markdown",
    "discard-markdown-confirm": "Discard unapplied Markdown?",
    "markdown-applied": "Markdown applied",
    "markdown-editor": "Markdown",
    "markdown-help": "Edit the setlist as Markdown.",
    "markdown-unsaved": "Unapplied changes",
    "move-down": "Move down",
    "move-up": "Move up",
    "new-setlist": "New setlist",
    optional: "Optional",
    "reset-markdown": "Reset Markdown",
    "select-song": "Select song",
    "setlist-description": "Edit the active setlist.",
    "setlist-editor": "Setlist editor",
    "setlist-editor-mode": "Setlist editor mode",
    "setlist-markdown": "Setlist Markdown",
    "setlist-title": "Setlist title",
    "structured-editor": "Structured",
  };
  return {
    useI18n: () => ({
      t: (id: string, args?: Record<string, unknown>) => {
        if (id === "markdown-applied-new-songs") return `${String(args?.count)} new song added`;
        return messages[id] ?? id;
      },
    }),
  };
});

function fixtureProject(): LyricBookProject {
  const project = createBlankProject("en-US");
  const known = createEmptySong("Known Song");
  known.id = "known-song";
  project.songs = [known];
  const main = project.setlists[0];
  if (!main) throw new Error("Expected the default setlist");
  main.title = { en: "Main setlist" };
  main.items = [
    { type: "section", id: "act-one", label: { en: "Act One" } },
    { type: "song", songId: known.id },
  ];
  project.setlists.push({
    id: "second-setlist",
    title: { en: "Second setlist" },
    status: "draft",
    items: [{ type: "note", text: { en: "Leave this untouched" } }],
  });
  return project;
}

function renderDialog(project = fixtureProject()) {
  const onChange = vi.fn<(project: LyricBookProject) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(
    <SetlistDialog
      open
      onOpenChange={onOpenChange}
      project={project}
      locale="en-US"
      onChange={onChange}
    />,
  );
  return { ...view, onChange, onOpenChange, project };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SetlistDialog Markdown mode", () => {
  it("switches from the structured editor and applies Markdown atomically", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog();

    expect(screen.getByRole("button", { name: "Add song" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Markdown" }));

    const editor = await screen.findByRole("textbox", { name: "Setlist Markdown" });
    expect((editor as HTMLTextAreaElement).value).toContain("## Act One");
    expect((editor as HTMLTextAreaElement).value).toContain("- Known Song");
    expect(screen.queryByRole("button", { name: "Add song" })).not.toBeInTheDocument();

    fireEvent.change(editor, {
      target: { value: "## Updated act\n- Known Song\n- Brand New Song" },
    });
    await user.click(screen.getByRole("button", { name: "Apply Markdown" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0];
    expect(next?.songs.map((song) => song.titles.en)).toEqual(["Known Song", "Brand New Song"]);
    expect(next?.setlists.find((setlist) => setlist.id === "second-setlist")?.items).toEqual([
      { type: "note", text: { en: "Leave this untouched" } },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("1 new song added");
    expect(screen.getByRole("button", { name: "Apply Markdown" })).toBeDisabled();
  });

  it("does not lose a dirty draft when changing editor mode or closing", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("tab", { name: "Markdown" }));
    const editor = await screen.findByRole("textbox", { name: "Setlist Markdown" });
    fireEvent.change(editor, { target: { value: "- Unapplied draft" } });

    await user.click(screen.getByRole("tab", { name: "Structured" }));
    expect(confirm).toHaveBeenCalledWith("Discard unapplied Markdown?");
    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute("aria-selected", "true");
    expect(editor).toHaveValue("- Unapplied draft");

    await user.click(screen.getByRole("button", { name: "close" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(editor).toHaveValue("- Unapplied draft");

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports an apply error without changing the project or clearing the draft", async () => {
    const user = userEvent.setup();
    const project = fixtureProject();
    const duplicate = createEmptySong("Known Song");
    duplicate.id = "duplicate-known-song";
    project.songs.push(duplicate);
    const { onChange } = renderDialog(project);

    await user.click(screen.getByRole("tab", { name: "Markdown" }));
    const editor = await screen.findByRole("textbox", { name: "Setlist Markdown" });
    fireEvent.change(editor, { target: { value: "- Known Song" } });
    await user.click(screen.getByRole("button", { name: "Apply Markdown" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Ambiguous song title: Known Song");
    expect(editor).toHaveValue("- Known Song");
    expect(screen.getByRole("button", { name: "Apply Markdown" })).toBeEnabled();
  });

  it("guards active-setlist changes and can explicitly reset the draft", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onChange, project } = renderDialog();

    await user.click(screen.getByRole("tab", { name: "Markdown" }));
    const editor = await screen.findByRole("textbox", { name: "Setlist Markdown" });
    fireEvent.change(editor, { target: { value: "- Keep this draft" } });
    const activeSetlist = screen.getByRole("combobox", { name: "Active setlist" });
    fireEvent.change(activeSetlist, { target: { value: "second-setlist" } });

    expect(confirm).toHaveBeenCalledWith("Discard unapplied Markdown?");
    expect(onChange).not.toHaveBeenCalled();
    expect(editor).toHaveValue("- Keep this draft");
    expect(activeSetlist).toHaveValue(project.activeSetlistId);

    await user.click(screen.getByRole("button", { name: "Reset Markdown" }));
    expect((editor as HTMLTextAreaElement).value).toContain("## Act One");
    expect(screen.getByRole("button", { name: "Reset Markdown" })).toBeDisabled();

    fireEvent.change(editor, { target: { value: "- Discard before switching" } });
    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Active setlist" }), {
      target: { value: "second-setlist" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...project, activeSetlistId: "second-setlist" });
  });
});
