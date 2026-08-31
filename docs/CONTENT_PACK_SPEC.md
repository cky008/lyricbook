# Content pack specification

Version `0.0.1` ships reviewable built-in projects under `content/presets/<id>/project.json` and an index at `content/presets/index.json`.

A preset must:

1. use schema version `1`;
2. contain unique song and setlist IDs;
3. reference only songs present in the same project;
4. include source metadata for researched claims;
5. keep lyric tracks empty unless redistribution permission is documented;
6. avoid executable HTML, scripts, remote tracking assets, and private data.

Run `npm run validate:content` before committing a preset.
