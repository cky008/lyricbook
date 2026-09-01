# Content pack specification

## Built-in preset

A built-in preset is a reviewable `project.json` under `content/presets/<id>/`. Add the preset to `content/presets/index.json` and run content validation.

`project.json` is the sole source of truth for a built-in preset. Do not maintain duplicate `setlists/*.json` fragments under the preset directory unless a future versioned content-pack manifest explicitly references them and both the loader and validators support them as first-class inputs. Human-facing standalone exports should be generated from `project.json`.

Public presets may contain metadata, aliases, source evidence, setlist order, confidence, safe themes, and empty lyric tracks. They must not contain unauthorized full lyrics.

## User archive

A `.lyricbook` file is ZIP with:

```text
manifest.json
project.json
```

`manifest.json` identifies format `lyricbook-project`, format version `1`, application/schema versions, project id, timestamps, revision id, and entrypoint.

## Import safety

Reject absolute paths, `..`, drive paths, nested archives, excessive archive size, excessive expanded size, and excessive file count. Validate the full project before replacement.
