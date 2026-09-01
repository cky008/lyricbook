# AI setlist research protocol

This file is designed so an AI agent can receive the repository URL plus an artist/city/date request and produce importable, auditable LyricBook content without guessing silently.

## Inputs

- artist, tour, city, venue, and date;
- user-provided screenshots, lists, notes, or existing project packs;
- public web sources requested by the user.

## Research order

1. Artist official channels.
2. Promoter and venue pages.
3. Official ticketing/event pages.
4. Observed performances from completed dates.
5. Reliable press.
6. Community reports, clearly labelled.
7. User evidence, preserved as a distinct source kind.

## Method

- Record source title, publisher, URL, retrieval time, language, and confidence.
- Preserve exact source song spelling.
- Build title/alias normalization separately.
- Cross-check every song across sources.
- Distinguish confirmed, observed, high-confidence, likely, rotation, encore candidate, and unverified.
- When evidence conflicts, output multiple setlists rather than a false single certainty.
- Include optional sections only when useful; do not invent Acts.
- Never copy full copyrighted lyrics.

## Output

Produce:

```text
project.json
research-summary.md
source-matrix.json
optional theme.json
```

Validate with:

```bash
cargo run -p lyricbook-cli -- validate project.json
node scripts/validate-content.mjs
```

The user can upload the validated project or package it as `.lyricbook`.
