# Theme specification

Themes are data-only. Supported tokens include primary/secondary accent, background, surface, strong surface, text, muted text, radius, density, heading/body category, and print paper/accent/text/heading settings. Optional presentation enums select only prewritten surface (`solid` or `glass`), elevation (`flat` or `soft`), and ornament (`none`, `ink-wash`, or `porcelain-line`) treatments.

Allowed values are normalized to inert colors, fixed local/system font stacks, bounded lengths, numbers, and enums. User themes cannot supply JavaScript, arbitrary HTML, arbitrary stylesheets, remote fonts, tracking URLs, data URLs, active SVG, or external images. Unknown fields are removed at import boundaries. For backward compatibility, legacy `assets` strings remain round-trippable inside a complete project but are never rendered or requested; standalone theme imports and exports remove them.

## Crafted catalog

The application exposes five frozen offline catalog entries: Studio Slate, Ink Jade, Porcelain Blue, Cinnabar Silk, and Moonlit Paper. The catalog is virtual for imported and existing projects: viewing it never mutates project data. Selecting an unused catalog entry explicitly copies a sanitized snapshot into the project and activates it; selecting it again does not create duplicates. If an imported project already owns the same id, its stable id and project data win. Direct catalog activation is disabled for that card, the project version remains selectable under Project themes, and the catalog original remains available as the source for “Copy and customize.”

Studio Slate is the canonical default for newly created projects. Projects saved by earlier releases are normalized only when a legacy built-in theme exactly matches a published frozen signature: the former Default and Gloria themes map to Studio Slate, while Kampung Girl maps to Ink Jade. A locally edited legacy theme, an unrelated theme that reuses one of those ids, or a project-owned copy of a current catalog id is preserved. When normalization changes stored project data, the browser creates a local backup before replacing the IndexedDB record.

Catalog originals are read-only. “Copy and customize” creates a new stable project theme id, after which its safe tokens may be edited. Project copies remain self-contained in `.lyricbook` and JSON exports so print output and offline restoration do not depend on the application catalog.

Content and theme packages remain independent so one concert library can be rendered with multiple designs. Theme selection never changes lyrics, versions, tracks, setlists, or sources.
