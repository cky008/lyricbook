import { createBlankProject } from "@domain/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openDBMock = vi.hoisted(() => vi.fn());

vi.mock("idb", () => ({ openDB: openDBMock }));

import {
  STORAGE_WARNING_EVENT,
  replaceStoredProject,
  type StorageWarningDetail,
  saveStoredProject,
} from "@app/lib/storage";

describe("project storage fallback", () => {
  beforeEach(() => {
    openDBMock.mockRejectedValue(new Error("IndexedDB unavailable"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the editable project when a cover exceeds localStorage quota", async () => {
    const project = createBlankProject("en-US");
    project.title = { en: "Edits that must survive" };
    project.preferences = {
      ...project.preferences,
      print: {
        coverMode: "image-with-text",
        coverImage: {
          dataUrl: `data:image/jpeg;base64,${"A".repeat(5_200_000)}`,
          mediaType: "image/jpeg",
          width: 2_480,
          height: 1_653,
          byteLength: 3_900_000,
        },
      },
    };
    const writes = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => writes.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (value.includes("data:image/jpeg")) {
          throw new DOMException("Storage quota exceeded", "QuotaExceededError");
        }
        writes.set(key, value);
      }),
      removeItem: vi.fn((key: string) => writes.delete(key)),
      clear: vi.fn(() => writes.clear()),
    });
    let warning: StorageWarningDetail | undefined;
    const onWarning = (event: Event) => {
      warning = (event as CustomEvent<StorageWarningDetail>).detail;
    };
    window.addEventListener(STORAGE_WARNING_EVENT, onWarning);

    try {
      await expect(saveStoredProject(project)).resolves.toBeUndefined();
    } finally {
      window.removeEventListener(STORAGE_WARNING_EVENT, onWarning);
    }

    const stored = JSON.parse(writes.get("lyricbook-current-project") ?? "null");
    expect(stored.title.en).toBe("Edits that must survive");
    expect(stored.preferences.print.coverImage).toBeUndefined();
    expect(stored.preferences.print.coverMode).toBe("generated");
    expect(warning).toMatchObject({
      code: "cover-omitted",
    });
    expect(warning?.message).toMatch(/saved without the local cover/i);
  });

  it("does not replace a project when its required backup cannot be created", async () => {
    const current = createBlankProject("en-US");
    const next = { ...createBlankProject("en-US"), title: { en: "Replacement" } };
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    await expect(replaceStoredProject(current, next, "Required backup")).rejects.toThrow(
      "IndexedDB unavailable",
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("still replaces a project after a successful backup when old-backup pruning fails", async () => {
    vi.resetModules();
    const database = {
      put: vi.fn().mockResolvedValue(undefined),
      getAllKeysFromIndex: vi.fn().mockRejectedValue(new Error("Pruning unavailable")),
      delete: vi.fn(),
    };
    openDBMock.mockResolvedValue(database);
    const { replaceStoredProject: replaceWithFreshDatabase } = await import("@app/lib/storage");
    const current = createBlankProject("en-US");
    const next = { ...createBlankProject("en-US"), title: { en: "Replacement" } };

    await expect(
      replaceWithFreshDatabase(current, next, "Successful required backup"),
    ).resolves.toBeUndefined();
    expect(database.put).toHaveBeenNthCalledWith(
      1,
      "backups",
      expect.objectContaining({ project: current, reason: "Successful required backup" }),
    );
    expect(database.put).toHaveBeenNthCalledWith(2, "state", next, "current");
  });
});
