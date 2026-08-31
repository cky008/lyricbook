# Security design

LyricBook stores user projects locally and performs no automatic upload. Imports must be explicit and validated before replacing local state.

Security rules include text-only lyric rendering, HTTPS-only URL import, response-size limits, no frontend secrets, no arbitrary theme scripts or CSS, no executable SVG uploads, safe archive paths, no nested archives, and no private content in public presets or logs.

See the root `SECURITY.md` for vulnerability reporting.
