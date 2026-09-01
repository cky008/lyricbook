# Toolchain policy

LyricBook 0.0.6 continues the modern-runtime baseline introduced in 0.0.5. The exact toolchain is recorded in `package.json`, `rust-toolchain.toml`, and `toolchain.json`; protected CI and release workflows must use the committed `package-lock.json` and `Cargo.lock` after the one-time repository bootstrap commit.

## Pinned baseline

| Layer | Version | Role |
|---|---:|---|
| Node.js | 26.8.1 | CI and local JavaScript runtime |
| npm | 12.0.2 | reproducible dependency installation |
| React / React DOM | 19.2.8 | application runtime |
| React Compiler | 1.0.0 | compile-time React optimization |
| Babel core | 8.0.1 | compiler pipeline |
| `@rolldown/plugin-babel` | 0.2.3 | Babel integration for Vite 8 |
| Vite | 8.2.2 | development server and production bundler |
| TypeScript | 7.0.2 | strict type checking |
| Tailwind CSS / Vite plugin | 4.3.3 | utility CSS and design-token build |
| Radix UI | 1.6.7 | accessible headless UI primitives |
| Biome | 2.5.11 | formatting and linting |
| Vitest | 4.1.11 | unit tests and coverage |
| Playwright | 1.62.1 | Chromium, Firefox, WebKit, mobile, accessibility, and print regression |
| Rust | 1.98.0, edition 2024 | deterministic domain core, CLI, and WASM adapter |
| wasm-bindgen | 0.2.127 | Rust/JavaScript bindings |
| wasm-pack | 0.15.0 | reproducible browser WASM packaging |

## React Compiler integration

Vite uses the current plugin-react 6 integration:

```ts
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

plugins: [
  react(),
  babel({ presets: [reactCompilerPreset()] }),
];
```

The removed legacy inline `react({ babel: ... })` option must not return. React Compiler must run before other Babel transforms.

## Reproducibility

- All direct JavaScript dependencies use exact versions.
- `package-lock.json` and `Cargo.lock` are mandatory before the first normal pull request or release. CI contains a bootstrap-only fallback so a full repository replacement can generate them once.
- CI, Pages, and Release use `npm ci`; they do not silently fall back to `npm install`.
- `rust-toolchain.toml` pins Rust and the WebAssembly target.
- `toolchain.json` is machine-readable documentation and is checked against package metadata.
- Dependency changes belong in a dedicated commit and must update this file, lockfiles, workflows where applicable, and `CHANGELOG.md`.

## Upgrade policy

1. Verify the candidate version using an official project release page or package registry.
2. Review browser and Node/Rust minimum requirements.
3. Update exact pins and regenerate both lockfiles.
4. Run format, lint, type checks, unit/Rust tests, content/repository validation, WASM build, production build, and the Playwright matrix.
5. Validate A4, A5, and imposed-booklet output plus iPhone/WebKit overlay scrolling.
6. Keep the prior deployable tag available for rollback.

Do not use canary, nightly, beta, `latest`, caret, tilde, wildcard, or mutable Git dependencies on the production branch unless an approved architecture decision explicitly requires them.
