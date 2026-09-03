import {
  createBlankProject,
  getBuiltInTheme,
  type LyricBookProject,
  type Theme,
} from "@domain/index";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  loadStoredProject: vi.fn(),
  replaceStoredProject: vi.fn(),
  saveStoredProject: vi.fn(),
  backupProject: vi.fn(),
}));

const presetMocks = vi.hoisted(() => ({
  loadPreset: vi.fn(),
  loadPresetIndex: vi.fn(),
}));

vi.mock("@app/lib/storage", () => storageMocks);
vi.mock("@app/lib/presets", () => presetMocks);

import { useLyricBookProject } from "@app/hooks/useLyricBookProject";

const PUBLISHED_GLORIA: Theme = {
  id: "gloria",
  name: { "zh-Hans": "GLORIA 紫粉星光", en: "GLORIA Violet Starlight" },
  tokens: {
    accent: "#d66cff",
    background: "#120c1c",
    surface: "#24152e",
    text: "#fbf6ff",
    radius: "24px",
  },
};

function storedProject(theme: Theme): LyricBookProject {
  return {
    ...createBlankProject("en-US"),
    themes: [structuredClone(theme)],
    activeThemeId: theme.id,
  };
}

describe("useLyricBookProject legacy theme persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.replaceStoredProject.mockResolvedValue(undefined);
    storageMocks.saveStoredProject.mockResolvedValue(undefined);
    presetMocks.loadPresetIndex.mockResolvedValue([]);
  });

  it("backs up and writes a parsed legacy-theme migration before exposing the stored project", async () => {
    const stored = storedProject(PUBLISHED_GLORIA);
    const snapshot = structuredClone(stored);
    storageMocks.loadStoredProject.mockResolvedValue(stored);

    const { result } = renderHook(() => useLyricBookProject("en-US"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const studioSlate = getBuiltInTheme("builtin-studio-slate");
    expect(result.current.project?.activeThemeId).toBe("builtin-studio-slate");
    expect(result.current.project?.themes).toEqual([studioSlate]);
    expect(storageMocks.replaceStoredProject).toHaveBeenCalledTimes(1);
    expect(storageMocks.replaceStoredProject).toHaveBeenCalledWith(
      stored,
      expect.objectContaining({
        activeThemeId: "builtin-studio-slate",
        themes: [studioSlate],
      }),
      "Migrate published themes to the built-in collection",
    );
    expect(storageMocks.saveStoredProject).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
  });

  it("does not rewrite a user-modified legacy-id theme", async () => {
    const customized: Theme = {
      ...structuredClone(PUBLISHED_GLORIA),
      tokens: { ...PUBLISHED_GLORIA.tokens, accent: "#123456" },
    };
    const stored = storedProject(customized);
    storageMocks.loadStoredProject.mockResolvedValue(stored);

    const { result } = renderHook(() => useLyricBookProject("en-US"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.project?.activeThemeId).toBe("gloria");
    expect(result.current.project?.themes).toHaveLength(1);
    expect(result.current.project?.themes[0]).toMatchObject({
      id: "gloria",
      name: PUBLISHED_GLORIA.name,
      tokens: { accent: "#123456" },
    });
    expect(storageMocks.replaceStoredProject).not.toHaveBeenCalled();
    expect(storageMocks.saveStoredProject).not.toHaveBeenCalled();
  });

  it("keeps the validated legacy project until a migration backup can be persisted", async () => {
    const stored = storedProject(PUBLISHED_GLORIA);
    storageMocks.loadStoredProject.mockResolvedValue(stored);
    storageMocks.replaceStoredProject.mockRejectedValue(new Error("Migration write failed"));

    const { result } = renderHook(() => useLyricBookProject("en-US"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.project?.activeThemeId).toBe("gloria");
    expect(result.current.error).toBe("Migration write failed");
    expect(storageMocks.replaceStoredProject).toHaveBeenCalledTimes(1);

    result.current.updateProject((project) => ({
      ...project,
      description: { en: "Edit after a failed migration" },
    }));
    await waitFor(() => expect(storageMocks.saveStoredProject).toHaveBeenCalledTimes(1));
    expect(storageMocks.saveStoredProject).toHaveBeenCalledWith(
      expect.objectContaining({
        activeThemeId: "gloria",
        description: { en: "Edit after a failed migration" },
      }),
    );
  });
});
