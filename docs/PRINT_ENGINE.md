# Print engine

## Formats

- A4 portrait reading edition
- A5 portrait reading edition
- A4 landscape imposed folded booklet containing A5 logical pages

## Pipeline

1. Select songs by current song, active setlist, filter, or library.
2. Select default/current/all versions.
3. Select original, original+translation, or all tracks.
4. Estimate logical page layout using format, columns, line weights, strategy, and font candidates.
5. Render actual DOM pages with isolated title/content/footer regions.
6. Measure rendered content and reduce type size within a safe minimum if necessary.
7. Build linked contents.
8. For booklet format, optionally prepend a designed cover, pad to four, and impose logical pages into front/back sheet pairs.

## Booklet printing

The PDF is already imposed. The optional cover is logical page 1 and appears on the right half of the first sheet front after imposition. Use A4 landscape, duplex, short-edge flip, one PDF page per sheet side, and 100% actual size. Do not ask the printer driver to impose a booklet again.

## Regression invariants

No clipped text, footer collision, missing translation/version, wrong page order, or broken TOC link. Strict page limit may reduce type but never delete text silently; if a page remains over capacity, the DOM must mark it for test failure.
