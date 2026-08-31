# Migrating from gem-lyricbook

LyricBook recognizes `gem-lyricbook-backup-v4` JSON. Migration uses the built-in G.E.M. metadata preset, maps `state.lyrics` or `state.lyricLibrary.versions` into generic song/version/track records, preserves default versions, and creates a new revision.

Migration is local. The source backup is never uploaded. Export a new `.lyricbook` immediately after checking song counts, multi-version songs, translations, setlists, and theme.
