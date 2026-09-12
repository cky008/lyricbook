# Migrating from gem-lyricbook

LyricBook recognizes `gem-lyricbook-backup-v4` JSON. Migration uses the built-in G.E.M. metadata preset, maps `state.lyrics` or `state.lyricLibrary.versions` into generic song/version/track records, preserves default versions, and creates a new revision. Legacy titles are matched only to unique exact normalized titles or aliases; a shared title prefix is not enough to identify a song.

## Use the latest setlist with existing lyrics

1. Select the current G.E.M. preset to get its latest setlists. Any lyrics already in the current project are carried into the selected preset.
2. Open Import and select your old `.lyricbook` archive, LyricBook JSON, or G.E.M. v4 JSON backup.
3. Review the import summary and use the default lyric-merge action. It keeps the current setlists, project identity, themes, and preferences while adding lyrics and versions from the file.
4. Review any ambiguous matches, then check the active setlist and a few multi-version or translated songs. Export a new `.lyricbook` backup.

The reverse order also works: import the old lyrics first, then select the latest preset. Its new setlists become active while the current lyric library is carried over.

If selecting a preset finds ambiguous matches, the whole selection stops and displays the affected songs. The current project stays unchanged so its lyrics remain available for review.

Song matching uses unique stable ids or exact normalized titles and aliases. The merge retains existing non-empty versions, preserves differing imported versions separately, and avoids adding the same lyric content repeatedly. Source-only songs with lyrics remain in the library without being inserted into the new setlist; empty source songs do not add redundant placeholders. During file import, ambiguous matches are reported and skipped; their text remains in the original file for manual review. No missing lyrics are downloaded or inferred.

## Restore a complete project instead

Choose the explicit full-project replacement action in the import preview when you want the file's entire project, including its old setlists and theme. This is different from carrying lyrics into the current project. Review the preview before applying it.

Both merge and replacement validate the incoming data and create a local backup before saving. If validation or the backup fails, the current project stays unchanged. The original file is never edited.

You can cancel while a file is being read. Once backup and saving begin, the dialog stays open and editing is temporarily disabled until the operation finishes, preventing changes from being lost during replacement.

Migration and merging happen locally. The source backup is never uploaded. Keep the original until you have checked the new archive; export a `.lyricbook` after checking song counts, multi-version songs, translations, setlists, and theme. See the [Chinese user guide](zh-CN/USER_GUIDE.md) and [AI recovery workflow](AI_WORKFLOW.md) for the corresponding user and agent steps.
