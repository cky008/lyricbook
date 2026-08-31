# Deployment

GitHub Pages deploys only from `main` through `.github/workflows/deploy-pages.yml`. The workflow must pass repository validation, content validation, tests, and production build before uploading `dist/`.

Recommended URLs:

- Custom domain: `https://lyricbook.iocky.com/`
- GitHub Pages fallback: `https://cky008.github.io/lyricbook/`

Configure Pages to use GitHub Actions. Add the custom domain in repository Pages settings, then point the `lyricbook` CNAME in Cloudflare to `cky008.github.io`. Keep DNS-only until GitHub issues HTTPS, then optionally enable Cloudflare proxying.
