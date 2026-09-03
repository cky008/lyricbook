# Deployment

## GitHub Pages

Set Pages source to GitHub Actions. Pushes to `main` run web and Rust quality gates, build `dist`, upload the Pages artifact, and deploy.

The build uses relative asset URLs and includes `public/CNAME` for `lyricbook.iocky.com`. Each production build derives an immutable content ID for its scope-isolated Service Worker cache and publishes the same ID in `version.json`. Only completely precached builds receive a completion marker and qualify as the previous-build fallback. Navigation uses a no-store network-first request, while immutable assets use cache-first lookup across the current and immediately previous completed build. This lets an already open page finish loading its old hashes while a normal reload adopts the current HTML.

## Cloudflare

Recommended DNS:

```text
CNAME lyricbook -> cky008.github.io
```

Start DNS-only until GitHub HTTPS is issued, then optionally proxy. Use Full (strict). Configure `index.html`, `/`, `404.html`, `sw.js`, and `version.json` for revalidation or no-store behavior; never apply long-lived `Cache Everything` to those paths. Hashed `/assets/` files may be cached immutably. Purge entry documents after releases when necessary.

`frame-ancestors` is ignored in meta CSP. Add it as an HTTP response header, for example:

```text
Content-Security-Policy: frame-ancestors 'none'
```

A broader edge CSP may include `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, and the required app directives.

## Verification

Check `/version.json`, favicon, manifest, locale catalogs, preset index, theme files, and a clean browser session after each deployment. Fetch the deployed HTML without cache, resolve every referenced script and stylesheet, and verify a successful status plus JavaScript/CSS MIME type. Then test an ordinary reload, a restored tab, and an offline reload; a hard refresh must not be required.
