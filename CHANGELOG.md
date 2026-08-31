# Changelog

All notable changes follow Keep a Changelog principles.

## [Unreleased]

### Fixed

- Removed the closed mobile sidebar from the DOM so hidden controls cannot remain focusable.
- Made immersive next-song navigation reset scroll position synchronously and deterministically.
- Made the print portal a static direct child of `body` to prevent duplicate or timing-sensitive portals.
- Updated Playwright assertions to target persistent locale state, the visible print preview, and scoped mobile controls.

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
