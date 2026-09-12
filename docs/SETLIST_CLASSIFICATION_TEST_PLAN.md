# Setlist classification regression plan

## Intended result

The Shenzhen preparation setlist uses the currently agreed formal programme. Audience requests are optional; `自由的你`, `泡沫`, and `天空没有极限` remain required. The September 11 observed record remains separate, and the old generic example is archived. A preserved lyric library is not a list of promised performances.

## Acceptance matrix

| Boundary | Cases | Required result |
| --- | --- | --- |
| Public preparation preset | All 42 song slots; exclude optional requests | Exactly 3 optional request songs; 39 required entries including the provisional drum mapping; fixed encore titles remain included |
| Historical evidence | Observed record, older generic reference, supplementary video timings | Preserve observed order and stable ids; label history explicitly; retain unresolved cue notes and distinguish user confirmation from official evidence |
| Section inheritance | Sectionless, explicit optional song, optional section, notes/breaks, next required section | Effective optionality is section OR song; only a new section resets inheritance |
| Duplicate appearances | Optional then required, required then optional, all optional | Any required appearance keeps the song in required output; first-seen order is stable |
| Editor and library | Required, optional, inherited optional, library-only, observed status, locale fallback | Clearly localized labels and relevant notes; explicit checkbox state is not confused with inherited state; no songs removed from library |
| Print | A4, A5, folded booklet; include optional on/off | UI and print agree on inclusion; fixed encore remains; TOC labels/links and footer safety remain valid |
| Private archive | Existing recovered library plus current preset | Exact lyric tracks, versions, and library-only songs retained; preset order and optional flags used; original file unchanged; archive read-back succeeds |
| Accessibility/mobile | Chromium, Firefox, WebKit, iPhone; long notes/titles | Visible readable classification, keyboard-accessible controls, no horizontal clipping or stale scroll lock |

Use only invented lyric text in public regressions and screenshots. First demonstrate a meaningful failure, then implement the smallest coherent change. Run the complete repository gate before each signed local commit; do not push or deploy without authorization.

PDF evidence must exercise the final Print / Save PDF action, including its safety audit and format-specific `@page` stylesheet. Calling a browser PDF export immediately after preview alone can use its default paper size. Check the resulting physical PDF dimensions and internal destinations, not only preview geometry.
