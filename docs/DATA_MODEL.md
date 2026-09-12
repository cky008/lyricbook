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

The v1 schema has no canonical duration or medley-group field. Source-specific video chapter timings belong in the source matrix and localized item labels or notes. A combined cue keeps one shared duration while its constituent songs remain separate song items. VCR transitions and spoken segments remain `break` or `note` items rather than synthetic songs.

## Source

Sources record id, kind, title, publisher, URL, retrieval time, language, confidence, and notes. Setlist research must retain source spelling and map aliases separately.

## Revision and exports

Exports record UTC times, revision id, and parent revision id. File names include milliseconds and a random suffix.

## Lyric merge and preset selection

`mergeProjectLyrics(target, source)` in `packages/domain/src/lyric-merge.ts` produces a validated project and a merge report without mutating its inputs. It is a library operation, not a union of two projects.

- The target retains project identity, setlists and their order, active setlist, themes, and preferences.
- Unique stable song ids take priority; unique exact normalized title/alias matches can reconcile older ids. Prefix and fuzzy matches are not accepted. Ambiguity is reported and skipped by the merge function instead of selecting a candidate silently; the caller decides whether a partial result may be applied.
- Existing non-empty lyric versions remain intact. Differing imported versions are retained separately, equivalent content is not repeatedly duplicated, and exact track text, roles, languages, and alignment are preserved.
- If a stored active-version selection points to a missing or empty version after merging, it is repaired to the populated default. Existing populated selections are retained.
- Nonambiguous source-only songs with lyrics are appended to the library, with references remapped where necessary. They are not inserted into a target setlist. Empty source songs and versions do not overwrite target content or add redundant placeholders.
- Imported evidence references must resolve in the resulting project. Source-id collisions must not overwrite target evidence.

Project import uses the current project as the target by default and may apply a merge that skips reported ambiguous source songs. Selecting a preset uses that preset as the target and the current project as the lyric source, so the selected preset supplies the new song order. The preset-selection caller aborts entirely if the report contains any ambiguous songs and shows the affected names/count; it must not persist a partial result.

A full-project restore remains an explicit import action. Both persistence paths back up the current project before saving and leave it unchanged if validation or backup fails. During backup/save, the dialog prevents dismissal and editing until completion. File parsing can still be cancelled, and cancelled or superseded parse results must not apply. Pending autosaves must not restore the previous project after a completed replacement.

Browser-local interface composition remains outside this data model and is unaffected by either operation.
