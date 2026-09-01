# Changelog

All notable changes follow Keep a Changelog principles.

## [Unreleased]

No unreleased changes.

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
