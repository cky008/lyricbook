import { z } from "zod";
import { sanitizeStandaloneTheme, sanitizeTheme } from "./theme";
import {
  type LocalCoverImage,
  type LyricBookProject,
  SCHEMA_VERSION,
  type Theme,
  type ValidationResult,
} from "./types";

export const LOCAL_COVER_MAX_BYTES = 4_000_000;
export const LOCAL_COVER_MAX_EDGE = 4_096;
export const LOCAL_COVER_MAX_PIXELS = 40_000_000;

export interface RasterImageInfo {
  mediaType: LocalCoverImage["mediaType"];
  width: number;
  height: number;
}

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

const themeSchema = z
  .object({
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
    style: z
      .object({
        surface: z.enum(["solid", "glass"]),
        elevation: z.enum(["flat", "soft"]),
        ornament: z.enum(["none", "ink-wash", "porcelain-line"]),
      })
      .optional(),
    assets: z
      .object({
        cover: z.string().optional(),
        background: z.string().optional(),
      })
      .optional(),
  })
  .transform((theme) => sanitizeTheme(theme as Theme));

export function parseTheme(input: unknown): Theme {
  return sanitizeStandaloneTheme(themeSchema.parse(input));
}

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

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sniffRasterImageType(bytes: Uint8Array): LocalCoverImage["mediaType"] | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return undefined;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validDimensions(
  mediaType: LocalCoverImage["mediaType"],
  width: number,
  height: number,
): RasterImageInfo | undefined {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { mediaType, width, height }
    : undefined;
}

function inspectPng(bytes: Uint8Array): RasterImageInfo | undefined {
  if (
    bytes.byteLength < 24 ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    !startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)
  ) {
    return undefined;
  }
  return validDimensions(
    "image/png",
    readUint32BigEndian(bytes, 16),
    readUint32BigEndian(bytes, 20),
  );
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function inspectJpeg(bytes: Uint8Array): RasterImageInfo | undefined {
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return undefined;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00 || marker === 0xd9 || marker === 0xda) {
      return undefined;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) return undefined;
    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return undefined;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return undefined;
      return validDimensions(
        "image/jpeg",
        readUint16BigEndian(bytes, offset + 5),
        readUint16BigEndian(bytes, offset + 3),
      );
    }
    offset += segmentLength;
  }
  return undefined;
}

function inspectWebp(bytes: Uint8Array): RasterImageInfo | undefined {
  if (bytes.byteLength < 20 || readUint32LittleEndian(bytes, 4) + 8 > bytes.byteLength) {
    return undefined;
  }
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkSize;
    if (dataEnd > bytes.byteLength) return undefined;

    if (startsWith(bytes, [0x56, 0x50, 0x38, 0x58], offset) && chunkSize >= 10) {
      return validDimensions(
        "image/webp",
        readUint24LittleEndian(bytes, dataOffset + 4) + 1,
        readUint24LittleEndian(bytes, dataOffset + 7) + 1,
      );
    }
    if (
      startsWith(bytes, [0x56, 0x50, 0x38, 0x20], offset) &&
      chunkSize >= 10 &&
      startsWith(bytes, [0x9d, 0x01, 0x2a], dataOffset + 3)
    ) {
      return validDimensions(
        "image/webp",
        readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
        readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
      );
    }
    if (
      startsWith(bytes, [0x56, 0x50, 0x38, 0x4c], offset) &&
      chunkSize >= 5 &&
      bytes[dataOffset] === 0x2f
    ) {
      const first = bytes[dataOffset + 1] ?? 0;
      const second = bytes[dataOffset + 2] ?? 0;
      const third = bytes[dataOffset + 3] ?? 0;
      const fourth = bytes[dataOffset + 4] ?? 0;
      return validDimensions(
        "image/webp",
        1 + first + ((second & 0x3f) << 8),
        1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
      );
    }
    offset = dataEnd + (chunkSize % 2);
  }
  return undefined;
}

/** Read trusted dimensions from raster container headers without decoding pixels. */
export function inspectRasterImage(bytes: Uint8Array): RasterImageInfo | undefined {
  const mediaType = sniffRasterImageType(bytes);
  if (mediaType === "image/png") return inspectPng(bytes);
  if (mediaType === "image/jpeg") return inspectJpeg(bytes);
  if (mediaType === "image/webp") return inspectWebp(bytes);
  return undefined;
}

function base64Value(characterCode: number): number {
  if (characterCode >= 0x41 && characterCode <= 0x5a) return characterCode - 0x41;
  if (characterCode >= 0x61 && characterCode <= 0x7a) return characterCode - 0x61 + 26;
  if (characterCode >= 0x30 && characterCode <= 0x39) return characterCode - 0x30 + 52;
  if (characterCode === 0x2b) return 62;
  if (characterCode === 0x2f) return 63;
  return -1;
}

