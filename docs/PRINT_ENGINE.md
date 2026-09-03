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
5. For monolingual tracks, compare preserved line breaks with a slash-joined short-line candidate. Never cross blank stanza or structural-label boundaries, and never apply independent grouping to aligned bilingual tracks.
6. Render the draft in real A4 or A5 millimetre dimensions, wait for local images, fonts, and stable animation frames, then binary-search the largest safe type size.
7. Offer independent parallel columns for an original/translation pair even when old data has no `alignedTo` marker. Use alignment metadata only for row association; keep unrelated three-or-more-track layouts stacked unless a safe explicit grouping exists.
8. Paginate normal long-form content by complete lines when the readable minimum cannot fit. If real 7pt geometry still fails, bisect at a nearby stanza boundary, render again, and recalculate all later page references. Strict mode alone retains the complete unsafe page.
9. Measure contents titles, section headings, optional badges, wrapped entries, gaps, and footer clearance. Try the complete contents at each supported density before creating continuation pages.
10. Recalculate song page numbers after the final contents count, then audit the page, inner region, content, body, local cover image, and footer gap. Unsafe output remains visible for review but cannot be printed.
11. For booklet format, optionally prepend a generated, local-image, or local-image-with-text cover. Generated covers use sanitized theme print tokens and three measurable text regions. Then pad to four and impose logical pages into front/back sheet pairs.

## Booklet printing

The PDF is already imposed. The optional cover is logical page 1 and appears on the right half of the first sheet front after imposition. Local raster covers are decoded, bounded, drawn to a canvas, and re-encoded before they enter project storage; original names and metadata are not retained. Use A4 landscape, duplex, short-edge flip, one PDF page per sheet side, and 100% actual size. Do not ask the printer driver to impose a booklet again.

## Regression invariants

No clipped text, footer collision, missing translation/version, hidden optional status, wrong page order, sparse contents continuation, or broken TOC link. A short song should use the largest safe type size. Normal layouts paginate before they become unreadable and retry after real measurement if estimates are insufficient. Strict page limits may reduce type to 7pt but never delete text; if the complete page is still unsafe, the preview must explain the failure and keep printing disabled. Hidden overflow is never accepted as a successful layout.
