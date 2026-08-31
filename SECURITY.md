# Security Policy

Please report security issues privately through GitHub's security advisory feature. Do not place user lyric archives, credentials, or exploit payloads in public issues.

LyricBook 0.0.1 has no backend and no account system. User content stays in IndexedDB unless the user explicitly exports or imports it. Themes are token-only, URL import is explicit and HTTPS-only, archive paths are validated, and public presets are checked for non-empty lyric tracks.
