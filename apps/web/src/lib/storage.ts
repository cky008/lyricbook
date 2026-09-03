import type { LyricBookProject } from "@domain/index";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export const STORAGE_WARNING_EVENT = "lyricbook-storage-warning";

export interface StorageWarningDetail {
  code: "cover-omitted";
  message: string;
}

const CURRENT_PROJECT_KEY = "lyricbook-current-project";

interface LyricBookDatabase extends DBSchema {
  state: {
    key: string;
    value: LyricBookProject;
  };
  backups: {
    key: string;
    value: {
      id: string;
      createdAt: string;
      reason: string;
      project: LyricBookProject;
    };
    indexes: { "by-createdAt": string };
  };
}

let databasePromise: Promise<IDBPDatabase<LyricBookDatabase>> | undefined;

function database(): Promise<IDBPDatabase<LyricBookDatabase>> {
  databasePromise ??= openDB<LyricBookDatabase>("lyricbook", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("backups")) {
        const store = db.createObjectStore("backups", { keyPath: "id" });
        store.createIndex("by-createdAt", "createdAt");
      }
    },
  });
  return databasePromise;
}

export async function loadStoredProject(): Promise<LyricBookProject | undefined> {
  try {
    return await (await database()).get("state", "current");
  } catch (error) {
    console.error("IndexedDB load failed", error);
    const fallback = localStorage.getItem(CURRENT_PROJECT_KEY);
    return fallback ? (JSON.parse(fallback) as LyricBookProject) : undefined;
  }
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  );
}

function withoutLocalCover(project: LyricBookProject): LyricBookProject | undefined {
  const print = project.preferences?.print;
  if (!print?.coverImage) return undefined;
  const fallbackPrint = { ...print, coverMode: "generated" as const };
  delete fallbackPrint.coverImage;
  return {
    ...project,
    preferences: {
      ...project.preferences,
      print: fallbackPrint,
    },
  };
}

function notifyStorageWarning(detail: StorageWarningDetail): void {
  console.warn(detail.message);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StorageWarningDetail>(STORAGE_WARNING_EVENT, { detail }));
}

export async function saveStoredProject(project: LyricBookProject): Promise<void> {
  try {
    await (await database()).put("state", project, "current");
  } catch (error) {
    console.error("IndexedDB save failed, using localStorage fallback", error);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project));
    } catch (fallbackError) {
      const projectWithoutCover = isQuotaExceeded(fallbackError)
        ? withoutLocalCover(project)
        : undefined;
      if (!projectWithoutCover) throw fallbackError;
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(projectWithoutCover));
      notifyStorageWarning({
        code: "cover-omitted",
        message:
          "The project was saved without the local cover because browser fallback storage is full. Keep IndexedDB enabled or export the project before reloading to retain the cover.",
      });
    }
  }
}

export async function backupProject(project: LyricBookProject, reason: string): Promise<string> {
  const createdAt = new Date().toISOString();
  const id = `${createdAt}_${crypto.randomUUID()}`;
  const db = await database();
  try {
    await db.put("backups", {
      id,
      createdAt,
      reason,
      project: structuredClone(project),
    });
  } catch (error) {
    console.error("Could not create IndexedDB backup", error);
    throw error;
  }

  try {
    const keys = await db.getAllKeysFromIndex("backups", "by-createdAt");
    if (keys.length > 20) {
      await Promise.all(keys.slice(0, keys.length - 20).map((key) => db.delete("backups", key)));
    }
  } catch (error) {
    console.error("Could not prune old IndexedDB backups", error);
  }
  return id;
}

export async function replaceStoredProject(
  current: LyricBookProject,
  next: LyricBookProject,
  reason: string,
): Promise<void> {
  await backupProject(current, reason);
  await saveStoredProject(next);
}
