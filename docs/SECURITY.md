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

Archives are bounded and paths validated. Lyrics render as text. Themes are token-only and sanitized. Remote imports require explicit HTTPS URLs and CORS. No secrets are stored in the frontend. IndexedDB records are not Service Worker precache entries. Dependencies are pinned and audited in CI. Full-source maps are not emitted in production.
