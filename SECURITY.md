# Security policy

Report private vulnerabilities through GitHub private vulnerability reporting when available. Do not open a public issue containing an exploitable archive, user data, credentials, or a live injection payload.

## Supported version

The latest release on `main` is supported. Pre-release `develop` builds receive best-effort fixes.

## Security model

LyricBook is a static local-first application. The public deployment has no user account, database, or required API. Sensitive data is held in browser storage and explicit export files.

Key controls include safe text rendering, archive path validation, decompression limits, HTTPS-only remote imports, data-only themes, no frontend secrets, no private-data Service Worker caching, and dependency/security workflows.

`frame-ancestors` cannot be enforced by a meta CSP. Configure it as an HTTP response header through Cloudflare or the hosting edge; see `docs/DEPLOYMENT.md`.
