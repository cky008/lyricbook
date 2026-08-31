# AGENTS.md

## Mission

Build LyricBook as a privacy-first, local-first concert lyric-book editor, immersive reader, and print tool. The production app must remain usable without a backend and must never bundle private or unlicensed lyrics.

## Repository boundaries

- `apps/web`: browser UI, IndexedDB, archive handling, DOM measurement, printing, service worker.
- `crates/lyricbook-core`: deterministic schemas, validation, normalization, migration, filename rules, booklet ordering.
- `crates/lyricbook-wasm`: thin browser bindings only.
- `crates/lyricbook-cli`: validation and research-content tooling.
- `content/presets`: metadata-only, source-attributed, reviewable presets.
- `themes`: declarative allow-listed design tokens; no scripts, arbitrary HTML, or remote trackers.

## Required development order

Use TDD: specification → failing test → minimal implementation → refactor → regression test → documentation. Do not implement a feature before its observable behavior and failure modes are written down.

## Branching

- `main`: production, deployable, protected.
- `develop`: normal integration branch.
- `feature/*` and `fix/*`: only for larger or risky isolated changes; merge into `develop`.
- `hotfix/*`: branch from `main`, merge to `main`, then sync to `develop`.
- `release/*`: optional stabilization only; do not create one for every small change.

## Commits

Use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`, `chore:`, `release:`. One coherent topic per commit. Inspect `git diff` and `git diff --cached` before committing. Stage explicit files for small changes instead of `git add .`.

## Privacy and copyright

Never commit:

- user `.lyricbook` archives or browser exports;
- complete copyrighted lyrics or unauthorized translations;
- private print PDFs;
- AI provider keys, access tokens, or personal logs;
- imported images containing private metadata.

Public presets may contain titles, aliases, tags, setlist positions, confidence, and sources. Lyric tracks must remain empty unless redistribution rights are documented.

## Security invariants

- Render lyrics as text, never raw HTML.
- Reject unsafe archive paths, oversized entries, nested archives, executable SVG, arbitrary CSS, and JavaScript themes.
- URL import must be explicit, HTTPS-only, size-limited, schema-validated, and CORS-compatible.
- Import into a temporary value, validate it, then replace local data atomically.
- Never place AI secrets in frontend code.
- Production UI must not expose debug panels, build logs, test controls, or stack traces.

## UI and accessibility

- Support English and Simplified Chinese UI independently from lyric-track language.
- Preserve keyboard navigation, visible focus, semantic labels, reduced motion, safe-area insets, and mobile scrolling.
- Any overlay or drawer must release `html` and `body` scroll locks on every close path, including iOS sequence regressions.
- Immersive mode follows the active setlist. Moving to the next song resets the reader to the top and preserves a previous-song route.

## Print invariants

- Separate title, content, and footer/page-number safety regions.
- Never hide overflow as a substitute for pagination.
- Test CJK, long English tokens, bilingual tracks, multiple versions, optional sections, no-section setlists, and long titles.
- Browser DOM measurement owns visual pagination; Rust may own deterministic booklet ordering but not font-height measurement.
- PDF-related changes require A4, A5, and booklet regression evidence before release.

## Data compatibility

- Schema changes require a version bump and migration tests.
- Song IDs and source IDs are stable identifiers.
- Original, translation, transliteration, and adaptation are tracks inside a lyric version.
- Mandarin, Cantonese, studio, live, acoustic, and rewritten lyrics are separate versions of one song.
- Setlist sections are optional.

## Required checks

Before a normal commit:

```bash
npm run check
```

On a machine with Rust:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Before a production release, also run Playwright on Chromium and WebKit, verify the built site, inspect mobile scroll recovery, and validate public presets contain no lyric text.

## Git safety

Do not run destructive Git commands, force-push, delete branches, merge, tag, publish, or deploy unless the user explicitly requests that action. Never replace the entire `.github` directory when only workflow files should change.

## Repository completeness

Tracked source releases must include non-empty `locales/` and `docs/` trees. Before packaging or deployment, run `npm run validate:repo`; do not work around a missing directory by making the build silently skip it. The source archive must be extracted into a clean temporary directory and pass `npm ci && npm run check` before it is shared. README live-site links and workflow badges are part of the validated public surface.
