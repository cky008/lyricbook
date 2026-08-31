# Testing

LyricBook uses TDD and multiple layers:

- Vitest: domain, archive, migration, filename, theme, setlist, and print planning.
- Rust tests/proptest: validation, booklet invariants, and deterministic helpers.
- Playwright: Chromium, Firefox, WebKit, iPhone profile, accessibility, overlays, immersive navigation, and print preview.
- Repository/content validators: required files, pinned modern stack, aligned Fluent keys, valid preset references, no React 16/vendor runtime, and no private lyric files.

Run:

```bash
npm run check
npm run test:e2e
```

The first dependency installation must create and commit `package-lock.json`.
