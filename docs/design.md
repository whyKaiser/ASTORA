# ASTORA design direction

Arabic roots, calm color and responsive interaction. Original identity and artwork; no third-party store branding or game cover art is embedded.

## Visual system

- Ink/navy surfaces (`#0c141b`, `#111e27`), muted teal and champagne (`#dbc49b`).
- An original arched portal and eight-point geometry, drawn as small local SVGs. Geometry suggests an Arabic visual heritage without depending on a large background image or autoplay video.
- Noto Sans Arabic, bundled under OFL; system Latin font. Text remains real selectable text. No rasterized Arabic headings.
- Logical CSS properties mirror the sidebar and layout between Arabic RTL and English LTR. Technical identifiers and package filenames retain their direction.
- Brief focus, hover and view transitions. One slow opacity/transform accent; animation stops when the page is hidden. Reduced motion is saved locally and follows the OS before an explicit choice.

## Behavior implemented in this preview

- Complete Arabic/English interface dictionaries, including downloads, dialogs and error reports; preference persists.
- Catalog-defined translations are optional. Missing translations retain the catalog author's original text.
- Catalog search index rebuilds only after catalog changes. Search includes both languages and normalizes Arabic diacritics/tatweel and common alef forms.
- Render at most 24 catalog cards. Do not create thousands of offscreen cards. A 5000-entry synthetic catalog was imported through the actual UI for verification.
- Debounce search by 100 ms. Poll transfer state every two seconds on Downloads and every ten elsewhere; stop polling in hidden tabs. Unchanged snapshots do not rebuild download rows.
- No frame-rate or latency claim on PS4. The console renderer remains an engineering gate, not a finished feature.

## Data and storage

The browser stores catalog metadata and preferences. Download bytes are separate. Each catalog is limited to 5000 entries / 2 MiB JSON; the UI accepts at most 30 additional catalogs, subject to browser storage quota. The preview has no remote cover cache. A future native cover cache needs a measured, configurable budget and explicit cleanup.
