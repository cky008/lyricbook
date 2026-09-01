# Contributing

Thank you for improving LyricBook. Please read `AGENTS.md` even when you are not using an AI agent; it contains the repository's architecture, privacy, testing, and release invariants.

## Branch model

- `main` is production and deploys GitHub Pages.
- `develop` is the default integration branch for daily work.
- Small fixes and documentation changes may commit directly to `develop`.
- Use `feature/*` or `fix/*` for substantial or risky work.
- Release through a `develop → main` pull request.

## Setup

```bash
nvm use
npm install
rustup show
npm run check
```

The first install generates `package-lock.json`; commit it. Do not hand-edit lockfiles.

## Development

```bash
git switch develop
git pull --ff-only
npm run dev
```

Before committing:

```bash
npm run check
git status --short
git diff --name-status
git diff
```

Stage explicit files for small changes, inspect the staged diff, and use a Conventional Commit message.

## Translations

UI translations are Fluent files in `locales/<locale>/main.ftl`. Copy the English catalog, translate values without renaming keys, and run `npm run validate:repo`. Lyrics and lyric translations are separate from UI localization and may only be contributed with redistribution permission.

## Content presets

Public presets belong under `content/presets/<id>/project.json`. Include metadata, aliases, setlists, source records, confidence, and empty lyric tracks. Do not submit full copyrighted lyrics. Research changes should follow `docs/AI_SETLIST_RESEARCH.md`.

## Pull requests

Explain the user-visible change, privacy impact, data migrations, and test evidence. UI/print work should include screenshots or rendered test artifacts. Do not mix dependency upgrades with unrelated features.
