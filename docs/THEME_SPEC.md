# Theme specification

Themes are declarative records with localized names and an allow-listed token object. Version `0.0.1` accepts:

- `accent`
- `background`
- `surface`
- `text`
- `radius`

Themes must not contain JavaScript, arbitrary HTML, arbitrary CSS, remote fonts, or tracking resources. The browser applies tokens as CSS custom properties. Print-specific tokens may be added only through a schema revision and validation tests.
