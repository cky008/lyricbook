# Roadmap

## Near term

- Native browser-measured pagination and saddle-stitch imposition.
- Full multi-version editor and per-export version selection.
- More complete Fluent localization pipeline.
- Accessible setlist reordering; desktop drag-and-drop first, iOS touch reordering later.
- Signed content-pack registry with checksums and rollback.

## Planned / evaluated, not implemented in 0.0.1

- Image-to-setlist LLM extraction and source reconciliation.
- Agent-assisted web research with user-funded model usage.
- LRC and richer timed-lyrics import.
- Google Drive, OneDrive, Dropbox, WebDAV, and other backup providers.
- Social-media image and card generation.
- Translation contribution workflow and licensing metadata.
- Bluetooth clicker, keyboard page-turning, wake-lock, concert countdown, familiarity queues.
- Talking/interlude cue sheets, QR sharing, pack signatures, diff previews, theme marketplace.
- High-contrast and color-vision themes, cover designer, automatic volume splitting, print-cost estimates.
- Prediction-vs-actual setlist comparison and post-show archival.
- Storage quota warning, crash recovery, lyric line numbering, and stage annotations.

## Remote preset evaluation

0.0.1 uses versioned built-in snapshots plus explicit local or HTTPS import. A future registry should publish release-pinned URLs, schema versions, SHA-256 hashes, signatures, compatibility ranges, and rollback metadata. Do not fetch mutable `raw/main` content automatically.
