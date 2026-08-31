# Roadmap

This document records approved future ideas. Items here are **not implemented promises** and must not appear as working production controls until delivered and tested.

## Import and editing

- Native iOS long-press drag ordering with accessible keyboard fallback.
- LRC import, timestamp removal, song matching, and optional synchronized reading.
- Richer Markdown content-pack authoring.
- Bulk alias/tag/source editing.
- Prediction-versus-observed setlist diff and post-concert archive.
- Automatic draft recovery and browser-storage capacity warnings.

## AI and paid services

- Image/screenshot OCR plus LLM-assisted setlist extraction.
- Agent-assisted web research and cross-source verification.
- AI source reconciliation and confidence updates.
- Paid model quotas, billing, and abuse controls.
- Human review queues before AI output can replace a project.

These features require a separately designed backend, secrets management, cost controls, privacy policy, and explicit user consent. They must not be implemented by embedding provider keys in the web app.

## Remote preset registry — evaluated, not implemented

The initial version ships versioned presets at build time and accepts explicit local/HTTPS imports. A future registry may publish signed release assets containing schema version, download URL, SHA-256, and optional signature. The client must never trust mutable `raw/main` content without compatibility and integrity checks.

## Backup and portability

- Google Drive, OneDrive, Dropbox, iCloud Drive, and WebDAV backup.
- Version history, restore points, and project diff preview.
- Optional encrypted project archives.
- QR sharing of metadata-only setlists.

## Publishing and live use

- Social-media image/card generator.
- PDF cover designer and multi-volume split.
- Print paper/cost estimate.
- Wake Lock support for live concert reading.
- Bluetooth presenter and keyboard page controls.
- Concert countdown and rehearsal queue.
- Familiarity tracking and spaced review.
- Talking/interlude cue sheets, line numbers, and stage notes.
- High-contrast, dyslexia-aware, and color-vision-safe themes.
- Theme marketplace with signed, data-only packages.

## Suggestions added during architecture review

These are maintainer suggestions, not original requirements:

- deterministic content-pack signatures;
- storage health checks before large imports;
- offline package repair/inspection CLI;
- user-controlled crash report export that never uploads automatically;
- a print regression corpus covering system-font substitution;
- project-level redaction before sharing research files.
