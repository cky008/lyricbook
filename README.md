# LyricBook

[![CI](https://github.com/cky008/lyricbook/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/cky008/lyricbook/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml)
[![Full quality](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml)
[![Security](https://github.com/cky008/lyricbook/actions/workflows/security.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/security.yml)
[![License](https://img.shields.io/github/license/cky008/lyricbook)](LICENSE)

[中文说明](README.zh-CN.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

[**🌐 Open LyricBook**](https://lyricbook.iocky.com/) · [GitHub Pages fallback](https://cky008.github.io/lyricbook/) · [View GitHub repository](https://github.com/cky008/lyricbook)

LyricBook is a privacy-first, local-first concert lyric-book and printable-PDF web application. It keeps user lyrics in the browser, separates reusable themes from content, and supports versioned concert setlists without requiring a backend.

> Version `0.0.1` is the first public bootstrap release. It establishes the data model, local project archives, presets, bilingual UI, immersive setlist navigation, browser printing, Rust domain crates, tests, and GitHub Pages delivery. Native booklet imposition, LRC import, cloud backup, and AI-assisted research remain tracked work.

## Live site

- Production: **https://lyricbook.iocky.com/**
- GitHub Pages fallback: **https://cky008.github.io/lyricbook/**
- Repository: **https://github.com/cky008/lyricbook**

The badges above show the latest CI, production deployment, browser-quality, and scheduled security workflow status.

## Repository layout

- `apps/web` — browser application and print UI
- `crates/lyricbook-core` — deterministic Rust domain model and validation
- `crates/lyricbook-wasm` — browser adapter
- `crates/lyricbook-cli` — validation and booklet CLI
- `content/presets` — reviewable metadata-only presets
- `themes` — safe token-based themes
- `locales` — reviewable English and Simplified Chinese UI translations
- `tests` — archive, data, booklet, repository, and Playwright tests
- `docs` — architecture, data, security, print, deployment, and AI-research guidance

## Local development

```bash
npm ci
npm run check
npm run dev
```

Open `http://127.0.0.1:4173`.

Rust checks are run when a Rust toolchain is installed:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Data and copyright

Public presets contain metadata, ordering, source references, and empty lyric tracks only. Do not commit user backups, copyrighted lyrics, translated lyrics without redistribution permission, private PDFs, or exported `.lyricbook` archives.

Copyright © 2026 iocky.com. Code is licensed under Apache-2.0 unless a file states otherwise.
