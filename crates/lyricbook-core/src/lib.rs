//! Deterministic LyricBook domain logic shared by the web application, CLI, and WASM adapter.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use thiserror::Error;

/// Current public project schema.
pub const SCHEMA_VERSION: u32 = 1;

/// Localized text indexed by BCP-47-like language tags.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct LocalizedText(pub BTreeMap<String, String>);

impl LocalizedText {
    /// Returns true when every translation is blank.
    pub fn is_empty(&self) -> bool {
        self.0.values().all(|value| value.trim().is_empty())
    }
}

/// A language track inside one lyric version.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LyricTrack {
    /// Optional stable track identifier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Language tag, for example `en` or `zh-Hans`.
    pub language: String,
    /// Track role: original, translation, transliteration, or adaptation.
    pub role: String,
    /// User-provided text. Public presets should normally leave this empty.
    #[serde(default)]
    pub text: String,
    /// Optional localized track label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<LocalizedText>,
    /// Optional id of the aligned original track.
    #[serde(rename = "alignedTo", skip_serializing_if = "Option::is_none")]
    pub aligned_to: Option<String>,
}

/// One studio, live, language, or arrangement version of a song.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LyricVersion {
    /// Stable id inside the song.
    pub id: String,
    /// Localized display label.
    pub label: LocalizedText,
    /// Free-form kind such as `studio`, `live`, or `cantonese`.
    pub kind: String,
    /// Whether this is the song's default version.
    #[serde(rename = "isDefault", default)]
    pub is_default: bool,
    /// Optional version note.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Language tracks contained by this version.
    #[serde(default)]
    pub tracks: Vec<LyricTrack>,
}

/// A reusable song library record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Song {
    /// Stable project-local id.
    pub id: String,
    /// Localized song titles.
    pub titles: LocalizedText,
    /// Alternative titles used for matching imports.
    #[serde(default)]
    pub aliases: Vec<String>,
    /// User-defined tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// References into the project's source list.
    #[serde(rename = "sourceRefs", default)]
    pub source_refs: Vec<String>,
    /// Available lyric versions.
    #[serde(rename = "lyricVersions", default)]
    pub lyric_versions: Vec<LyricVersion>,
}

/// One setlist entry. Sections are optional; a setlist may contain only songs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SetlistItem {
    /// A song reference.
    Song {
        /// Referenced song id.
        #[serde(rename = "songId")]
        song_id: String,
        /// Marks a rotation, request, or other optional song.
        #[serde(default)]
        optional: bool,
        /// Research confidence from zero to one.
        #[serde(skip_serializing_if = "Option::is_none")]
        confidence: Option<f32>,
        /// Evidence references for this placement.
        #[serde(rename = "sourceRefs", default, skip_serializing_if = "Vec::is_empty")]
        source_refs: Vec<String>,
        /// Optional localized note.
        #[serde(skip_serializing_if = "Option::is_none")]
        note: Option<LocalizedText>,
    },
    /// A visual section such as Part 1 or Encore.
    Section {
        /// Optional stable section id.
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        /// Localized section label.
        label: LocalizedText,
        /// Whether the whole section is optional.
        #[serde(default)]
        optional: bool,
    },
    /// A talking, research, or production note.
    Note {
        /// Localized note text.
        text: LocalizedText,
    },
    /// A deliberate gap or intermission.
    Break {
        /// Optional localized label.
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<LocalizedText>,
    },
}

/// Ordered concert setlist.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Setlist {
    /// Stable setlist id.
    pub id: String,
    /// Localized title.
    pub title: LocalizedText,
    /// Status such as official, observed, prediction, rotation, or draft.
    pub status: String,
    /// Optional ISO date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// Optional localized venue.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub venue: Option<LocalizedText>,
    /// Optional localized notes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    /// Ordered entries.
    #[serde(default)]
    pub items: Vec<SetlistItem>,
}

/// Safe theme design tokens.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThemeTokens {
    /// Primary accent.
    pub accent: String,
    /// Optional secondary accent.
    #[serde(rename = "accent2", skip_serializing_if = "Option::is_none")]
    pub accent_two: Option<String>,
    /// Page background.
    pub background: String,
    /// Card surface.
    pub surface: String,
    /// Optional stronger surface.
    #[serde(rename = "surfaceStrong", skip_serializing_if = "Option::is_none")]
    pub surface_strong: Option<String>,
    /// Primary text.
    pub text: String,
    /// Optional secondary text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<String>,
    /// CSS length for corner radius.
    pub radius: String,
    /// Optional density multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub density: Option<f32>,
}

/// Theme preset.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Theme {
    /// Stable theme id.
    pub id: String,
    /// Localized theme name.
    pub name: LocalizedText,
    /// Safe visual tokens.
    pub tokens: ThemeTokens,
    /// Extra print settings retained as structured JSON for forward compatibility.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub print: BTreeMap<String, serde_json::Value>,
    /// Extra asset references retained as structured JSON for forward compatibility.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub assets: BTreeMap<String, serde_json::Value>,
}

