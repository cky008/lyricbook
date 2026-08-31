//! Deterministic domain logic shared by the web, CLI, and WASM adapters.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalizedText {
    #[serde(rename = "zh-Hans", skip_serializing_if = "Option::is_none")]
    pub zh_hans: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub en: Option<String>,
}

impl LocalizedText {
    pub fn is_empty(&self) -> bool {
        self.zh_hans.as_deref().unwrap_or_default().trim().is_empty()
            && self.en.as_deref().unwrap_or_default().trim().is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LyricTrack {
    pub language: String,
    pub role: String,
    #[serde(default)]
    pub text: String,
    #[serde(rename = "alignedTo", skip_serializing_if = "Option::is_none")]
    pub aligned_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LyricVersion {
    pub id: String,
    pub label: LocalizedText,
    pub kind: String,
    #[serde(rename = "isDefault", default)]
    pub is_default: bool,
    #[serde(default)]
    pub tracks: Vec<LyricTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Song {
    pub id: String,
    pub titles: LocalizedText,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "sourceRefs", default)]
    pub source_refs: Vec<String>,
    #[serde(rename = "lyricVersions", default)]
    pub lyric_versions: Vec<LyricVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SetlistItem {
    Song {
        #[serde(rename = "songId")]
        song_id: String,
        #[serde(default)]
        optional: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        confidence: Option<f32>,
    },
    Section {
        label: LocalizedText,
        #[serde(default)]
        optional: bool,
    },
    Note {
        text: LocalizedText,
    },
    Break,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Setlist {
    pub id: String,
    pub title: LocalizedText,
    pub status: String,
    #[serde(default)]
    pub items: Vec<SetlistItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Theme {
    pub id: String,
    pub name: LocalizedText,
    pub tokens: ThemeTokens,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThemeTokens {
    pub accent: String,
    pub background: String,
    pub surface: String,
    pub text: String,
    pub radius: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub title: LocalizedText,
    #[serde(default)]
    pub songs: Vec<Song>,
    #[serde(default)]
    pub setlists: Vec<Setlist>,
    #[serde(default)]
    pub themes: Vec<Theme>,
    #[serde(rename = "activeSetlistId", skip_serializing_if = "Option::is_none")]
    pub active_setlist_id: Option<String>,
    #[serde(rename = "activeThemeId", skip_serializing_if = "Option::is_none")]
    pub active_theme_id: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("unsupported schema version {0}")]
    UnsupportedSchema(u32),
    #[error("project id is empty")]
    EmptyProjectId,
    #[error("project title is empty")]
    EmptyProjectTitle,
    #[error("duplicate song id: {0}")]
    DuplicateSongId(String),
    #[error("duplicate setlist id: {0}")]
    DuplicateSetlistId(String),
    #[error("setlist references a missing song: {0}")]
    MissingSongReference(String),
    #[error("song has more than one default lyric version: {0}")]
    MultipleDefaultVersions(String),
}

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
    }

    let mut setlist_ids = HashSet::new();
    for setlist in &project.setlists {
        if !setlist_ids.insert(setlist.id.as_str()) {
            return Err(ValidationError::DuplicateSetlistId(setlist.id.clone()));
        }
        for item in &setlist.items {
            if let SetlistItem::Song { song_id, .. } = item {
                if !song_ids.contains(song_id.as_str()) {
                    return Err(ValidationError::MissingSongReference(song_id.clone()));
                }
            }
        }
    }
    Ok(())
}

/// Returns imposed logical page pairs for an already-padded saddle-stitched booklet.
/// Each tuple is `(front_left, front_right, back_left, back_right)`.
pub fn booklet_imposition(total_pages: usize) -> Result<Vec<(usize, usize, usize, usize)>, String> {
    if total_pages == 0 || total_pages % 4 != 0 {
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

pub fn safe_export_filename(slug: &str, timestamp: &str, suffix: &str) -> String {
    let sanitized: String = slug
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_ascii_lowercase();
    format!("lyricbook_{}_{}_{}.lyricbook", sanitized, timestamp, suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> LocalizedText {
        LocalizedText { zh_hans: Some(value.into()), en: None }
    }

    fn project() -> Project {
        Project {
            schema_version: SCHEMA_VERSION,
            id: "demo".into(),
            title: text("示例"),
            songs: vec![Song {
                id: "song-a".into(),
                titles: text("歌曲 A"),
                aliases: vec![],
                tags: vec![],
                source_refs: vec![],
                lyric_versions: vec![],
            }],
            setlists: vec![Setlist {
                id: "set-a".into(),
                title: text("歌单"),
                status: "prediction".into(),
                items: vec![SetlistItem::Song { song_id: "song-a".into(), optional: false, confidence: Some(0.8) }],
            }],
            themes: vec![],
            active_setlist_id: Some("set-a".into()),
            active_theme_id: None,
        }
    }

    #[test]
    fn validates_a_minimal_project() {
        assert_eq!(validate_project(&project()), Ok(()));
    }

    #[test]
    fn rejects_missing_song_reference() {
        let mut value = project();
        value.setlists[0].items = vec![SetlistItem::Song { song_id: "missing".into(), optional: false, confidence: None }];
        assert_eq!(validate_project(&value), Err(ValidationError::MissingSongReference("missing".into())));
    }

    #[test]
    fn imposes_eight_pages() {
        assert_eq!(booklet_imposition(8).unwrap(), vec![(8, 1, 2, 7), (6, 3, 4, 5)]);
    }
}
