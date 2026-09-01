# Data model

Schema version: `1`.

## Project

A project contains localized title/description, songs, setlists, themes, sources, active ids, timestamps, revision ids, and browser preferences.

## Song and lyric versions

A song has stable id, localized titles, aliases, tags, source references, and lyric versions. A version represents a studio/live/language/arrangement variant. Tracks inside a version represent original, translation, transliteration, or adaptation text.

English original plus Chinese translation belong to one version. Mandarin and Cantonese lyrics belong to two versions.

## Setlist

A setlist is an ordered list of:

- `song`
- `section`
- `note`
- `break`

Sections are optional. Song items can be optional and can carry confidence/source evidence.

## Source

Sources record id, kind, title, publisher, URL, retrieval time, language, confidence, and notes. Setlist research must retain source spelling and map aliases separately.

## Revision and exports

Exports record UTC times, revision id, and parent revision id. File names include milliseconds and a random suffix.
