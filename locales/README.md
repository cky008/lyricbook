# Localization contributions

LyricBook keeps user-interface translations in one folder per locale:

```text
locales/
├── en-US/main.ftl
└── zh-CN/main.ftl
```

To add a locale, copy `en-US`, translate only the values after `=`, and keep every message key unchanged. Run `npm run validate:repo` and `npm test` before opening a pull request. Missing or extra keys fail CI.

The browser currently ships a synchronous fallback table in `apps/web/src/i18n.ts`; the Fluent files are the reviewable contribution source and are copied into every production build. A later schema-compatible release may load them directly at runtime.