/// Source record used for research provenance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Source {
    /// Stable source id.
    pub id: String,
    /// Source category.
    pub kind: String,
    /// Human-readable title.
    pub title: String,
    /// Optional publisher.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    /// Optional URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Optional retrieval timestamp.
    #[serde(rename = "retrievedAt", skip_serializing_if = "Option::is_none")]
    pub retrieved_at: Option<String>,
    /// Optional language tag.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Optional confidence score.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    /// Optional research note.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Top-level LyricBook project.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    /// Schema version.
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    /// Stable project id.
    pub id: String,
    /// Localized title.
    pub title: LocalizedText,
    /// Optional localized description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    /// ISO creation time.
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// ISO update time.
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Revision id.
    #[serde(rename = "revisionId", skip_serializing_if = "Option::is_none")]
    pub revision_id: Option<String>,
    /// Parent revision id.
    #[serde(rename = "parentRevisionId", skip_serializing_if = "Option::is_none")]
    pub parent_revision_id: Option<String>,
    /// Reusable songs.
    #[serde(default)]
    pub songs: Vec<Song>,
    /// One or more setlists.
    #[serde(default)]
    pub setlists: Vec<Setlist>,
    /// Theme presets.
    #[serde(default)]
    pub themes: Vec<Theme>,
    /// Research sources.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<Source>,
    /// Active setlist id.
    #[serde(rename = "activeSetlistId", skip_serializing_if = "Option::is_none")]
    pub active_setlist_id: Option<String>,
    /// Active theme id.
    #[serde(rename = "activeThemeId", skip_serializing_if = "Option::is_none")]
    pub active_theme_id: Option<String>,
    /// Forward-compatible browser preferences.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub preferences: BTreeMap<String, serde_json::Value>,
}

/// Domain validation error.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    /// Unsupported schema version.
    #[error("unsupported schema version {0}")]
    UnsupportedSchema(u32),
    /// Empty project id.
    #[error("project id is empty")]
    EmptyProjectId,
    /// Empty project title.
    #[error("project title is empty")]
    EmptyProjectTitle,
    /// Duplicate song id.
    #[error("duplicate song id: {0}")]
    DuplicateSongId(String),
    /// Duplicate setlist id.
    #[error("duplicate setlist id: {0}")]
    DuplicateSetlistId(String),
    /// Duplicate theme id.
    #[error("duplicate theme id: {0}")]
    DuplicateThemeId(String),
    /// Duplicate source id.
    #[error("duplicate source id: {0}")]
    DuplicateSourceId(String),
    /// Missing song reference.
    #[error("setlist references a missing song: {0}")]
    MissingSongReference(String),
    /// Missing source reference.
    #[error("project references a missing source: {0}")]
    MissingSourceReference(String),
    /// Multiple default lyric versions.
    #[error("song has more than one default lyric version: {0}")]
    MultipleDefaultVersions(String),
    /// Missing active setlist.
    #[error("active setlist does not exist: {0}")]
    MissingActiveSetlist(String),
    /// Missing active theme.
    #[error("active theme does not exist: {0}")]
    MissingActiveTheme(String),
}

/// Validates cross-record invariants not covered by JSON parsing.
pub fn validate_project(project: &Project) -> Result<(), ValidationError> {
    if project.schema_version != SCHEMA_VERSION {
        return Err(ValidationError::UnsupportedSchema(project.schema_version));
    }
    if project.id.trim().is_empty() {
        return Err(ValidationError::EmptyProjectId);
    }
    if project.title.is_empty() {
        return Err(ValidationError::EmptyProjectTitle);
    }

    let mut source_ids = HashSet::new();
    for source in &project.sources {
        if !source_ids.insert(source.id.as_str()) {
            return Err(ValidationError::DuplicateSourceId(source.id.clone()));
        }
    }

    let mut song_ids = HashSet::new();
    for song in &project.songs {
        if !song_ids.insert(song.id.as_str()) {
            return Err(ValidationError::DuplicateSongId(song.id.clone()));
        }
        let defaults = song
            .lyric_versions
            .iter()
            .filter(|version| version.is_default)
            .count();
        if defaults > 1 {
            return Err(ValidationError::MultipleDefaultVersions(song.id.clone()));
        }
        for source_ref in &song.source_refs {
            if !source_ids.contains(source_ref.as_str()) {
                return Err(ValidationError::MissingSourceReference(source_ref.clone()));
            }
        }
    }

    let mut setlist_ids = HashSet::new();
    for setlist in &project.setlists {
        if !setlist_ids.insert(setlist.id.as_str()) {
            return Err(ValidationError::DuplicateSetlistId(setlist.id.clone()));
        }
        for item in &setlist.items {
            if let SetlistItem::Song {
                song_id,
                source_refs,
                ..
            } = item
            {
                if !song_ids.contains(song_id.as_str()) {
                    return Err(ValidationError::MissingSongReference(song_id.clone()));
                }
                for source_ref in source_refs {
                    if !source_ids.contains(source_ref.as_str()) {
                        return Err(ValidationError::MissingSourceReference(source_ref.clone()));
                    }
                }
            }
        }
    }

    let mut theme_ids = HashSet::new();
    for theme in &project.themes {
        if !theme_ids.insert(theme.id.as_str()) {
            return Err(ValidationError::DuplicateThemeId(theme.id.clone()));
        }
    }
    if let Some(active) = &project.active_setlist_id
        && !setlist_ids.contains(active.as_str())
    {
        return Err(ValidationError::MissingActiveSetlist(active.clone()));
    }
    if let Some(active) = &project.active_theme_id
        && !theme_ids.contains(active.as_str())
    {
        return Err(ValidationError::MissingActiveTheme(active.clone()));
    }
    Ok(())
}

