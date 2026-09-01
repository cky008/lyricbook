export const SCHEMA_VERSION = 1 as const;

export type UiLocale = "en-US" | "zh-CN";
export type LanguageTag = string;
export type LocalizedText = Record<string, string>;

export type LyricTrackRole = "original" | "translation" | "transliteration" | "adaptation";

export interface LyricTrack {
  id?: string;
  language: LanguageTag;
  role: LyricTrackRole;
  text: string;
  label?: LocalizedText;
  alignedTo?: string;
}

export interface LyricVersion {
  id: string;
  label: LocalizedText;
  kind: string;
  isDefault: boolean;
  note?: string;
  tracks: LyricTrack[];
}

export interface Song {
  id: string;
  titles: LocalizedText;
  aliases: string[];
  tags: string[];
  sourceRefs: string[];
  lyricVersions: LyricVersion[];
}

export interface SetlistSongItem {
  type: "song";
  songId: string;
  optional?: boolean;
  confidence?: number;
  sourceRefs?: string[];
  note?: LocalizedText;
}

export interface SetlistSectionItem {
  type: "section";
  id?: string;
  label: LocalizedText;
  optional?: boolean;
}

export interface SetlistNoteItem {
  type: "note";
  text: LocalizedText;
}

export interface SetlistBreakItem {
  type: "break";
  label?: LocalizedText;
}

export type SetlistItem = SetlistSongItem | SetlistSectionItem | SetlistNoteItem | SetlistBreakItem;

export type SetlistStatus =
  | "official"
  | "observed"
  | "prediction"
  | "rotation"
  | "draft"
  | "archive";

export interface Setlist {
  id: string;
  title: LocalizedText;
  status: SetlistStatus | string;
  date?: string;
  venue?: LocalizedText;
  notes?: LocalizedText;
  items: SetlistItem[];
}

export interface ThemeTokens {
  accent: string;
  accent2?: string;
  background: string;
  surface: string;
  surfaceStrong?: string;
  text: string;
  muted?: string;
  radius: string;
  density?: number;
  headingFont?: "serif" | "sans";
  bodyFont?: "serif" | "sans";
}

export interface ThemePrintTokens {
  accent?: string;
  paper?: string;
  text?: string;
  headingStyle?: "editorial" | "modern" | "classic";
}

export interface Theme {
  id: string;
  name: LocalizedText;
  tokens: ThemeTokens;
  print?: ThemePrintTokens;
  assets?: {
    cover?: string;
    background?: string;
  };
}

export type SourceKind =
  | "artist-official"
  | "promoter-official"
  | "venue-official"
  | "ticketing-official"
  | "official-setlist"
  | "observed-performance"
  | "user-screenshot"
  | "press"
  | "community"
  | "other";

export interface Source {
  id: string;
  kind: SourceKind | string;
  title: string;
  publisher?: string;
  url?: string;
  retrievedAt?: string;
  language?: string;
  confidence?: number;
  notes?: string;
}

export interface ProjectPreferences {
  uiLocale?: UiLocale;
  lyricLanguages?: string[];
  activeSongId?: string;
  activeVersionBySong?: Record<string, string>;
  favoriteSongIds?: string[];
  learnedSongIds?: string[];
  print?: Partial<PrintOptions>;
}

export interface LyricBookProject {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  createdAt?: string;
  updatedAt?: string;
  revisionId?: string;
  parentRevisionId?: string;
  songs: Song[];
  setlists: Setlist[];
  themes: Theme[];
  sources?: Source[];
  activeSetlistId?: string;
  activeThemeId?: string;
  preferences?: ProjectPreferences;
}

export type PrintFormat = "a4" | "a5" | "booklet";
export type PrintScope = "current-song" | "active-setlist" | "filtered" | "library";
export type PrintVersionMode = "default" | "current" | "all";
export type PrintLanguageMode = "original" | "original-translation" | "all-tracks";
export type PrintStrategy = "balanced" | "readable" | "compact" | "strict-page-limit";

export interface PrintOptions {
  format: PrintFormat;
  scope: PrintScope;
  versionMode: PrintVersionMode;
  languageMode: PrintLanguageMode;
  strategy: PrintStrategy;
  includeOptional: boolean;
  includeEmptySongs: boolean;
  includeSources: boolean;
  includeTableOfContents: boolean;
}

export interface PresetIndexEntry {
  id: string;
  title: LocalizedText;
  path: string;
}

export interface ArchiveManifest {
  format: "lyricbook-project";
  formatVersion: 1;
  appVersion: string;
  schemaVersion: number;
  projectId: string;
  createdAt: string;
  exportedAt: string;
  revisionId: string;
  entrypoint: "project.json";
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
