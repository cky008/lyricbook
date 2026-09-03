# AGENTS.md

## 1. Purpose and scope

This file is the mandatory operating contract for AI coding agents working in `cky008/lyricbook`. It applies to the whole repository unless a deeper directory contains a more specific `AGENTS.md`.

LyricBook is a privacy-first, local-first concert lyric-book editor and printable booklet generator. It is a separate project from `cky008/gem-lyricbook`; do not mix their histories, release numbers, build artifacts, or private user data.

## 2. Non-negotiable product constraints

- The non-AI product must remain a static browser application with no required backend.
- User lyrics, translations, project archives, local backups, and printed PDFs are private by default.
- Built-in public presets may include metadata, source citations, ordering, confidence, and empty lyric tracks, but must not include unauthorized full lyrics.
- UI language and lyric language are separate concepts.
- A song may contain multiple versions; each version may contain original, translation, transliteration, and adaptation tracks.
- Setlist sections are optional. Never require Part/Act records.
- The active setlist drives immersive previous/next navigation.
- Production UI must not expose debug panels, test controls, stack traces, build paths, or internal developer notes.
- Themes are data-only safe tokens. Never execute theme JavaScript, arbitrary HTML, arbitrary CSS, remote fonts, or active SVG supplied by users.

## 3. Current pinned toolchain

Version 0.0.8 uses the pinned toolchain below:

- Node.js 26.8.1 and npm 12.0.2
- React and React DOM 19.2.8
- Vite 8.2.2, `@vitejs/plugin-react` 6.1.1, and `@rolldown/plugin-babel` 0.2.3
- TypeScript 7.0.2
- Tailwind CSS and `@tailwindcss/vite` 4.3.3
- React Compiler 1.0.0
- Babel 8.0.1 through `@rolldown/plugin-babel` 0.2.3
- Radix unified package 1.6.7
- Biome 2.5.11
- Vitest 4.1.11
- Playwright 1.62.1
- Rust 1.98.0, edition 2024
- wasm-pack 0.15.0, wasm-bindgen 0.2.127, and cargo-audit 0.22.2

Do not silently downgrade dependencies or restore vendored React. Upgrades require official-source verification, a dedicated commit, regenerated lockfiles, and the complete test matrix.

`package-lock.json` and `Cargo.lock` must be committed immediately after the first bootstrap install. Workflows may use `npm install` / `cargo generate-lockfile` only when validating the single repository-replacement bootstrap commit; once the lockfiles exist, every protected CI and release run must take the locked `npm ci` path.

Forbidden runtime patterns:

- `window.React`
- `ReactDOM.render`
- locally vendored `react.production.min.js`
- locally vendored `react-dom.production.min.js`
- React 16 compatibility shims

## 4. Architecture boundaries

### TypeScript/browser responsibilities

- React UI and accessible Radix overlays
- IndexedDB persistence and atomic replacement
- `.lyricbook` ZIP import/export and browser file APIs
- actual DOM/font measurement for printing
- Service Worker and PWA integration
- theme CSS variables
- mobile and iOS interaction behavior

### Rust responsibilities

- canonical serializable domain structures
- deterministic validation and normalization
- setlist/song reference invariants
- export filename normalization
- booklet imposition ordering
- CLI and WASM adapters

Do not move browser font measurement into Rust. Do not duplicate deterministic validation rules in ad-hoc UI code without corresponding domain tests.

## 5. TDD workflow

For every behavior change:

1. Write or update a failing unit, Rust, or Playwright test.
2. Confirm the failure represents the intended requirement.
3. Implement the smallest complete change.
4. Run the focused test.
5. Run the full required matrix before completion.
6. Update user and developer documentation when behavior, data, deployment, or workflows change.

Tests must cover failure paths, not only happy paths.

Coverage gates are product requirements, not optional CI tuning. Do not lower the committed global thresholds, remove production files from coverage, add blanket ignore comments, or introduce exceptions merely to make CI pass. Increase coverage with behavior-focused tests. The Web quality gate must finish with zero Biome errors and zero Biome warnings.

## 6. Required test matrix

