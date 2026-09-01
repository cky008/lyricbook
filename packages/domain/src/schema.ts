import { z } from "zod";
import { SCHEMA_VERSION, type LyricBookProject, type ValidationResult } from "./types";

const localizedTextSchema = z.record(z.string().min(1), z.string());

const lyricTrackSchema = z.object({
  id: z.string().min(1).optional(),
  language: z.string().min(1),
  role: z.enum(["original", "translation", "transliteration", "adaptation"]),
  text: z.string(),
  label: localizedTextSchema.optional(),
  alignedTo: z.string().min(1).optional(),
});

const lyricVersionSchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema,
  kind: z.string().min(1),
  isDefault: z.boolean(),
  note: z.string().optional(),
  tracks: z.array(lyricTrackSchema),
});

const songSchema = z.object({
  id: z.string().min(1),
  titles: localizedTextSchema,
  aliases: z.array(z.string()),
  tags: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  lyricVersions: z.array(lyricVersionSchema),
});

const setlistItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("song"),
    songId: z.string().min(1),
    optional: z.boolean().optional(),
    confidence: z.number().min(0).max(1).optional(),
    sourceRefs: z.array(z.string()).optional(),
    note: localizedTextSchema.optional(),
  }),
  z.object({
    type: z.literal("section"),
    id: z.string().min(1).optional(),
    label: localizedTextSchema,
    optional: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("note"),
    text: localizedTextSchema,
  }),
  z.object({
    type: z.literal("break"),
    label: localizedTextSchema.optional(),
  }),
]);

const setlistSchema = z.object({
  id: z.string().min(1),
  title: localizedTextSchema,
  status: z.string().min(1),
  date: z.string().optional(),
  venue: localizedTextSchema.optional(),
  notes: localizedTextSchema.optional(),
  items: z.array(setlistItemSchema),
});

const themeSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  tokens: z.object({
    accent: z.string().min(1),
    accent2: z.string().min(1).optional(),
    background: z.string().min(1),
    surface: z.string().min(1),
    surfaceStrong: z.string().min(1).optional(),
    text: z.string().min(1),
    muted: z.string().min(1).optional(),
    radius: z.string().min(1),
    density: z.number().positive().optional(),
    headingFont: z.enum(["serif", "sans"]).optional(),
    bodyFont: z.enum(["serif", "sans"]).optional(),
  }),
  print: z
    .object({
      accent: z.string().optional(),
      paper: z.string().optional(),
      text: z.string().optional(),
      headingStyle: z.enum(["editorial", "modern", "classic"]).optional(),
    })
    .optional(),
  assets: z
    .object({
      cover: z.string().optional(),
      background: z.string().optional(),
    })
    .optional(),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().optional(),
  url: z.string().url().optional(),
  retrievedAt: z.string().optional(),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  revisionId: z.string().optional(),
  parentRevisionId: z.string().optional(),
  songs: z.array(songSchema),
  setlists: z.array(setlistSchema),
  themes: z.array(themeSchema),
  sources: z.array(sourceSchema).optional(),
  activeSetlistId: z.string().optional(),
  activeThemeId: z.string().optional(),
  preferences: z
    .object({
      uiLocale: z.enum(["en-US", "zh-CN"]).optional(),
      lyricLanguages: z.array(z.string()).optional(),
      activeSongId: z.string().optional(),
      activeVersionBySong: z.record(z.string(), z.string()).optional(),
      favoriteSongIds: z.array(z.string()).optional(),
      learnedSongIds: z.array(z.string()).optional(),
      print: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateProject(input: unknown): ValidationResult {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const project = parsed.data;
  const issues: ValidationResult["issues"] = [];
  for (const id of duplicateValues(project.songs.map((song) => song.id))) {
    issues.push({ path: "songs", message: `Duplicate song id: ${id}` });
  }
  for (const id of duplicateValues(project.setlists.map((setlist) => setlist.id))) {
    issues.push({ path: "setlists", message: `Duplicate setlist id: ${id}` });
  }
  for (const id of duplicateValues(project.themes.map((theme) => theme.id))) {
    issues.push({ path: "themes", message: `Duplicate theme id: ${id}` });
  }
  for (const id of duplicateValues((project.sources ?? []).map((source) => source.id))) {
    issues.push({ path: "sources", message: `Duplicate source id: ${id}` });
  }
  const songIds = new Set(project.songs.map((song) => song.id));
  const sourceIds = new Set((project.sources ?? []).map((source) => source.id));
  for (const [setlistIndex, setlist] of project.setlists.entries()) {
    for (const [itemIndex, item] of setlist.items.entries()) {
      if (item.type === "song" && !songIds.has(item.songId)) {
        issues.push({
          path: `setlists.${setlistIndex}.items.${itemIndex}.songId`,
          message: `Missing song reference: ${item.songId}`,
        });
      }
      if (item.type === "song") {
        for (const sourceRef of item.sourceRefs ?? []) {
          if (!sourceIds.has(sourceRef)) {
            issues.push({
              path: `setlists.${setlistIndex}.items.${itemIndex}.sourceRefs`,
              message: `Missing source reference: ${sourceRef}`,
            });
          }
        }
      }
    }
  }
  for (const [songIndex, song] of project.songs.entries()) {
    const defaults = song.lyricVersions.filter((version) => version.isDefault);
    if (defaults.length > 1) {
      issues.push({
        path: `songs.${songIndex}.lyricVersions`,
        message: `Song ${song.id} has more than one default lyric version`,
      });
    }
    for (const sourceRef of song.sourceRefs) {
      if (!sourceIds.has(sourceRef)) {
        issues.push({
          path: `songs.${songIndex}.sourceRefs`,
          message: `Missing source reference: ${sourceRef}`,
        });
      }
    }
  }
  if (
    project.activeSetlistId &&
    !project.setlists.some((item) => item.id === project.activeSetlistId)
  ) {
    issues.push({ path: "activeSetlistId", message: "Active setlist does not exist" });
  }
  if (project.activeThemeId && !project.themes.some((item) => item.id === project.activeThemeId)) {
    issues.push({ path: "activeThemeId", message: "Active theme does not exist" });
  }
  return { ok: issues.length === 0, issues };
}

export function parseProject(input: unknown): LyricBookProject {
  const parsed = projectSchema.parse(input);
  const validation = validateProject(parsed);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return parsed as LyricBookProject;
}
