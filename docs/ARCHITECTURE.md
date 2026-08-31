# Architecture

## System shape

LyricBook is a static Vite application. React owns interaction and DOM-dependent layout; TypeScript packages own browser domain utilities; Rust owns deterministic, portable validation and booklet logic.

```text
apps/web
  ├─ React 19 function components
  ├─ Radix overlays
  ├─ IndexedDB and File APIs
  ├─ Fluent UI localization
  └─ DOM print measurement

packages/domain
  ├─ Zod project schema
  ├─ setlist parsing
  ├─ legacy migration
  ├─ theme sanitization
  └─ export names

packages/print-engine
  ├─ selection by scope
  ├─ version/track selection
  ├─ logical pagination
  ├─ contents planning
  └─ booklet imposition

crates/lyricbook-core
  ├─ serializable model
  ├─ cross-reference validation
  ├─ filename normalization
  └─ booklet order
```

## Why no backend

All non-AI requirements can run locally. Static delivery reduces operational cost and keeps private lyrics out of server logs. Future paid AI features require a separate backend design and must not weaken the local-only path.

## State

The current project is stored in IndexedDB. Before a replacement, the current value is copied to a bounded backup store. Imported values are validated before the current record changes.

## Build

Vite builds `apps/web` to root `dist`. A custom plugin copies versioned content, themes, locales, generates `version.json`, generates a scoped Service Worker, and emits `404.html`. Assets use a relative base so both custom-domain and project Pages paths work.
