# Security design

## Threats

- malicious ZIP paths and decompression bombs;
- unsafe user themes;
- injected lyric HTML;
- remote import tracking or oversized responses;
- leaked AI/service secrets;
- Service Worker caching private data;
- stale overlay scroll locks;
- supply-chain regressions.

## Controls

Archives are bounded and paths validated. Lyrics render as text. Themes are token-only and sanitized. Remote imports require explicit HTTPS URLs and CORS. Local print covers accept only JPEG, PNG, or WebP signatures, enforce byte and decoded-pixel limits, and are canvas re-encoded without original names or metadata before storage; they are never uploaded. No secrets are stored in the frontend. IndexedDB records and private covers are not Service Worker precache entries. Dependencies are pinned and audited in CI. Full-source maps are not emitted in production.
