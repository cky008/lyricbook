# Standalone themes

The current built-in theme gallery is defined in TypeScript and is available entirely offline. This directory remains as the validated package boundary for any future standalone data-only themes; it intentionally contains no theme package in the current release.

Standalone themes must contain only the safe tokens documented in [`docs/THEME_SPEC.md`](../docs/THEME_SPEC.md). They must never contain private lyrics, JavaScript, arbitrary HTML or CSS, remote fonts, active SVG, or tracking URLs.
