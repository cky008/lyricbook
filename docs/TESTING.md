# Testing

LyricBook uses TDD and multiple layers:

- Vitest: domain, archive, migration, filename, theme, setlist, and print planning.
- Rust tests/proptest: validation, booklet invariants, and deterministic helpers.
- Playwright: Chromium, Firefox, WebKit, iPhone profile, accessibility, overlays, immersive navigation, and print preview.
- Repository/content validators: required files, pinned modern stack, aligned Fluent keys, valid preset references, no React 16/vendor runtime, and no private lyric files.
- Service Worker lifecycle tests: build-specific caches, network-first navigation, previous-build fallback, update checks, and a stale-HTML normal-reload regression.

Print changes follow the synthetic fixture and PDF matrix in [PRINT_REGRESSION_TEST_PLAN.md](PRINT_REGRESSION_TEST_PLAN.md), including measured overflow, footer clearance, text completeness, contents links, strict-limit blocking, and A4/A5/booklet visual checks.

Run:

```bash
npm run check
npm run test:e2e
```

The first dependency installation must create and commit `package-lock.json`.

## End-to-end selector and overlay rules

- Prefer persistent state assertions over duplicated translated copy. Locale tests must verify both `document.documentElement.lang` and `lyricbook-ui-locale` in `localStorage`.
- Scope controls to their active overlay or dialog. Do not use a global accessible-name selector when the backdrop and close button intentionally share a label.
- Closed mobile overlays must be unmounted or inert; an `aria-hidden` container must never retain focusable descendants.
- The visible print preview lives under `.print-preview-shell`; the system-print copy lives under the hidden direct-body `#print-portal`. Visibility assertions target the former, while geometry and attachment assertions may target the latter.
- Immersive navigation tests must force a scrollable fixture, confirm the old song is scrolled, select the next song, and then verify both the title change and a synchronous return to the top.

## Coverage and warning policy

The committed global gates are:

- statements: 70%
- branches: 60%
- functions: 65%
- lines: 70%

Do not lower these numbers, broaden coverage exclusions, or add ignore directives to pass CI. Add tests that execute real behavior and failure paths. Repository validation enforces these minimums. Biome must complete with zero errors and zero warnings; print-specific cascade overrides must be expressed through ordering and specificity rather than blanket lint suppressions.
