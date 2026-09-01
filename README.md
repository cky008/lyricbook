# LyricBook

[![CI](https://github.com/cky008/lyricbook/actions/workflows/ci.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml)
[![Full quality](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml)
[![Security](https://github.com/cky008/lyricbook/actions/workflows/security.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/security.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[中文说明](README.zh-CN.md) · [🌐 Open LyricBook](https://lyricbook.iocky.com/) · [GitHub Pages fallback](https://cky008.github.io/lyricbook/) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

LyricBook is a privacy-first, local-first concert lyric-book editor, immersive setlist reader, and printable PDF/booklet generator. It stores user lyrics in the browser, separates reusable content from themes, supports multilingual and multi-version songs, and deploys as a static GitHub Pages application without a backend.

> **Version 0.0.6 builds on the modern runtime introduced in 0.0.5.** It uses React 19.2.8, React DOM 19.2.8, React Compiler 1.0.0 through Babel 8.0.1, Vite 8.2.2, TypeScript 7.0.2, Tailwind CSS 4.3.3, Rust 1.98.0, Vitest 4.1.11, and Playwright 1.62.1. There is no vendored React 16 runtime and no global `window.React` compatibility layer.

## What it does

- Uses browser language detection with a permanent English/Chinese switch.
- Stores projects in IndexedDB and backs up a project before replacement.
- Imports `.lyricbook`, JSON, Markdown, TXT, safe theme JSON, and user-supplied HTTPS URLs.
- Exports collision-resistant files containing UTC milliseconds and a random suffix.
- Supports original, translation, transliteration, and adaptation tracks inside each lyric version.
- Supports studio, live, language, acoustic, or custom versions under one song.
- Treats setlist sections as optional records; a setlist may be a plain song sequence.
- Provides safe up/down ordering on every device; touch drag-and-drop remains a tracked enhancement.
- Navigates previous/next songs from the active setlist and shows a next-song card at the lyric bottom.
- Generates A4, A5, and imposed A4 folded-booklet layouts with linked contents and a protected footer area.
- Ships offline snapshots for G.E.M. GLORIA and DIOR 大颖 London prediction validation.
- Keeps AI/OCR/web research, paid model APIs, cloud backup, LRC import, and social-image generation out of the initial runtime; they are documented in [ROADMAP.md](ROADMAP.md).

## Architecture

```text
React 19 + TypeScript + Vite + Tailwind + Radix
                    │
                    ├── IndexedDB / import-export / print DOM measurement
                    │
Rust 1.98 core ─────┼── JSON validation / normalization / booklet order
                    │
                    └── CLI + WebAssembly adapters
```

The browser owns visual pagination because actual font metrics and CJK wrapping are DOM-dependent. Rust owns deterministic domain validation, normalization, export naming, and booklet page-order calculations. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

Requirements:

- Node.js **26.8.1**
- npm **12.0.2**
- Rust **1.98.0**
- wasm-pack **0.15.0** for WASM builds

```bash
npm install
npm run build:wasm
npm run check
npm run test:e2e
npm run dev
```

The first `npm install` creates `package-lock.json`; `cargo generate-lockfile` creates `Cargo.lock`. Commit both immediately. The workflows contain a one-time bootstrap fallback for a repository-replacement commit, but all normal protected runs take the locked `npm ci` / Cargo lockfile path.

Rust commands:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets
npm run build:wasm
```

Browser tests:

```bash
npx playwright install --with-deps
npm run test:e2e
```

## Repository layout

```text
apps/web/                  React application
packages/domain/           TypeScript domain model and migrations
packages/print-engine/     browser print planning and booklet imposition
crates/lyricbook-core/     deterministic Rust core
crates/lyricbook-wasm/     wasm-bindgen adapter
crates/lyricbook-cli/      validation and inspection CLI
content/presets/           reviewable built-in content snapshots
themes/                    reusable safe token themes
locales/                   Fluent UI catalogs
docs/                      English developer specifications
docs/zh-CN/                Chinese user documentation
tests/unit/                Vitest tests
tests/e2e/                 Playwright Chromium/Firefox/WebKit/mobile tests
```

## Content and copyright

The repository does **not** distribute copyrighted song lyrics. Built-in presets contain metadata, setlists, sources, empty lyric tracks, and safe theme tokens. Users must only import, store, translate, or print content they are permitted to use. Private project archives, lyric backups, and lyric-bearing PDFs must never be committed.

## Branches and releases

- `main`: production and GitHub Pages.
- `develop`: daily integration.
- `feature/*` and `fix/*`: only for substantial or isolated work.
- `hotfix/*`: production incidents, merged back to both `main` and `develop`.

Every merge to `main` must pass web, Rust, content, browser, accessibility, and print checks. Read [AGENTS.md](AGENTS.md) before using an automated coding agent.

## License

Code is licensed under Apache-2.0. UI catalog and documentation contributions are accepted under the repository license unless a file states otherwise. User-imported lyrics and translations retain their own rights and are not relicensed by LyricBook.

Copyright © 2026 iocky.com.
