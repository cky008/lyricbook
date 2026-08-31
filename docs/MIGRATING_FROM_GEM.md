# Migrating from gem-lyricbook

The legacy G.E.M. project and the generic LyricBook repository remain separate. Migration should convert the legacy backup into schema version `1`, preserving stable song identities, setlist order, aliases, tags, default versions, additional Mandarin/Cantonese/live versions, original tracks, and translation tracks.

Migration must be atomic: parse into a temporary project, validate all references, show a summary, preserve a backup of the existing browser project, and replace data only after validation succeeds. Never commit a user's migrated lyrics as a public fixture; use redacted metadata-only fixtures in tests.
