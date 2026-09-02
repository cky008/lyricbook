# Localization catalogs

LyricBook keeps reviewable Fluent-style catalogs in this directory so that a locale is represented by a real tracked file rather than an empty directory.

- `en-US/main.ftl` is the English reference catalog.
- `zh-CN/main.ftl` is the Simplified Chinese catalog.
- Both catalogs must expose the same message keys.

The browser loads the selected catalog at runtime through `apps/web/src/lib/i18n.tsx`. Keep both catalogs aligned and update them together whenever UI copy changes.
