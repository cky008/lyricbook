import { expect, type Page } from "@playwright/test";

export interface SyntheticTrack {
  id: string;
  language: string;
  role: "original" | "translation" | "transliteration" | "adaptation";
  text: string;
  label?: Record<string, string>;
  alignedTo?: string;
}

export interface SyntheticSong {
  id: string;
  titles: Record<string, string>;
  aliases: string[];
  tags: string[];
  sourceRefs: string[];
  lyricVersions: Array<{
    id: string;
    label: Record<string, string>;
    kind: string;
    isDefault: boolean;
    tracks: SyntheticTrack[];
  }>;
}

interface SyntheticProjectOptions {
  songs: SyntheticSong[];
  sectionSize?: number;
}

const SYNTHETIC_THEME = {
  id: "synthetic-print-theme",
  name: { en: "Synthetic print theme", "zh-Hans": "合成打印主题" },
  tokens: {
    accent: "#6a4c93",
    background: "#15131a",
    surface: "#24202c",
    text: "#f8f5fb",
    radius: "18px",
    headingFont: "serif" as const,
    bodyFont: "serif" as const,
  },
  print: {
    accent: "#6a4c93",
    paper: "#fffdf8",
    text: "#18161a",
    headingStyle: "editorial" as const,
  },
};

export function numberedLines(prefix: string, count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `${prefix}-${String(index + 1).padStart(3, "0")} invented lanterns cross a quiet paper sky`,
  ).join("\n");
}

export function syntheticSong(
  id: string,
  title: string,
  text: string,
  tracks?: SyntheticTrack[],
): SyntheticSong {
  return {
    id,
    titles: { en: title, "zh-Hans": title },
    aliases: [],
    tags: ["synthetic-fixture"],
    sourceRefs: [],
    lyricVersions: [
      {
        id: "default",
        label: { en: "Default", "zh-Hans": "默认版" },
        kind: "synthetic",
        isDefault: true,
        tracks: tracks ?? [
          {
            id: "original",
            language: "en",
            role: "original",
            text,
            label: { en: "Original", "zh-Hans": "原文" },
          },
        ],
      },
    ],
  };
}

export function syntheticProject({ songs, sectionSize = songs.length }: SyntheticProjectOptions) {
  const setlistItems: Array<Record<string, unknown>> = [];
  songs.forEach((song, index) => {
    if (index % sectionSize === 0) {
      const section = Math.floor(index / sectionSize) + 1;
      setlistItems.push({
        type: "section",
        id: `section-${section}`,
        label: {
          en: `Synthetic section ${section} with a deliberately descriptive heading`,
          "zh-Hans": `合成章节 ${section}`,
        },
      });
    }
    setlistItems.push({ type: "song", songId: song.id });
  });

  return {
    schemaVersion: 1 as const,
    id: "synthetic-print-regression",
    title: { en: "Synthetic Print Regression", "zh-Hans": "合成打印回归" },
    description: {
      en: "Invented content used only to verify printable layout.",
      "zh-Hans": "仅用于验证打印排版的合成内容。",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revisionId: "synthetic-print-revision",
    songs,
    setlists: [
      {
        id: "synthetic-setlist",
        title: { en: "Synthetic setlist", "zh-Hans": "合成歌单" },
        status: "draft",
        items: setlistItems,
      },
    ],
    themes: [SYNTHETIC_THEME],
    sources: [],
    activeSetlistId: "synthetic-setlist",
    activeThemeId: SYNTHETIC_THEME.id,
    preferences: {
      uiLocale: "en-US" as const,
      activeSongId: songs[0]?.id,
      activeVersionBySong: {},
      favoriteSongIds: [],
      learnedSongIds: [],
    },
  };
}

export async function seedSyntheticProject(
  page: Page,
  project: ReturnType<typeof syntheticProject>,
): Promise<void> {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();

  // A fresh project selects its first song after mount and persists that preference on a debounce.
  // Let that initial write finish so it cannot race with the synthetic IndexedDB replacement below.
  const saveStatus = page.locator(".status-line");
  await expect(saveStatus).toContainText(/Saving|正在保存/i);
  await expect(saveStatus).toContainText(/Saved locally|已保存到本机/i);

  await page.evaluate(async (nextProject) => {
    localStorage.setItem("lyricbook-ui-locale", "en-US");
    localStorage.setItem("lyricbook-current-project", JSON.stringify(nextProject));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lyricbook", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("state")) database.createObjectStore("state");
        if (!database.objectStoreNames.contains("backups")) {
          const backups = database.createObjectStore("backups", { keyPath: "id" });
          backups.createIndex("by-createdAt", "createdAt");
        }
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to open test database"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("state", "readwrite");
        transaction.objectStore("state").put(nextProject, "current");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Unable to seed test project"));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, project);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("header.app-header .brand-title")).toHaveText(
    "Synthetic Print Regression",
  );
}
