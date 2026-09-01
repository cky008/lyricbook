import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LyricBookProject } from "@domain/index";

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
    const fallback = localStorage.getItem("lyricbook-current-project");
    return fallback ? (JSON.parse(fallback) as LyricBookProject) : undefined;
  }
}

export async function saveStoredProject(project: LyricBookProject): Promise<void> {
  try {
    await (await database()).put("state", project, "current");
  } catch (error) {
    console.error("IndexedDB save failed, using localStorage fallback", error);
    localStorage.setItem("lyricbook-current-project", JSON.stringify(project));
  }
}

export async function backupProject(project: LyricBookProject, reason: string): Promise<string> {
  const createdAt = new Date().toISOString();
  const id = `${createdAt}_${crypto.randomUUID()}`;
  try {
    await (await database()).put("backups", {
      id,
      createdAt,
      reason,
      project: structuredClone(project),
    });
    const db = await database();
    const keys = await db.getAllKeysFromIndex("backups", "by-createdAt");
    if (keys.length > 20) {
      await Promise.all(keys.slice(0, keys.length - 20).map((key) => db.delete("backups", key)));
    }
  } catch (error) {
    console.error("Could not create IndexedDB backup", error);
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
