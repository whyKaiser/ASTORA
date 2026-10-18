# ASTORA design direction

Arabic roots, calm color and responsive interaction. The flame logo was supplied for ASTORA; the original bitmap is preserved. No third-party store branding or game cover art is embedded.

## Visual system

- Black, red (`#c42522`) and gold (`#e3b559`) drawn from the supplied logo. The current native surface is near-black (`#08090c`) with a subdued red glow. Version 0.5.0 removes the sand/light mode at the user’s request, including its selection in the desktop foundation.
- Sadu-inspired woven bands, small original SVG accents. The previous architectural arch and eight-point emblem are removed. The Arabic character comes from textile-like patterns and typography.
- The supplied logo appears as a complete identity tile, browser icon and opening preview. A CSS viewport shows its flame in the sidebar. The source PNG is unchanged. The exported icon has been verified on the actual PS4 home screen; see `branding/identity.json`.
- The app always starts dark, including when older local storage contains a sand preference. No light-mode control remains.
- Noto Sans Arabic, bundled under OFL; system Latin font. Text remains real selectable text. No rasterized Arabic headings.
- Logical CSS properties mirror the sidebar and layout between Arabic RTL and English LTR. Technical identifiers and package filenames retain their direction.
- Native 0.5.0 adds brief focus/card/art transitions and two slow ambient transform/opacity effects, with a Sadu weave accent. No looping video is fetched. Hidden pages pause animations; reduced motion disables them and is saved locally. The sidebar mirrors for Arabic/English, and SVG navigation icons avoid missing-font glyphs.

## Behavior implemented in this preview

- Complete Arabic/English interface dictionaries, including downloads, dialogs and error reports; preference persists.
- Catalog-defined translations are optional. Missing translations retain the catalog author's original text.
- Catalog search index rebuilds only after catalog changes. Search includes both languages and normalizes Arabic diacritics/tatweel and common alef forms.
- Render at most 24 catalog cards. Do not create thousands of offscreen cards. A 5000-entry synthetic catalog was imported through the actual UI for verification.
- Debounce search by 100 ms. Poll transfer state every two seconds on Downloads and every ten elsewhere; stop polling in hidden tabs. Unchanged snapshots do not rebuild download rows.
- No frame-rate or latency claim on PS4. The native renderer has actual-console evidence; measured frame rate and large-library console testing remain open.

## Data and storage

The browser stores catalog metadata and preferences. Download bytes are separate. Each catalog is limited to 5000 entries / 2 MiB JSON; the UI accepts at most 30 additional catalogs, subject to browser storage quota. The preview has no remote cover cache. A future native cover cache needs a measured, configurable budget and explicit cleanup.