/// Returns imposed logical page pairs for an already padded saddle-stitched booklet.
/// Each tuple is `(front_left, front_right, back_left, back_right)`.
pub fn booklet_imposition(total_pages: usize) -> Result<Vec<(usize, usize, usize, usize)>, String> {
    if total_pages == 0 || !total_pages.is_multiple_of(4) {
        return Err("booklet page count must be a positive multiple of four".into());
    }
    let mut sheets = Vec::with_capacity(total_pages / 4);
    let mut low = 1usize;
    let mut high = total_pages;
    while low < high {
        sheets.push((high, low, low + 1, high - 1));
        low += 2;
        high -= 2;
    }
    Ok(sheets)
}

/// Pads a logical page count to the next positive multiple of four.
pub fn padded_booklet_page_count(page_count: usize) -> usize {
    let page_count = page_count.max(1);
    page_count.div_ceil(4) * 4
}

/// Builds a filesystem-safe export name from already generated timestamp and suffix values.
pub fn safe_export_filename(slug: &str, timestamp: &str, suffix: &str) -> String {
    let sanitized = slug
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_ascii_lowercase();
    let project = if sanitized.is_empty() {
        "project"
    } else {
        &sanitized
    };
    format!("lyricbook_{project}_{timestamp}_{suffix}.lyricbook")
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn text(value: &str) -> LocalizedText {
        LocalizedText(BTreeMap::from([("en".into(), value.into())]))
    }

    fn project() -> Project {
        Project {
            schema_version: SCHEMA_VERSION,
            id: "demo".into(),
            title: text("Demo"),
            description: None,
            created_at: None,
            updated_at: None,
            revision_id: None,
            parent_revision_id: None,
            songs: vec![Song {
                id: "song-a".into(),
                titles: text("Song A"),
                aliases: vec![],
                tags: vec![],
                source_refs: vec![],
                lyric_versions: vec![],
            }],
            setlists: vec![Setlist {
                id: "set-a".into(),
                title: text("Setlist"),
                status: "prediction".into(),
                date: None,
                venue: None,
                notes: None,
                items: vec![SetlistItem::Song {
                    song_id: "song-a".into(),
                    optional: false,
                    confidence: Some(0.8),
                    source_refs: vec![],
                    note: None,
                }],
            }],
            themes: vec![],
            sources: vec![],
            active_setlist_id: Some("set-a".into()),
            active_theme_id: None,
            preferences: BTreeMap::new(),
        }
    }

    #[test]
    fn validates_a_minimal_project() {
        assert_eq!(validate_project(&project()), Ok(()));
    }

    #[test]
    fn rejects_missing_song_reference() {
        let mut value = project();
        value.setlists[0].items = vec![SetlistItem::Song {
            song_id: "missing".into(),
            optional: false,
            confidence: None,
            source_refs: vec![],
            note: None,
        }];
        assert_eq!(
            validate_project(&value),
            Err(ValidationError::MissingSongReference("missing".into()))
        );
    }

    #[test]
    fn rejects_missing_source_reference() {
        let mut value = project();
        value.songs[0].source_refs = vec!["missing-source".into()];
        assert_eq!(
            validate_project(&value),
            Err(ValidationError::MissingSourceReference(
                "missing-source".into()
            ))
        );
    }

    #[test]
    fn rejects_duplicate_source_ids() {
        let source = Source {
            id: "source-a".into(),
            kind: "official".into(),
            title: "Source".into(),
            publisher: None,
            url: None,
            retrieved_at: None,
            language: None,
            confidence: None,
            notes: None,
        };
        let mut value = project();
        value.sources = vec![source.clone(), source];
        assert_eq!(
            validate_project(&value),
            Err(ValidationError::DuplicateSourceId("source-a".into()))
        );
    }

    #[test]
    fn imposes_eight_pages() {
        assert_eq!(
            booklet_imposition(8).unwrap(),
            vec![(8, 1, 2, 7), (6, 3, 4, 5)]
        );
    }

    proptest! {
        #[test]
        fn padded_page_counts_are_positive_multiples_of_four(value in 0usize..10_000) {
            let padded = padded_booklet_page_count(value);
            prop_assert!(padded >= value.max(1));
            prop_assert_eq!(padded % 4, 0);
        }
    }
}
