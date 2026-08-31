# Deployment

## GitHub Pages

Set Pages source to GitHub Actions. Pushes to `main` run web and Rust quality gates, build `dist`, upload the Pages artifact, and deploy.

The build uses relative asset URLs and includes `public/CNAME` for `lyricbook.iocky.com`.

## Cloudflare

Recommended DNS:

```text
CNAME lyricbook -> cky008.github.io
```

Start DNS-only until GitHub HTTPS is issued, then optionally proxy. Use Full (strict), avoid long-lived `Cache Everything` on `index.html`, `sw.js`, or `version.json`, and purge after releases when necessary.

`frame-ancestors` is ignored in meta CSP. Add it as an HTTP response header, for example:

```text
Content-Security-Policy: frame-ancestors 'none'
```

A broader edge CSP may include `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, and the required app directives.

## Verification

Check `/version.json`, favicon, manifest, locale catalogs, preset index, theme files, and a clean browser session after each deployment.