Before merging application code:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run validate:content
npm run validate:repo
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets
npm run build:wasm
npm run build
```

For changes touching UI, overlays, storage, imports, reading, printing, themes, or routing:

```bash
npm run test:e2e
npm run check:offline
npm audit --audit-level=high
cargo audit
```

Print changes additionally require fixtures for short, long, bilingual, multi-version, CJK, long-title, sectionless, A4, A5, and booklet cases. Check for text clipping, footer collision, missing tracks, incorrect booklet order, and broken TOC links.

## 7. iOS and overlay invariants

- Opening a dialog from a mobile sidebar must close the sidebar first.
- Closing the final overlay must restore `body` and `html` scrolling and preserve the prior scroll position.
- No stale backdrop or `overflow: hidden` may remain.
- Immersive mode must scroll a newly selected song to the top.
- The next-song action must follow the active setlist, not library order.
- Never rely on hover-only controls.

Maintain Playwright coverage using a WebKit/iPhone project for these paths.

## 8. Print invariants

- A page has separate title, content, and footer safety regions.
- Text must never overlap the page number/footer.
- Single-version songs do not print a meaningless `Default` heading.
- Multi-version songs retain explicit version labels.
- Translation tracks remain associated with their version.
- Strict page limits may reduce typography but must never silently delete text.
- A4 folded booklet output is already imposed; instructions must say duplex, short-edge flip, 100% scale, one PDF page per sheet side.
- TOC entries should link to the first page of each song when supported by the PDF browser.
- Optional sections and songs must remain visibly distinct in the TOC, and those labels must be included in layout measurement.
- Original and translation tracks may use independent parallel columns even when migrated data has no row-alignment marker; do not use `alignedTo` as the sole layout gate.
- Generated covers must use sanitized theme print tokens and measurable safety regions. Do not clip long cover text to make a page appear valid.

## 9. Data and migration rules

- Preserve stable song, version, setlist, theme, and source ids.
- Never mutate imported data before validation succeeds.
- Project replacement must create a local backup first.
- Failed import must leave the current project unchanged.
- Continue to support the documented G.E.M. v4 migration path using sanitized test fixtures only.
- File names must include UTC date, time, milliseconds, and a random suffix.
- Public test fixtures must contain invented or authorized sample text, never user lyrics.

## 10. Security rules

- Render lyrics as text, never unsanitized HTML.
- Reject ZIP path traversal, nested archives, excessive file counts, and excessive expanded size.
- Accept remote import only after explicit user action and only over HTTPS.
- Never place AI provider secrets in frontend code.
- Do not send analytics, crash reports, or user content unless an explicit future opt-in design is approved.
- Do not cache private imported content in the Service Worker.
- `frame-ancestors` belongs in an HTTP response header, not a meta CSP.
- External links require `rel="noopener noreferrer"`.

## 11. Content research protocol

When an agent is asked to research an artist or concert:

1. Confirm artist, tour, city, date, and venue.
2. Prefer artist, promoter, venue, official ticketing, and observed performance sources.
3. Record source URL, publisher, retrieval time, language, and confidence.
4. Preserve source spelling and build aliases separately.
5. Incorporate user screenshots and notes as explicit user-provided sources.
6. Distinguish confirmed, observed, high-confidence, likely, rotation, encore candidate, and unverified entries.
7. Produce multiple candidate setlists when evidence conflicts.
8. Validate every song id and source reference.
9. Do not scrape or redistribute full copyrighted lyrics.
10. Run the CLI or repository validators before delivering an import pack.

See `docs/AI_SETLIST_RESEARCH.md`.

## 12. Git branches

- `main`: production, stable, deployable.
- `develop`: daily development and integration.
- Small low-risk work may commit directly to `develop` after local checks.
- `feature/*`: substantial features isolated from `develop`.
- `fix/*`: non-emergency bug fixes isolated from `develop`.
- `hotfix/*`: production incidents branched from `main`; merge to `main` and back to `develop`.
- `release/*`: optional only when a release freeze is genuinely needed.

Do not create a new branch for every tiny documentation edit. Do not develop directly on `main`.

## 13. Commit conventions

Use Conventional Commits:

- `feat:` feature
- `fix:` bug fix
- `docs:` documentation
- `test:` test-only change
- `refactor:` behavior-preserving refactor
- `ci:` workflow change
- `build:` toolchain/build change
- `chore:` maintenance
- `release:` release preparation

Keep one coherent topic per commit. Before committing:

```bash
git status --short
git diff --name-status
git diff
git diff --cached --name-status
git diff --cached --check
```

For small changes, stage explicit paths instead of `git add .`.

Each commit must contain a complete behavior slice: its implementation, regression coverage, and directly affected documentation. Do not create WIP commits or commit a known-red test. Run the complete required matrix against the exact working tree immediately before every commit, sign the commit with the configured SSH signing key, and verify the resulting commit object locally. When a user authorizes a push, push only the named non-`main` branch and wait for every triggered GitHub check to finish before reporting success.

## 14. Destructive Git operations

Agents must not commit, push, force-push, merge, rebase, delete branches, reset hard, clean files, rewrite history, publish releases, or deploy unless the user explicitly requests that exact action. Never replace the entire `.github` directory when only workflow files are intended; preserve issue templates, Dependabot, and pull-request templates.

## 15. Documentation language

- Developer and AI-facing docs default to English.
- User-facing Chinese docs live in `README.zh-CN.md` and `docs/zh-CN/`.
- Keep Fluent `en-US` and `zh-CN` keys aligned.
- Update `README`, `CHANGELOG`, data/theme specs, deployment docs, and user guides when relevant.

## 16. Release checklist

Before a release:

- version is synchronized across package metadata, Cargo workspace, `version.json`, Service Worker cache, CHANGELOG, and docs;
- dependency versions and lockfiles are current;
- no private data or generated local projects are tracked;
- full web, Rust, browser, accessibility, content, and print checks pass;
- GitHub Pages artifact is tested over HTTP;
- favicon, manifest, locale, preset, theme, and version URLs return 200;
- README badges point to existing workflow names;
- release archives pass ZIP integrity and SHA-256 verification.

## 17. Definition of done

A task is not complete because code was written. It is complete only when requirements are implemented, tests pass, privacy and copyright constraints hold, docs are updated, production UI contains no developer leakage, generated artifacts actually exist, and all delivery links have been verified.
