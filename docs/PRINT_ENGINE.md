# Print engine

The browser owns visual pagination because layout depends on actual fonts, language, viewport, and browser metrics. Rust may calculate deterministic saddle-stitch page ordering after logical pages have been produced.

Every printable page must reserve separate title, content, and footer/page-number regions. Hiding overflow is never an acceptable pagination strategy.

Regression fixtures should cover short and long lyrics, CJK wrapping, long English tokens, bilingual tracks, multiple versions, optional sections, no-section setlists, A4, A5, and booklet output.
