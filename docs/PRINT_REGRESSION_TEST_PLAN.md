# Print regression test plan

## Purpose

This plan defines the release-blocking checks for adaptive lyric sizing, pagination, contents pages, and folded-booklet output. All fixtures use invented text and must remain safe to publish. Tests must exercise the same DOM and font-measurement path used by the visible preview and the system-print portal.

## Required invariants

- Every printed page has distinct title, content, and footer safety regions.
- Content must fit both vertically and horizontally and remain separated from the footer.
- Short lyrics use the largest safe type within the selected format's supported range.
- Long lyrics continue on additional pages before dropping below the strategy's readable minimum.
- Strict page limits never delete or hide text. If the complete content cannot fit at the emergency minimum, printing remains disabled and the preview explains why.
- Single-version songs omit a redundant version heading; multi-version songs keep explicit labels.
- Original, translation, transliteration, and adaptation tracks remain attached to their version.
- The ability to print original and translation tracks side by side does not depend on legacy alignment metadata. `alignedTo` controls row association, not whether two independent columns are available.
- Contents entries remain unique, ordered, linked to each song's first page, and numbered after the final contents page count is known.
- Optional sections and optional songs remain visibly labelled in contents, and their badges participate in the same DOM measurement as the final preview.
- Generated covers use the active theme's safe print palette and three explicit header, copy, and detail regions; long cover text must not depend on clipping.
- A4 folded-booklet output uses measured A5 logical pages before imposition and preserves the existing short-edge-flip order.

## Sanitized fixture matrix

| Case | Fixture | Expected behavior |
| --- | --- | --- |
| Short monolingual | Six short invented lines | One page; type is near the format maximum; no footer collision |
| Many short lines | Eighty uniquely marked short invented lines | Automatic slash flow uses a larger safe type size than preserved line breaks; every marker appears exactly once |
| Medium monolingual | Forty-eight mixed-length lines and stanza gaps | One or two balanced text columns at a readable size |
| Long monolingual | Numbered lines with unique first/last markers | Multiple pages when required; every marker appears exactly once |
| Extreme strict limit | More text than one page can hold at 7pt | Complete text remains present; preview is unsafe; print action is disabled |
| CJK | Chinese, Japanese, and Korean invented lines | Correct wrapping without horizontal overflow or missing glyphs |
| Long title | Long CJK and unbroken Latin titles | Wrapped title stays inside the title region and does not reduce footer safety |
| Unbroken lyric | A single synthetic Unicode line longer than one page | Split only at Unicode code-point boundaries; every character remains present and normal printing becomes safe |
| Aligned bilingual | Equal original and translation line counts with `alignedTo` | Associated rows stay together and retain both labels |
| Independent bilingual | Unequal original and translation line counts without `alignedTo` | A4 first attempts independent parallel columns; A5 and booklet choose a measured safe layout; each track remains complete |
| Multiple tracks | Original, translation, transliteration, and adaptation | Tracks are grouped or paginated without overlap or loss |
| Multiple versions | Two invented versions with distinct markers | Version headings are retained and each version's text stays separate |
| Booklet cover | Long CJK/Latin title, near-limit summary, and tiny generated JPEG/PNG/WebP fixtures | Generated cover uses theme-safe regions; image-only and image-with-text modes render locally; invalid signatures are rejected; persisted data has no source file name |
| Sectionless setlist | Songs without Part/Act records | A valid contents page uses the fallback section label |
| Representative contents | Thirty-four songs in five sections, including an optional section and an optional song | One safe contents page when the selected format can contain it; optional badges remain visible without forcing a sparse continuation |
| Large contents | Long section names, long song titles, and enough entries for continuation | The smallest safe column count is used; continuation pages are dense and ordered |

Run every applicable fixture as A4, A5, and A4 folded booklet. The booklet cases must also verify padding to a multiple of four logical pages and the first sheet's front/back order.

## Automated checks

### Unit tests

- Verify track selection, layout candidates, line-preserving pagination, and format-specific font bounds.
- Verify contents weighting, column selection, continuation boundaries, and page-number offsets.
- Verify optional status from both section and song items, including a duplicated song that also has a required appearance.
- Verify no text marker is lost or duplicated while splitting tracks or versions.
- Verify strict-limit plans report an unsafe result instead of truncating content.
- Verify a normal page that still fails real 7pt measurement is bisected, measured again, and followed by recalculated contents links.

### Browser tests

Seed IndexedDB with sanitized projects before application startup. After `document.fonts.ready` and two animation frames, inspect both the visible preview and `body > #print-portal`.

For every logical page assert:

- `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth` for the page, inner region, and content region;
- the content bottom remains above the footer top;
- no overflow or unsafe marker remains on a printable plan;
- the computed lyric font matches the plan and short lyrics are materially above the minimum;
- first/last and per-page text markers remain complete;
- contents links target the first page of their song and displayed page numbers match the final plan.
- independent original/translation columns have distinct horizontal positions on A4 and every marker remains present exactly once;
- generated cover header, copy, and detail rectangles are ordered, non-overlapping, and inside the logical page.

Run the suite in Chromium, Firefox, WebKit, and the iPhone project. The iPhone run must also confirm that closing the print dialog restores document scrolling.

## PDF evidence

Generate sanitized A4, A5, and folded-booklet PDFs from the production build. For each file:

1. use `pdfinfo` to verify page size, orientation, and page count;
2. inspect link annotations with `pypdf`;
3. render every page with `pdftoppm`;
4. visually inspect short and long songs, independent and aligned bilingual pages, multi-version pages, CJK, optional contents badges, the generated cover, footers, and booklet imposition;
5. retain the local evidence outside tracked source and never include private lyrics.

## Release gate

The focused regression must fail against the defective implementation before the fix is written. Do not commit that failing state. Before every commit, run the repository matrix from `AGENTS.md`; print changes additionally require the complete browser suite and the PDF checks above. Any clipped text, hidden overflow, sparse contents continuation, broken link, missing track, or footer collision blocks release.
