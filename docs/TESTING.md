# Testing

Run the complete local gate:

```bash
npm ci
npm run check
```

The gate performs syntax checks, lightweight type checks, Node tests, optional Rust tests, repository-structure validation, preset validation, and a production build.

On a Rust-enabled machine also run:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Browser regression tests live under `tests/e2e` and run in GitHub Actions with Chromium, WebKit, and an iPhone profile.
