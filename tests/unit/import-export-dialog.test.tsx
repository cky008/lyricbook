import { ImportExportDialog } from "@app/features/ImportExportDialog";
import { createBlankProject } from "@domain/index";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/DialogShell", () => ({
  DialogShell: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <div aria-label={title} role="dialog">
        {children}
      </div>
    ) : null,
}));

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
