import { createId } from "./ids";
import {
  SCHEMA_VERSION,
  type LyricBookProject,
  type Song,
  type Theme,
  type UiLocale,
} from "./types";

export const DEFAULT_THEME: Theme = {
  id: "default",
  name: { en: "Default Night", "zh-Hans": "默认星夜" },
  tokens: {
    accent: "#8f67ff",
    accent2: "#e05ca7",
    background: "#17132b",
    surface: "#25203a",
    surfaceStrong: "#30294b",
    text: "#f9f7ff",
    muted: "#bbb5cf",
    radius: "22px",
    density: 1,
    headingFont: "serif",
    bodyFont: "serif",
  },
  print: {
    accent: "#694e98",
    paper: "#fffdf8",
    text: "#18161a",
    headingStyle: "editorial",
  },
};

export function createBlankProject(locale: UiLocale = "en-US"): LyricBookProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId("project", locale === "zh-CN" ? "我的演唱会" : "my-concert"),
    title:
      locale === "zh-CN"
        ? { "zh-Hans": "我的演唱会歌词本", en: "My Concert LyricBook" }
        : { en: "My Concert LyricBook", "zh-Hans": "我的演唱会歌词本" },
    description: {
      en: "A private concert project stored in this browser.",
      "zh-Hans": "仅保存在当前浏览器中的私人演唱会项目。",
    },
    createdAt: now,
    updatedAt: now,
    revisionId: crypto.randomUUID(),
    songs: [],
    setlists: [
      {
        id: "main-setlist",
        title: { en: "Main setlist", "zh-Hans": "主歌单" },
        status: "draft",
        items: [],
      },
    ],
    themes: [structuredClone(DEFAULT_THEME)],
    activeSetlistId: "main-setlist",
    activeThemeId: "default",
    preferences: {
      uiLocale: locale,
      activeVersionBySong: {},
      favoriteSongIds: [],
      learnedSongIds: [],
    },
  };
}

export function createEmptySong(title: string, language = "en"): Song {
  const id = createId("song", title);
  return {
    id,
    titles: { [language]: title },
    aliases: [],
    tags: [],
    sourceRefs: [],
    lyricVersions: [
      {
        id: "default",
        label: { en: "Default", "zh-Hans": "默认版" },
        kind: "studio",
        isDefault: true,
        tracks: [
          {
            id: "original",
            language,
            role: "original",
            text: "",
          },
        ],
      },
    ],
  };
}

export function touchProject(project: LyricBookProject): LyricBookProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    parentRevisionId: project.revisionId,
    revisionId: crypto.randomUUID(),
  };
}
