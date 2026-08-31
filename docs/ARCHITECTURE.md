# Architecture

LyricBook is a static, local-first web application. GitHub Pages serves immutable application assets; user projects remain in the browser unless the user explicitly exports them.

## Boundaries

- `apps/web`: browser UI, IndexedDB, archive handling, theme application, immersive navigation, and print DOM.
- `crates/lyricbook-core`: deterministic data validation and booklet ordering.
- `crates/lyricbook-wasm`: thin WebAssembly bindings.
- `crates/lyricbook-cli`: command-line validation and booklet inspection.
- `content/presets`: metadata-only built-in snapshots.
- `themes`: declarative, allow-listed design tokens.
- `locales`: reviewable UI translations.

Rust owns deterministic domain rules. TypeScript owns browser APIs and visual layout because font metrics and pagination must be measured in the rendering engine.
