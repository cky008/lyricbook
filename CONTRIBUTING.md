# Contributing

Small maintenance changes may be committed directly to `develop`. Use `feature/*` or `fix/*` for larger or higher-risk work, then open a pull request into `develop`. Production releases move from `develop` to `main` through a pull request.

Before committing:

```bash
npm ci
npm run check
git status --short
git diff --check
git diff
```

Stage only intended files, inspect the staged diff, and use Conventional Commits.

Content contributions must include source metadata and must not include copyrighted lyrics or translations without documented redistribution permission. UI translations belong under `locales/<locale>/`.