function decodeBase64(value: string): Uint8Array | undefined {
  let padding = 0;
  while (value.endsWith("=".repeat(padding + 1))) padding += 1;
  if (padding > 2) return undefined;
  const contentLength = value.length - padding;
  const remainder = contentLength % 4;
  if (!contentLength || remainder === 1) return undefined;
  if (padding && (value.length % 4 !== 0 || padding !== 4 - remainder)) return undefined;
  const decodedLength = Math.floor((contentLength * 6) / 8);
  if (decodedLength > LOCAL_COVER_MAX_BYTES) return undefined;

  const bytes = new Uint8Array(decodedLength);
  let accumulator = 0;
  let bitCount = 0;
  let outputIndex = 0;
  for (let index = 0; index < contentLength; index += 1) {
    const digit = base64Value(value.charCodeAt(index));
    if (digit < 0) return undefined;
    accumulator = (accumulator << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outputIndex] = (accumulator >> bitCount) & 0xff;
      outputIndex += 1;
      accumulator &= bitCount ? (1 << bitCount) - 1 : 0;
    }
  }
  return outputIndex === decodedLength && accumulator === 0 ? bytes : undefined;
}

function decodeRasterDataUrl(
  dataUrl: string,
): { declaredMediaType: LocalCoverImage["mediaType"]; bytes: Uint8Array } | undefined {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return undefined;
  const bytes = decodeBase64(match[2]);
  if (!bytes) return undefined;
  return {
    declaredMediaType: match[1].toLowerCase() as LocalCoverImage["mediaType"],
    bytes,
  };
}

function exceedsPixelLimit(width: number, height: number): boolean {
  return height > 0 && width > Math.floor(LOCAL_COVER_MAX_PIXELS / height);
}

const localCoverImageSchema = z
  .object({
    dataUrl: z.string().max(6_000_000),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width: z.number().int().positive().max(LOCAL_COVER_MAX_EDGE),
    height: z.number().int().positive().max(LOCAL_COVER_MAX_EDGE),
    byteLength: z.number().int().positive().max(LOCAL_COVER_MAX_BYTES),
  })
  .superRefine((image, context) => {
    const decoded = decodeRasterDataUrl(image.dataUrl);
    if (!decoded) {
      context.addIssue({
        code: "custom",
        path: ["dataUrl"],
        message: "Cover data must contain a recognized raster image data URL",
      });
      return;
    }
    if (decoded.declaredMediaType !== image.mediaType) {
      context.addIssue({
        code: "custom",
        path: ["mediaType"],
        message: "Cover media type does not match its data URL",
      });
    }
    if (decoded.bytes.byteLength !== image.byteLength) {
      context.addIssue({
        code: "custom",
        path: ["byteLength"],
        message: "Cover byte length does not match its data URL",
      });
    }
    const actual = inspectRasterImage(decoded.bytes);
    if (!actual) {
      context.addIssue({
        code: "custom",
        path: ["dataUrl"],
        message: "Cover data is not a recognized raster image",
      });
      return;
    }
    if (actual.mediaType !== decoded.declaredMediaType) {
      context.addIssue({
        code: "custom",
        path: ["mediaType"],
        message: "Cover media type does not match the encoded image",
      });
    }
    if (actual.width !== image.width || actual.height !== image.height) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "Cover dimensions do not match the encoded image",
      });
    }
    if (
      actual.width > LOCAL_COVER_MAX_EDGE ||
      actual.height > LOCAL_COVER_MAX_EDGE ||
      exceedsPixelLimit(actual.width, actual.height)
    ) {
      context.addIssue({
        code: "custom",
        path: ["dataUrl"],
        message: "Cover image exceeds the decoded pixel limit",
      });
    }
  });

const printPreferencesSchema = z
  .object({
    format: z.enum(["a4", "a5", "booklet"]),
    scope: z.enum(["current-song", "active-setlist", "filtered", "library"]),
    versionMode: z.enum(["default", "current", "all"]),
    languageMode: z.enum(["original", "original-translation", "all-tracks"]),
    strategy: z.enum(["balanced", "readable", "compact", "strict-page-limit"]),
    includeOptional: z.boolean(),
    includeEmptySongs: z.boolean(),
    includeSources: z.boolean(),
    includeTableOfContents: z.boolean(),
    includeCover: z.boolean(),
    lineFlow: z.enum(["auto", "preserve", "slash"]),
    coverMode: z.enum(["generated", "image", "image-with-text"]),
    coverImage: localCoverImageSchema,
  })
  .partial();

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
      print: printPreferencesSchema.optional(),
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
