# Data model

The public schema version is `1`.

A project contains stable IDs, localized titles, songs, setlists, themes, active selections, and source references. A song may contain multiple lyric versions. Each version may contain original, translation, transliteration, or adaptation tracks.

Rules:

- Song and setlist IDs are unique and stable.
- Setlists may contain songs, optional sections, notes, and breaks.
- Sections are optional; a plain ordered song list is valid.
- At most one lyric version is marked as default.
- Public presets contain no bundled lyric text unless redistribution rights are documented.
- Schema changes require migration fixtures and a schema-version change.
