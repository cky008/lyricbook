import { PrintDocument } from "@app/components/PrintDocument";
import { derivePrintPalette, THEME_FONT_STACKS } from "@app/lib/appearance";
import type { Theme } from "@domain/index";
import type { PrintPlan } from "@print/index";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const unsafePrintTheme: Theme = {
  id: "unsafe-print",
  name: { en: "Unsafe print" },
  tokens: {
    accent: "oklch(62% 0.18 30)",
    accent2: "color(display-p3 0.18 0.64 0.32)",
    background: "#17132b",
    surface: "#25203a",
    surfaceStrong: "#30294b",
    text: "#f9f7ff",
    muted: "#bbb5cf",
    radius: "22px",
    density: 1,
    headingFont: "serif",
    bodyFont: "sans",
  },
  print: {
    accent: "rgba(255 255 255 / 0%)",
    paper: "oklch(96% 0.025 85 / 40%)",
    text: "color(display-p3 1 1 1 / 0)",
    headingStyle: "classic",
  },
};

function printPlan(theme: Theme): PrintPlan {
  return {
    format: "a4",
    pages: [
      {
        kind: "info",
        id: "info",
        title: "Local print proof",
        body: "Invented test copy",
      },
    ],
    bookletSheets: [],
    paddedPageCount: 1,
    songCount: 0,
    theme,
  };
}

afterEach(cleanup);

describe("PrintDocument theme safety", () => {
  it("uses the derived opaque print palette and fixed local font stacks", () => {
    const expected = derivePrintPalette(unsafePrintTheme);
    const { container } = render(<PrintDocument plan={printPlan(unsafePrintTheme)} />);
    const document = container.querySelector<HTMLElement>("[data-print-document]");

    expect(document).not.toBeNull();
    expect(document?.style.getPropertyValue("--print-paper")).toBe(expected.paper);
    expect(document?.style.getPropertyValue("--print-text")).toBe(expected.text);
    expect(document?.style.getPropertyValue("--print-accent")).toBe(expected.accent);
    expect(document?.style.getPropertyValue("--print-muted")).toBe(expected.muted);
    expect(document?.style.getPropertyValue("--print-heading-font")).toBe(THEME_FONT_STACKS.serif);
    expect(document?.style.getPropertyValue("--print-body-font")).toBe(THEME_FONT_STACKS.sans);
    expect(document?.getAttribute("style")).not.toMatch(/rgba?\(|oklch\(|color\(|url\(/i);
  });

  it("renders generated covers as three explicit, measurable regions", () => {
    const plan: PrintPlan = {
      ...printPlan(unsafePrintTheme),
      format: "booklet",
      pages: [
        {
          kind: "cover",
          id: "cover",
          kicker: "CONCERT LYRICBOOK",
          title: "A deliberately descriptive local concert notebook",
          subtitle: "Invented cover copy used for structural verification.",
          setlistTitle: "Synthetic setlist",
          songCountLabel: "12 songs",
          mode: "generated",
        },
        { kind: "blank", id: "blank-2" },
        { kind: "blank", id: "blank-3" },
        { kind: "blank", id: "blank-4" },
      ],
      paddedPageCount: 4,
      bookletSheets: [{ index: 0, front: [4, 1], back: [2, 3] }],
    };

    const { container } = render(<PrintDocument plan={plan} />);
    const frame = container.querySelector(".print-cover-frame");

    expect(frame).not.toBeNull();
    expect(frame?.children).toHaveLength(3);
    expect(frame?.children[0]).toHaveClass("print-cover-header");
    expect(frame?.children[1]).toHaveClass("print-cover-copy");
    expect(frame?.children[2]).toHaveClass("print-cover-details");
  });

  it("keeps optional contents badges inside measured section and title regions", () => {
    const plan: PrintPlan = {
      ...printPlan(unsafePrintTheme),
      pages: [
        {
          kind: "toc",
          id: "toc",
          title: "Setlist contents",
          sections: [
            {
              label: "Rotation",
              optional: true,
              optionalLabel: "Optional",
              entries: [
                {
                  songId: "optional-song",
                  title: "Invented optional song",
                  sequence: 1,
                  pageNumber: 2,
                  section: "Rotation",
                  optional: true,
                  optionalLabel: "Optional",
                },
              ],
            },
          ],
          columns: 1,
          density: "relaxed",
          columnSections: [
            [
              {
                label: "Rotation",
                optional: true,
                optionalLabel: "Optional",
                entries: [
                  {
                    songId: "optional-song",
                    title: "Invented optional song",
                    sequence: 1,
                    pageNumber: 2,
                    section: "Rotation",
                    optional: true,
                    optionalLabel: "Optional",
                  },
                ],
              },
            ],
          ],
          pageInToc: 1,
          pageCountForToc: 1,
          continuation: false,
        },
      ],
    };

    const { container } = render(<PrintDocument plan={plan} />);
    const section = container.querySelector(".print-toc-section");
    const entry = container.querySelector<HTMLAnchorElement>(".print-toc-entry");

    expect(section?.querySelector('[data-toc-optional="section"]')).toHaveTextContent("Optional");
    expect(entry?.querySelector('[data-toc-optional="entry"]')).toHaveTextContent("Optional");
    expect(entry?.getAttribute("href")).toBe("#print-song-optional-song");
    expect(entry?.lastElementChild).toHaveTextContent("2");
  });
});
