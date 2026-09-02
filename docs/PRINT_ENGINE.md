# Print engine

## Formats

- A4 portrait reading edition
- A5 portrait reading edition
- A4 landscape imposed folded booklet containing A5 logical pages

## Pipeline

1. Select songs by current song, active setlist, filter, or library.
2. Select default/current/all versions.
3. Select original, original+translation, or all tracks.
4. Build a pure-data draft that records language-track columns separately from balanced text columns.
5. Render the draft in real A4 or A5 millimetre dimensions, wait for fonts and two stable animation frames, then binary-search the largest safe type size.
6. Keep aligned bilingual tracks parallel, stack independent tracks, and preserve clear version boundaries.
7. Paginate normal long-form content by complete lines when the readable minimum cannot fit; keep every line in its original order.
8. Measure contents titles, section headings, wrapped entries, gaps, and footer clearance. Try the complete contents at each supported density before creating continuation pages.
9. Recalculate song page numbers after the final contents count, then audit the page, inner region, content, body, and footer gap. Unsafe strict-limit output remains visible for review but cannot be printed.
10. For booklet format, optionally prepend a designed cover, pad to four, and impose logical pages into front/back sheet pairs.

## Booklet printing

The PDF is already imposed. The optional cover is logical page 1 and appears on the right half of the first sheet front after imposition. Use A4 landscape, duplex, short-edge flip, one PDF page per sheet side, and 100% actual size. Do not ask the printer driver to impose a booklet again.

## Regression invariants

No clipped text, footer collision, missing translation/version, wrong page order, sparse contents continuation, or broken TOC link. A short song should use the largest safe type size. Normal layouts paginate before they become unreadable. Strict page limits may reduce type to 7pt but never delete text; if the complete page is still unsafe, the preview must explain the failure and keep printing disabled. Hidden overflow is never accepted as a successful layout.
