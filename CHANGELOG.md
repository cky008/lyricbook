# Changelog

All notable changes follow Keep a Changelog principles.

## [Unreleased]

### Added

- Restored a user-selectable Markdown setlist editor alongside the structured controls, with lossless metadata comments, atomic apply, new-song creation, and unsaved-draft protection.
- Added locally processed booklet covers with generated, image-only, and image-with-title modes.
- Added automatic or explicit slash joining for consecutive short monolingual lyric lines so safe typography can remain larger.

### Fixed

- Captured project field values before deferred React state updates, preventing the post-import title and description editor crash.
- Replaced stale cache-first entry navigation with build-specific caches, network-first HTML, previous-build asset retention, and guarded Service Worker updates.
- Reorganized the narrow and iOS header into stable direct actions plus an accessible overflow menu without horizontal clipping.

### Security

- Restricted local covers to signature- and dimension-checked raster formats and removed source names and metadata through bounded canvas re-encoding; no upload path was added.

### Tests

- Added unit and cross-browser regressions for Markdown setlists, short-line print flow, private cover modes, delayed field updates, stale hashed assets, Service Worker lifecycle, and 320/393/430px header geometry.

## [0.0.7] - 2026-09-02

### Added

- Added a release-blocking print regression matrix with synthetic short, long, CJK, bilingual, multi-version, sectionless, contents, A4, A5, booklet, and strict-limit fixtures.
- Added explicit preview states for measurement, safe output, and layouts that require adjustment.

### Changed

- Measured printable pages in the browser after fonts and layout settle, selecting the largest safe type size for each song page.
- Used natural export guidance that explains unique filenames without exposing implementation details.

### Fixed

- Paginated long lyrics without losing lines and prevented page content from entering the footer safety region.
- Kept aligned bilingual tracks together, separated independent tracks and versions clearly, and removed the full-height lyric grid that caused clipping.
- Measured complete contents at supported column densities before creating continuation pages, then recalculated linked song page numbers.
- Disabled printing when a strict one-page layout remains unsafe at the 7pt minimum.
- Updated the offline check to invoke the pinned TypeScript compiler through its supported command-line interface.

### Tests

- Added unit and Playwright coverage for adaptive typography, complete-text pagination, strict-limit blocking, contents links, accessibility, CJK, bilingual tracks, multiple versions, and booklet imposition.
- Verified synthetic A4, A5, and imposed-booklet PDFs for page size, internal links, text completeness, footer clearance, and rendered appearance.

## [0.0.6] - 2026-09-02

### Added

- Restored migration support for legacy `gem-lyricbook-backup-v4` archives, including lyric versions, translations, setlists, and unmatched legacy songs.
- Added system, light, and dark appearance modes with persisted user selection.
- Added an optional designed cover for imposed A4 folded booklets.

### Changed

- Separated the project title and tagline for clearer responsive header spacing.
- Standardized song-list rows so titles appear above version and tag metadata.
- Added more breathing room between reader actions and the lyric panel.
- Replaced the active-song inset rail with a full-card selected state and improved pointer and keyboard interactions.

### Tests

- Added migration, appearance, responsive song-list, selection-state, reader-spacing, and booklet-cover regression coverage.
- Verified the complete TypeScript, Rust, production-build, accessibility, print, Chromium, Firefox, WebKit, and iPhone quality gates.


## [0.0.5] - 2026-09-01

### Changed

- Updated `actions/upload-artifact` to v7 and `actions/dependency-review-action` to v5, with repository validation updated atomically to the same majors.
- Expanded the DIOR London preset from 10 songs to a 40-song research library with explicit source confidence.
- Added a 17-song London high-confidence core, a 24-song London composite prediction, the user-supplied 24-track Taipei reference order, and a 20-song rotation pool.
- Corrected official English-title mappings, including `YOLO` → `人醒着不过一万多天` and `Mutual Friends` → `靠关系`.

### Added

- Added `docs/DIOR_LONDON_PREDICTION.md` describing evidence tiers, source limitations, optional slots, and the post-show update workflow.

### Security

- Kept public presets metadata-only with empty lyric tracks and retained full content, repository, Rust, browser, accessibility, and print quality gates.

## [0.0.4] - 2026-09-01

### Changed

- Raised the application release from 0.0.3 to 0.0.4 while keeping the verified modern dependency pins.
- Routed npm, Cargo, and GitHub Actions Dependabot updates to `develop`, with grouped GitHub Actions updates.
- Enforced the current GitHub Actions major versions in repository validation.

### Fixed

- Removed the closed mobile sidebar from the DOM so hidden controls cannot remain focusable.
- Made immersive next-song navigation reset scroll position synchronously and deterministically.
- Made the print portal a static direct child of `body` to prevent duplicate or timing-sensitive portals.
- Updated Playwright assertions to target persistent locale state, the visible print preview, and scoped mobile controls.
- Added behavior-focused unit tests instead of lowering coverage thresholds or excluding additional production files.
- Removed all 32 existing Biome warnings without applying unsafe automatic fixes.
- Replaced non-null assertions with explicit runtime invariants in the print engine and tests.
- Replaced array-index React keys with stable content or persistent-ID based keys.
- Reworked print and reduced-motion CSS so required behavior no longer depends on `!important`.

### Tests

- Kept the global coverage gates at 70% statements, 60% branches, 65% functions, and 70% lines.
- Added coverage for archive safety, localization fallbacks, theme sanitization, migration, setlist parsing, project helpers, print scopes, bilingual and multi-version layouts, long lyrics, table-of-contents density, and booklet output.

## [0.0.3] - 2026-08-31

### Changed

- Rebuilt the web runtime on React 19.2.8, React DOM 19.2.8, Vite 8.2.2, TypeScript 7.0.2, Tailwind CSS 4.3.3, Radix 1.6.7, and React Compiler 1.0.0.
- Updated the Rust workspace to Rust 1.98.0, edition 2024, and current pinned domain crates.
- Replaced the legacy global React/vendored runtime with modern ESM and `createRoot`.
- Modularized generic domain, import/export, theme, immersive reader, setlist editor, and print engine code.

### Added

- IndexedDB local persistence with automatic pre-replacement backups.
- `.lyricbook`, JSON, Markdown, TXT, theme, and explicit HTTPS import paths.
- Multi-version and multilingual lyric tracks.
- Setlist-driven immersive previous/next navigation.
- A4, A5, and imposed A4 folded-booklet print plans.
- Vitest, Playwright, Rust, repository, content, security, and Pages workflows.
- English agent/developer documentation and Chinese user guides.

### Security

- Added archive path, file-count, expanded-size, nested-archive, HTTPS, theme-token, and text-rendering restrictions.

## [0.0.2] - unreleased local repair

- Repaired the original prototype's missing locale assets, favicon files, and React 16 runtime crash. This state was not treated as the modern production baseline.

## [0.0.1] - prototype

- Initial generic LyricBook bootstrap.
