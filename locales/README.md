# Localization catalogs

LyricBook keeps reviewable Fluent-style catalogs in this directory so that a locale is represented by a real tracked file rather than an empty directory.

- `en-US/main.ftl` is the English reference catalog.
- `zh-CN/main.ftl` is the Simplified Chinese catalog.
- Both catalogs must expose the same message keys.

The 0.0.1 browser bundle still carries a small built-in message map in `apps/web/src/i18n.ts`. The catalogs are the contribution surface and the migration target for the fuller Fluent runtime tracked in `ROADMAP.md`. When UI copy changes, update both the runtime map and these catalogs in the same pull request.
