import { createBlankProject, type LyricBookProject } from "@domain/index";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  loadStoredProject: vi.fn(),
  replaceStoredProject: vi.fn(),
  saveStoredProject: vi.fn(),
  backupProject: vi.fn(),
}));
vi.mock("@app/lib/storage", () => storage);
vi.mock("@app/lib/presets", () => ({ loadPreset: vi.fn(), loadPresetIndex: vi.fn() }));

import { useLyricBookProject } from "@app/hooks/useLyricBookProject";

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("project imports and queued local saves", () => {
  let persisted: LyricBookProject;

  beforeEach(() => {
    vi.resetAllMocks();
    persisted = createBlankProject("en-US");
    persisted.id = "original-project";
    storage.loadStoredProject.mockImplementation(async () => structuredClone(persisted));
    storage.saveStoredProject.mockImplementation(async (next: LyricBookProject) => {
      persisted = structuredClone(next);
    });
    storage.replaceStoredProject.mockImplementation(
      async (_current: LyricBookProject, next: LyricBookProject) => {
        persisted = structuredClone(next);
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function readyHook() {
    const hook = renderHook(() => useLyricBookProject("en-US"));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    vi.useFakeTimers();
    return hook;
  }

  it("cancels a pending autosave so a completed import remains the persisted project", async () => {
    const { result } = await readyHook();
    act(() =>
      result.current.updateProject((project) => ({ ...project, title: { en: "Unsaved title" } })),
    );
    const imported = { ...createBlankProject("en-US"), id: "imported-project" };
    await act(async () => result.current.replaceProject(imported, "Import synthetic lyrics"));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(persisted.id).toBe(imported.id);
    expect(result.current.project?.id).toBe(imported.id);
    expect(storage.replaceStoredProject).toHaveBeenCalledWith(
      expect.objectContaining({ title: { en: "Unsaved title" } }),
      imported,
      "Import synthetic lyrics",
    );
  });

  it("waits for an in-flight autosave before backing up and storing an import", async () => {
    const { result } = await readyHook();
    const saving = deferred();
    storage.saveStoredProject.mockImplementationOnce(async (next: LyricBookProject) => {
      await saving.promise;
      persisted = structuredClone(next);
    });
    act(() =>
      result.current.updateProject((project) => ({ ...project, title: { en: "Saving title" } })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(300));
    const imported = { ...createBlankProject("en-US"), id: "new-project" };
    let replacing: Promise<void> | undefined;
    act(() => {
      replacing = result.current.replaceProject(imported, "Import after save");
    });
    expect(storage.replaceStoredProject).not.toHaveBeenCalled();
    await act(async () => {
      saving.resolve();
      await replacing;
    });
    expect(persisted.id).toBe(imported.id);
    expect(result.current.project?.id).toBe(imported.id);
    expect(result.current.saving).toBe(false);
  });

  it("keeps unsaved edits and resumes their autosave if the required import backup fails", async () => {
    const { result } = await readyHook();
    act(() =>
      result.current.updateProject((project) => ({
        ...project,
        title: { en: "Keep these edits" },
      })),
    );
    storage.replaceStoredProject.mockRejectedValueOnce(new Error("Backup unavailable"));
    await act(async () => {
      await expect(
        result.current.replaceProject(createBlankProject("en-US"), "Failed import"),
      ).rejects.toThrow("Backup unavailable");
    });
    expect(result.current.project?.id).toBe("original-project");
    expect(result.current.project?.title.en).toBe("Keep these edits");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(persisted.id).toBe("original-project");
    expect(persisted.title.en).toBe("Keep these edits");
  });

  it("an older failed save cannot clear the pending status or error of a newer edit", async () => {
    const { result } = await readyHook();
    const saving = deferred();
    storage.saveStoredProject.mockImplementationOnce(() => saving.promise);
    act(() =>
      result.current.updateProject((project) => ({ ...project, title: { en: "First edit" } })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() =>
      result.current.updateProject((project) => ({ ...project, title: { en: "Latest edit" } })),
    );
    await act(async () => saving.reject(new Error("Old save failed")));
    expect(result.current.saving).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(persisted.title.en).toBe("Latest edit");
    expect(result.current.saving).toBe(false);
  });

  it("prevents editing the old project while an import is awaiting its required backup", async () => {
    const { result } = await readyHook();
    const backup = deferred();
    storage.replaceStoredProject.mockImplementationOnce(
      async (_current: LyricBookProject, next: LyricBookProject) => {
        await backup.promise;
        persisted = structuredClone(next);
      },
    );
    const imported = { ...createBlankProject("en-US"), id: "imported-after-backup" };
    let replacing: Promise<void> | undefined;
    await act(async () => {
      replacing = result.current.replaceProject(imported, "Import waiting for backup");
    });
    const editOldProject = vi.fn((project: LyricBookProject) => ({
      ...project,
      title: { en: "Stale edit during import" },
    }));
    act(() => result.current.updateProject(editOldProject));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => {
      backup.resolve();
      await replacing;
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(persisted.id).toBe(imported.id);
    expect(result.current.project?.id).toBe(imported.id);
    expect(editOldProject).not.toHaveBeenCalled();
    act(() =>
      result.current.updateProject((project) => ({
        ...project,
        title: { en: "Edit imported project" },
      })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(persisted.id).toBe(imported.id);
    expect(persisted.title.en).toBe("Edit imported project");
  });

  it("releases the replacement lock when the required backup fails", async () => {
    const { result } = await readyHook();
    const backup = deferred();
    storage.replaceStoredProject.mockImplementationOnce(() => backup.promise);
    let replacing: Promise<void> | undefined;
    await act(async () => {
      replacing = result.current.replaceProject(createBlankProject("en-US"), "Failed backup");
    });
    const staleEdit = vi.fn((project: LyricBookProject) => project);
    act(() => result.current.updateProject(staleEdit));
    expect(staleEdit).not.toHaveBeenCalled();
    await act(async () => {
      backup.reject(new Error("Backup unavailable"));
      await expect(replacing).rejects.toThrow("Backup unavailable");
    });
    act(() =>
      result.current.updateProject((project) => ({
        ...project,
        title: { en: "Editing restored" },
      })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(persisted.id).toBe("original-project");
    expect(persisted.title.en).toBe("Editing restored");
  });
});
